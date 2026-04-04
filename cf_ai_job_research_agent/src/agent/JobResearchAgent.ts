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

// ─── Schemas ──────────────────────────────────────────────────────────────────

const intentSchema = z.object({
  intent: z.enum(["analyze-job", "view-history", "view-saved-entry", "chat"]),
  entryId: z.string().optional(),
});

const extractSchema = z.object({
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/** Extract the [view-entry:<id>] tag the sidebar injects, or null. */
function extractViewEntryTag(text: string): string | null {
  const match = text.match(/^\[view-entry:([^\]]+)\]/);
  return match ? match[1] : null;
}

async function classifyIntent(
  model: LanguageModel,
  lastUserText: string,
  savedEntries: ResearchEntry[],
  abortSignal: AbortSignal | undefined,
): Promise<z.infer<typeof intentSchema>> {
  const viewTag = extractViewEntryTag(lastUserText);
  if (viewTag) {
    return { intent: "view-saved-entry", entryId: viewTag };
  }

  if (!lastUserText.trim()) {
    return { intent: "chat" };
  }

  const savedSummary =
    savedEntries.length > 0
      ? savedEntries
          .map((e) => `• [id:${e.id}] ${e.jobTitle} at ${e.company}`)
          .join("\n")
      : "None saved yet.";

  try {
    const { object } = await generateObject({
      model,
      schema: intentSchema,
      system: `You are an intent classifier for a job research assistant.

Saved research entries:
${savedSummary}

Classify the user's message into exactly one intent:
- "analyze-job": the message contains or is a job posting/description (usually multi-line, describes a role, requirements, responsibilities).
- "view-history": the user wants a list or summary of all their saved research.
- "view-saved-entry": the user is asking to see a specific saved entry from the list above. If matched, also return its id in entryId.
- "chat": anything else (follow-up questions, greetings, general conversation).

Rules:
- If the message starts with [view-entry:<id>] always return view-saved-entry with that id.
- Do NOT classify job postings as "chat" even if they contain words like "history" or "culture".
- A job posting usually has: job title, responsibilities, requirements, compensation, or company description.`,
      prompt: lastUserText,
      abortSignal,
    });
    return object;
  } catch {
    return { intent: "chat" };
  }
}

async function runAnalysis(
  model: LanguageModel,
  input: z.infer<typeof extractSchema>,
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
    console.error("runAnalysis failed:", err);
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

// ─── Agent ────────────────────────────────────────────────────────────────────

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
    const savedEntries = (this.state?.researches ?? []) as ResearchEntry[];

    // ── Classify intent ──────────────────────────────────────────────────────
    const { intent, entryId } = await classifyIntent(
      model,
      lastUser,
      savedEntries,
      abortSignal,
    );

    // ── view-saved-entry: replay stored card instantly, no LLM call ──────────
    if (intent === "view-saved-entry") {
      const entry = savedEntries.find((e) => e.id === entryId);

      if (!entry?.analysis) {
        return streamText({
          model,
          system:
            "You are a job application research assistant. The requested saved research could not be found. Ask the user to paste the job posting again.",
          messages: modelMessages,
          abortSignal,
          onFinish,
        }).toUIMessageStreamResponse({ originalMessages: uiMessages });
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
            input: { jobTitle: entry.jobTitle, company: entry.company, jobDescription: "" },
            providerExecuted: true,
          });
          writer.write({
            type: "tool-output-available",
            toolCallId,
            output: entry.analysis,
            providerExecuted: true,
          });

          const followUp = streamText({
            model,
            system: "You are a concise career coach.",
            messages: [
              {
                role: "user",
                content: `Here is the saved research for ${entry.jobTitle} at ${entry.company}. Write one sentence acknowledging this and ask what the user would like to explore further about this role.`,
              },
            ],
            abortSignal,
            onFinish,
          });
          writer.merge(
            followUp.toUIMessageStream({ sendStart: false, sendFinish: true }),
          );
        },
      });

      return createUIMessageStreamResponse({ stream });
    }

    // ── view-history: plain text list from state ─────────────────────────────
    if (intent === "view-history") {
      const researches = savedEntries;
      return streamText({
        model,
        system: `You are a job application research assistant. The user asked about their saved research. Here is the saved list as JSON (may be empty):\n${JSON.stringify(researches.map((r) => ({ company: r.company, jobTitle: r.jobTitle, timestamp: r.timestamp, summary: r.summary })), null, 2)}\n\nList each entry clearly with company, job title, and how long ago it was saved. If empty, say nothing has been saved yet. Be concise.`,
        messages: modelMessages,
        abortSignal,
        onFinish,
      }).toUIMessageStreamResponse({ originalMessages: uiMessages });
    }

    // ── chat: general conversational reply ───────────────────────────────────
    if (intent === "chat") {
      return streamText({
        model,
        system: `You are a helpful job application research assistant. You help users analyze job postings, understand companies, and prepare for interviews. The user can paste a job description to get a detailed analysis. They currently have ${savedEntries.length} saved research${savedEntries.length === 1 ? "" : "es"}.`,
        messages: modelMessages,
        abortSignal,
        onFinish,
      }).toUIMessageStreamResponse({ originalMessages: uiMessages });
    }

    // ── analyze-job: extract → analyze → save/update → stream card ───────────
    const stream = createUIMessageStream({
      originalMessages: uiMessages,
      execute: async ({ writer }) => {
        writer.write({ type: "start" });

        // Fix 4: immediate user-visible feedback before slow model calls
        const loadingTextId = crypto.randomUUID();
        writer.write({ type: "text-start", id: loadingTextId });
        writer.write({
          type: "text-delta",
          id: loadingTextId,
          delta: "Extracting role details — this takes about 20 seconds…",
        });
        writer.write({ type: "text-end", id: loadingTextId });

        // Extract structured fields from the job posting
        let extracted: z.infer<typeof extractSchema>;
        try {
          const { object } = await generateObject({
            model,
            schema: extractSchema,
            system: `Extract job title, company name, and the full job description from the user's message. Use "Unknown company" only if the company cannot be determined. jobDescription must preserve the substantive posting text.`,
            prompt: lastUser,
            abortSignal,
          });
          extracted = object;
        } catch (err) {
          console.error("Job extraction failed:", err);
          const errTextId = crypto.randomUUID();
          writer.write({ type: "text-start", id: errTextId });
          writer.write({
            type: "text-delta",
            id: errTextId,
            delta: "I couldn't parse this as a job posting. Please paste the full job title, company, and description.",
          });
          writer.write({ type: "text-end", id: errTextId });
          writer.write({ type: "finish", finishReason: "stop" });
          return;
        }

        if (!extracted.jobDescription.trim()) {
          const noDescId = crypto.randomUUID();
          writer.write({ type: "text-start", id: noDescId });
          writer.write({
            type: "text-delta",
            id: noDescId,
            delta: "No job description was found in your message. Please paste the full posting including the role details.",
          });
          writer.write({ type: "text-end", id: noDescId });
          writer.write({ type: "finish", finishReason: "stop" });
          return;
        }

        const analysis = await runAnalysis(model, extracted, abortSignal);

        // Fix 3: deduplicate — update if same company+title already saved
        try {
          const current = (this.state?.researches ?? []) as ResearchEntry[];
          const summary = `${extracted.jobTitle} at ${extracted.company}: ${analysis.companyOverview.slice(0, 140)}${analysis.companyOverview.length > 140 ? "…" : ""}`;
          const existingIdx = current.findIndex(
            (r) =>
              r.company.toLowerCase() === extracted.company.toLowerCase() &&
              r.jobTitle.toLowerCase() === extracted.jobTitle.toLowerCase(),
          );

          let updated: ResearchEntry[];
          if (existingIdx >= 0) {
            updated = current.map((r, i) =>
              i === existingIdx
                ? { ...r, analysis, summary, timestamp: new Date().toISOString() }
                : r,
            );
          } else {
            const entry: ResearchEntry = {
              id: crypto.randomUUID(),
              company: extracted.company,
              jobTitle: extracted.jobTitle,
              summary,
              timestamp: new Date().toISOString(),
              analysis,
            };
            updated = [...current, entry];
          }
          await this.setState({ researches: updated });
        } catch (err) {
          console.error("persist research failed:", err);
        }

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
          commentary.toUIMessageStream({ sendStart: false, sendFinish: true }),
        );
      },
    });

    return createUIMessageStreamResponse({ stream });
  }
}
