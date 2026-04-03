import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import type { Connection } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import {
  streamText,
  generateObject,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type LanguageModel,
  type UIMessage,
} from "ai";
import { z } from "zod";
import type { AgentState, JobAnalysis, ResearchEntry } from "../client/types";

const analyzeSchema = z.object({
  jobTitle: z.string(),
  company: z.string(),
  jobDescription: z.string(),
});

const analysisSchema = z.object({
  companyOverview: z.string(),
  roleExpectations: z.string(),
  cultureSignals: z.string(),
  potentialRedFlags: z.string(),
  questionsToAsk: z.array(z.string()).min(5),
  positioningTips: z.string(),
});

function getLastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const parts = m.parts ?? [];
    const texts = parts
      .filter(
        (p): p is { type: "text"; text: string } =>
          p.type === "text" && typeof (p as { text?: string }).text === "string",
      )
      .map((p) => p.text);
    const joined = texts.join("\n").trim();
    if (joined) return joined;
  }
  return "";
}

function wantsResearchHistoryHint(text: string): boolean {
  return /\b(history|saved research|past research|what did i save|show me my|previous research|research list|getresearchhistory)\b/i.test(
    text,
  );
}

async function analyzeJobPosting(
  model: LanguageModel,
  input: z.infer<typeof analyzeSchema>,
  abortSignal: AbortSignal | undefined,
): Promise<JobAnalysis> {
  try {
    const { object } = await generateObject({
      model,
      schema: analysisSchema,
      system: `You are an expert career advisor. Analyze the job posting provided and return detailed, specific insights grounded entirely in the content given. No generic advice. Every field must contain multiple sentences. questionsToAsk must be specific to this exact role and company — minimum 5 questions.`,
      prompt: `Job Title: ${input.jobTitle}\nCompany: ${input.company}\nJob Description: ${input.jobDescription}`,
      abortSignal,
    });
    return object as JobAnalysis;
  } catch (err) {
    console.error("analyzeJobPosting failed:", err);
    return {
      companyOverview: "Analysis unavailable — please try again.",
      roleExpectations: "Analysis unavailable — please try again.",
      cultureSignals: "Analysis unavailable — please try again.",
      potentialRedFlags: "Analysis unavailable — please try again.",
      questionsToAsk: ["Could not generate questions — please retry."],
      positioningTips: "Analysis unavailable — please try again.",
    } satisfies JobAnalysis;
  }
}

export class JobResearchAgent extends AIChatAgent<Env, AgentState> {
  initialState: AgentState = { researches: [] };

  onError(connectionOrError: Connection | unknown, error?: unknown): void {
    console.error("WebSocket error:", error ?? connectionOrError);
  }

  async onChatMessage(
    onFinish: Parameters<AIChatAgent<Env, AgentState>["onChatMessage"]>[0],
    options?: OnChatMessageOptions,
  ) {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const model = workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    const abortSignal = options?.abortSignal;
    const uiMessages = this.messages as UIMessage[];
    const lastUser = getLastUserText(uiMessages);
    const modelMessages = await convertToModelMessages(uiMessages);

    if (wantsResearchHistoryHint(lastUser)) {
      const researches = (this.state?.researches ?? []) as ResearchEntry[];
      return streamText({
        model,
        system: `You are a job application research assistant. The user asked about saved research. Here is the saved list as JSON (may be empty):\n${JSON.stringify(researches, null, 2)}\n\nSummarize what is saved, or say nothing is saved yet. Be concise.`,
        messages: modelMessages,
        abortSignal,
        onFinish,
      }).toUIMessageStreamResponse({ originalMessages: uiMessages });
    }

    if (!lastUser.trim()) {
      return streamText({
        model,
        system:
          "You are a job application research assistant. Ask the user to paste a job description or posting.",
        messages: modelMessages,
        abortSignal,
        onFinish,
      }).toUIMessageStreamResponse({ originalMessages: uiMessages });
    }

    let extracted: z.infer<typeof analyzeSchema>;
    try {
      const { object } = await generateObject({
        model,
        schema: analyzeSchema,
        system: `Extract job title, company name, and the full job description from the user's message. Use "Unknown company" only if the company cannot be determined. jobDescription must preserve the substantive posting text.`,
        prompt: lastUser,
        abortSignal,
      });
      extracted = object;
    } catch (err) {
      console.error("Job extraction failed:", err);
      return streamText({
        model,
        system:
          "You are a job application research assistant. The user message could not be parsed as a job posting. Ask them to paste the full title, company, and description.",
        messages: modelMessages,
        abortSignal,
        onFinish,
      }).toUIMessageStreamResponse({ originalMessages: uiMessages });
    }

    if (!extracted.jobDescription.trim()) {
      return streamText({
        model,
        system:
          "You are a job application research assistant. No clear job description was found. Ask the user to paste the full posting.",
        messages: modelMessages,
        abortSignal,
        onFinish,
      }).toUIMessageStreamResponse({ originalMessages: uiMessages });
    }

    const analysis = await analyzeJobPosting(model, extracted, abortSignal);

    try {
      const current = (this.state?.researches ?? []) as ResearchEntry[];
      const summary = `${extracted.jobTitle} at ${extracted.company}: ${analysis.companyOverview.slice(0, 140)}${analysis.companyOverview.length > 140 ? "…" : ""}`;
      const entry: ResearchEntry = {
        id: crypto.randomUUID(),
        company: extracted.company,
        jobTitle: extracted.jobTitle,
        summary,
        timestamp: new Date().toISOString(),
      };
      await this.setState({ researches: [...current, entry] });
    } catch (err) {
      console.error("persist research failed:", err);
    }

    const stream = createUIMessageStream({
      originalMessages: uiMessages,
      execute: async ({ writer }) => {
        writer.write({ type: "start" });
        const toolCallId = crypto.randomUUID();
        writer.write({
          type: "tool-input-start",
          toolCallId,
          toolName: "analyzeJobPosting",
          providerExecuted: true,
        });
        writer.write({
          type: "tool-input-available",
          toolCallId,
          toolName: "analyzeJobPosting",
          input: extracted,
          providerExecuted: true,
        });
        writer.write({
          type: "tool-output-available",
          toolCallId,
          output: analysis,
          providerExecuted: true,
        });

        const commentary = streamText({
          model,
          system: "You are a concise career coach.",
          messages: [
            {
              role: "user",
              content: `Job: ${extracted.jobTitle} at ${extracted.company}.\n\nResearch excerpt:\n${analysis.companyOverview.slice(0, 600)}\n\nWrite 2–3 short sentences on the single most important insight for the applicant. Be specific. Do not repeat JSON or section headings.`,
            },
          ],
          abortSignal,
          onFinish,
        });
        writer.merge(
          commentary.toUIMessageStream({
            sendStart: false,
            sendFinish: true,
          }),
        );
      },
    });

    return createUIMessageStreamResponse({ stream });
  }
}
