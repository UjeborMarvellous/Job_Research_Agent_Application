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

const fullAnalysisSchema = z.object({
  jobTitle: z.string(),
  company: z.string(),
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

const JOB_KEYWORDS = [
  "responsibilities",
  "qualifications",
  "requirements",
  "experience",
  "salary",
  "compensation",
  "apply",
  "role",
  "position",
  "team",
  "benefits",
  "skills",
  "candidate",
  "hiring",
  "job description",
];

/**
 * Fast heuristic: if the message is long and contains multiple job-related
 * keywords, it is almost certainly a job posting. Skipping the LLM-based
 * intent classifier saves a full ~5 s round-trip for the most common path.
 */
function looksLikeJobPosting(text: string): boolean {
  if (text.length < 300) return false;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of JOB_KEYWORDS) {
    if (lower.includes(kw)) hits++;
    if (hits >= 2) return true;
  }
  return false;
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

/**
 * Scan the message thread backwards for the last assistant turn that contained
 * an analyzeJobPosting tool part, then look up the matching ResearchEntry so
 * the chat branch can inject full analysis context into its system prompt.
 *
 * Returns:
 *   - A full ResearchEntry (with analysis) when Tier 1 is possible.
 *   - A stub entry (analysis is null) when the conversation has context but
 *     the entry was not persisted — Tier 2 still fires from conversation history.
 *   - null when there is no prior job context at all.
 */
function getConversationJobContext(
  uiMessages: UIMessage[],
  savedEntries: ResearchEntry[],
): ResearchEntry | null {
  for (let i = uiMessages.length - 1; i >= 0; i--) {
    const m = uiMessages[i];
    if (m.role !== "assistant") continue;
    for (const part of m.parts ?? []) {
      if (
        typeof part.type === "string" &&
        part.type === "tool-analyzeJobPosting" &&
        (part as { input?: { company?: string; jobTitle?: string } }).input
      ) {
        const input = (
          part as { input: { company?: string; jobTitle?: string } }
        ).input;
        const company = input.company ?? "";
        const jobTitle = input.jobTitle ?? "";
        const match = savedEntries.find(
          (e) =>
            e.company.toLowerCase() === company.toLowerCase() &&
            e.jobTitle.toLowerCase() === jobTitle.toLowerCase(),
        );
        if (match) return match;
        // Conversation context exists but entry not in state — return stub for Tier 2
        return {
          id: "",
          company,
          jobTitle,
          summary: "",
          timestamp: "",
          analysis: null as unknown as ResearchEntry["analysis"],
        };
      }
    }
  }
  return null;
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

    // ── Classify intent (heuristic fast-path for obvious job postings) ─────
    const { intent, entryId } = looksLikeJobPosting(lastUser)
      ? { intent: "analyze-job" as const, entryId: undefined }
      : await classifyIntent(model, lastUser, savedEntries, abortSignal);

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

    // ── chat: context-aware conversational reply ─────────────────────────────
    if (intent === "chat") {
      const ctx = getConversationJobContext(uiMessages, savedEntries);

      let system: string;

      if (ctx?.analysis) {
        // Tier 1 — full structured analysis in state: give the model everything
        system = `You are an expert career coach helping a job applicant.
You have already analyzed the following role for them:

Role: ${ctx.jobTitle} at ${ctx.company}

Company Overview:
${ctx.analysis.companyOverview}

Role Expectations:
${ctx.analysis.roleExpectations}

Culture Signals:
${ctx.analysis.cultureSignals}

Potential Red Flags:
${ctx.analysis.potentialRedFlags}

How to Position Yourself:
${ctx.analysis.positioningTips}

Questions to Ask the Interviewer:
${ctx.analysis.questionsToAsk.join("\n")}

The user is asking a follow-up question about this role. Answer specifically using the research above. Be conversational and practical. Do not repeat section headings or restate the full analysis — focus on what the user actually asked.`;
      } else if (ctx) {
        // Tier 2 — conversation context exists but no stored analysis
        // (e.g. analysis failed, or entry was not persisted); model can still
        // read the raw job text from the conversation history.
        system = `You are an expert career coach helping a job applicant.
Earlier in this conversation you discussed a role: ${ctx.jobTitle} at ${ctx.company}.
Read the full conversation history carefully and answer the user's follow-up question based on what was said. Be specific and practical. Do not say you cannot see the conversation — it is fully available to you in the message history.`;
      } else {
        // Tier 3 — no prior job context at all
        system = `You are a helpful job application research assistant. You help users analyze job postings, understand companies, and prepare for interviews. The user can paste a job description to get a detailed analysis. They currently have ${savedEntries.length} saved research${savedEntries.length === 1 ? "" : "es"}.`;
      }

      return streamText({
        model,
        system,
        messages: modelMessages,
        abortSignal,
        onFinish,
      }).toUIMessageStreamResponse({ originalMessages: uiMessages });
    }

    // ── analyze-job: single combined extract+analyze → save → stream card ────
    const stream = createUIMessageStream({
      originalMessages: uiMessages,
      execute: async ({ writer }) => {
        writer.write({ type: "start" });

        let result: z.infer<typeof fullAnalysisSchema>;
        try {
          const { object } = await generateObject({
            model,
            schema: fullAnalysisSchema,
            system: `You are an expert career advisor. From the user's message, extract the job title and company name, then produce a detailed, specific analysis grounded entirely in the content given. Use "Unknown company" only if the company truly cannot be determined. No generic advice. Every field must contain multiple sentences. questionsToAsk must be specific to this exact role and company — minimum 5 questions.`,
            prompt: lastUser,
            abortSignal,
          });
          result = object;
        } catch (err) {
          console.error("Job analysis failed:", err);
          const errTextId = crypto.randomUUID();
          writer.write({ type: "text-start", id: errTextId });
          writer.write({
            type: "text-delta",
            id: errTextId,
            delta: "I couldn't analyze this as a job posting. Please paste the full job title, company, and description.",
          });
          writer.write({ type: "text-end", id: errTextId });
          writer.write({ type: "finish", finishReason: "stop" });
          return;
        }

        const { jobTitle, company, ...analysis } = result;

        // Deduplicate — update if same company+title already saved
        try {
          const current = (this.state?.researches ?? []) as ResearchEntry[];
          const summary = `${jobTitle} at ${company}: ${analysis.companyOverview.slice(0, 140)}${analysis.companyOverview.length > 140 ? "…" : ""}`;
          const existingIdx = current.findIndex(
            (r) =>
              r.company.toLowerCase() === company.toLowerCase() &&
              r.jobTitle.toLowerCase() === jobTitle.toLowerCase(),
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
              company,
              jobTitle,
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
          input: { jobTitle, company },
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
              content: `Job: ${jobTitle} at ${company}.\n\nResearch excerpt:\n${analysis.companyOverview.slice(0, 600)}\n\nWrite 2–3 short sentences on the single most important insight for the applicant. Be specific. Do not repeat JSON or section headings.`,
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
