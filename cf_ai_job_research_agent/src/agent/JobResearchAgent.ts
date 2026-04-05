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
import type { AgentState, ResearchEntry } from "../client/types";
import { beginAgentStep, endAgentStep, runAgentStep } from "./agentSteps";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const intentSchema = z.object({
  intent: z.enum([
    "analyze-job",
    "view-history",
    "view-saved-entry",
    "generate-document",
    "chat",
  ]),
  entryId: z.string().optional(),
  documentType: z.enum(["cover-letter", "email", "cv-tips"]).optional(),
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

/** Explicit caps — Workers AI / SDK defaults can stop generations early (cut-off replies). */
const OUT = {
  classify: 256,
  sidebarTitle: 128,
  streamShort: 1536,
  streamReply: 4096,
  documentHtml: 8192,
  jobAnalysisJson: 8192,
} as const;

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

/** Detect the [resume-upload:<fileName>] tag from the client. */
function extractResumeUploadTag(text: string): { fileName: string; resumeText: string } | null {
  const match = text.match(/^\[resume-upload:([^\]]+)\]\s*([\s\S]*)$/);
  return match ? { fileName: match[1], resumeText: match[2].trim() } : null;
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
  if (extractResumeUploadTag(lastUserText)) {
    return { intent: "chat" };
  }

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
      maxOutputTokens: OUT.classify,
      schema: intentSchema,
      system: `You are an intent classifier for a job research assistant.

Saved research entries:
${savedSummary}

Classify the user's message into exactly one intent:
- "analyze-job": the message contains or is a job posting/description (usually multi-line, describes a role, requirements, responsibilities).
- "view-history": the user wants a list or summary of all their saved research.
- "view-saved-entry": the user is asking to see a specific saved entry from the list above. If matched, also return its id in entryId.
- "generate-document": the user is requesting a document be generated — a cover letter, email draft, or CV/resume improvement tips. If matched, also return documentType as "cover-letter", "email", or "cv-tips".
- "chat": anything else (follow-up questions, greetings, general conversation).

Rules:
- If the message starts with [view-entry:<id>] always return view-saved-entry with that id.
- Do NOT classify job postings as "chat" even if they contain words like "history" or "culture".
- A job posting usually has: job title, responsibilities, requirements, compensation, or company description.
- If the user asks to write/draft/generate a cover letter, email, or resume tips, classify as "generate-document".`,
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

const sidebarTitleSchema = z.object({
  title: z.string().min(2).max(55),
});

type ChatOnFinish = Parameters<AIChatAgent<Env, AgentState>["onChatMessage"]>[0];

function clipSidebarTitle(s: string, max = 55): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function shouldRunLlmSidebarTitle(lastUser: string): boolean {
  const t = lastUser.trim();
  if (!t) return false;
  if (extractResumeUploadTag(t)) return false;
  if (extractViewEntryTag(t)) return false;
  return true;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export class JobResearchAgent extends AIChatAgent<Env, AgentState> {
  initialState: AgentState = {
    researches: [],
    resumeText: undefined,
    resumeFileName: undefined,
    sidebarTitle: undefined,
  };

  private async persistSidebarTitle(title: string): Promise<void> {
    const clipped = clipSidebarTitle(title);
    if (!clipped) return;
    try {
      await this.setState({ ...this.state, sidebarTitle: clipped });
    } catch (e) {
      console.error("persistSidebarTitle:", e);
    }
  }

  private async llmSidebarTitleFromUser(
    model: LanguageModel,
    lastUser: string,
    threadHint: string | undefined,
    abortSignal: AbortSignal | undefined,
  ): Promise<void> {
    if (this.state.sidebarTitle?.trim()) return;
    if (!shouldRunLlmSidebarTitle(lastUser)) return;
    try {
      const { object } = await generateObject({
        model,
        maxOutputTokens: OUT.sidebarTitle,
        schema: sidebarTitleSchema,
        system: `You label a chat thread for a sidebar list. Output one field "title" only.
Rules:
- 3 to 8 words, max 55 characters.
- Summarize the user's topic or intent in neutral professional language.
- Do NOT copy-paste or quote the user's wording.
- No quotation marks.`,
        prompt: threadHint
          ? `Thread context: ${threadHint}\n\nLatest user message:\n${lastUser.slice(0, 1800)}`
          : `Latest user message:\n${lastUser.slice(0, 2000)}`,
        abortSignal,
      });
      await this.persistSidebarTitle(object.title);
    } catch {
      /* ignore */
    }
  }

  private withSidebarTitleAfterStream(
    base: ChatOnFinish,
    model: LanguageModel,
    lastUser: string,
    threadHint: string | undefined,
    abortSignal: AbortSignal | undefined,
  ): ChatOnFinish {
    return (async (evt) => {
      await base(evt);
      await this.llmSidebarTitleFromUser(model, lastUser, threadHint, abortSignal);
    }) as ChatOnFinish;
  }

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

    // ── Resume upload: store and confirm without LLM classification ────────
    const resumeTag = extractResumeUploadTag(lastUser);
    if (resumeTag) {
      try {
        const fileLabel =
          resumeTag.fileName.length > 36
            ? `${resumeTag.fileName.slice(0, 33)}…`
            : resumeTag.fileName;
        await this.setState({
          ...this.state,
          resumeText: resumeTag.resumeText,
          resumeFileName: resumeTag.fileName,
          sidebarTitle: clipSidebarTitle(`Resume: ${fileLabel}`),
        });
      } catch (err) {
        console.error("Failed to store resume:", err);
      }

      return streamText({
        model,
        maxOutputTokens: OUT.streamShort,
        system: "You are a job application research assistant. The user just uploaded their resume. Confirm you received it and briefly mention you can now help with cover letters, email drafts, and CV tips tailored to their experience. Be concise (2–3 sentences).",
        messages: [
          {
            role: "user",
            content: `I uploaded my resume: ${resumeTag.fileName}`,
          },
        ],
        abortSignal,
        onFinish,
      }).toUIMessageStreamResponse({ originalMessages: uiMessages });
    }

    // ── Orchestrated turn: classify + intent branches in one UI stream ────────
    const stream = createUIMessageStream({
      originalMessages: uiMessages,
      execute: async ({ writer }) => {
        writer.write({ type: "start" });

        const jobHeuristic = looksLikeJobPosting(lastUser);
        let classified!: z.infer<typeof intentSchema>;
        await runAgentStep(
          writer,
          jobHeuristic ? "Detected job posting" : "Understanding your request",
          async () => {
            classified = jobHeuristic
              ? { intent: "analyze-job" as const, entryId: undefined, documentType: undefined }
              : await classifyIntent(model, lastUser, savedEntries, abortSignal);
          },
        );

        const { intent, entryId, documentType } = classified;

        // ── view-saved-entry ────────────────────────────────────────────────
        if (intent === "view-saved-entry") {
          const entry = savedEntries.find((e) => e.id === entryId);

          if (!entry?.analysis) {
            const replyStep = beginAgentStep(writer, "Writing reply");
            const wrappedFinish = this.withSidebarTitleAfterStream(
              onFinish,
              model,
              lastUser,
              "User tried to open saved research that was not found",
              abortSignal,
            );
            const st = streamText({
              model,
              maxOutputTokens: OUT.streamShort,
              system:
                "You are a job application research assistant. The requested saved research could not be found. Ask the user to paste the job posting again.",
              messages: modelMessages,
              abortSignal,
              onFinish: async (evt) => {
                endAgentStep(writer, replyStep, true);
                await wrappedFinish(evt);
              },
            });
            writer.merge(
              st.toUIMessageStream({ sendStart: false, sendFinish: true }),
            );
            return;
          }

          await runAgentStep(writer, "Loading saved research", async () => {
            await this.persistSidebarTitle(`${entry.jobTitle} at ${entry.company}`);
          });

          const replayToolId = crypto.randomUUID();
          writer.write({
            type: "tool-input-start",
            toolCallId: replayToolId,
            toolName: "analyzeJobPosting",
            providerExecuted: true,
          });
          writer.write({
            type: "tool-input-available",
            toolCallId: replayToolId,
            toolName: "analyzeJobPosting",
            input: {
              jobTitle: entry.jobTitle,
              company: entry.company,
              jobDescription: "",
            },
            providerExecuted: true,
          });
          writer.write({
            type: "tool-output-available",
            toolCallId: replayToolId,
            output: entry.analysis,
            providerExecuted: true,
          });

          const followStep = beginAgentStep(writer, "Writing reply");
          const followUp = streamText({
            model,
            maxOutputTokens: OUT.streamShort,
            system: "You are a concise career coach.",
            messages: [
              {
                role: "user",
                content: `Here is the saved research for ${entry.jobTitle} at ${entry.company}. Write one sentence acknowledging this and ask what the user would like to explore further about this role.`,
              },
            ],
            abortSignal,
            onFinish: async (evt) => {
              endAgentStep(writer, followStep, true);
              await onFinish(evt);
            },
          });
          writer.merge(
            followUp.toUIMessageStream({ sendStart: false, sendFinish: true }),
          );
          return;
        }

        // ── view-history ────────────────────────────────────────────────────
        if (intent === "view-history") {
          const researches = savedEntries;
          const listStep = beginAgentStep(writer, "Listing saved roles");
          const wrappedFinish = this.withSidebarTitleAfterStream(
            onFinish,
            model,
            lastUser,
            "User asked about their saved job research list",
            abortSignal,
          );
          const st = streamText({
            model,
            maxOutputTokens: OUT.streamReply,
            system: `You are a job application research assistant. The user asked about their saved research. Here is the saved list as JSON (may be empty):\n${JSON.stringify(researches.map((r) => ({ company: r.company, jobTitle: r.jobTitle, timestamp: r.timestamp, summary: r.summary })), null, 2)}\n\nList each entry clearly with company, job title, and how long ago it was saved. If empty, say nothing has been saved yet. Be concise.`,
            messages: modelMessages,
            abortSignal,
            onFinish: async (evt) => {
              endAgentStep(writer, listStep, true);
              await wrappedFinish(evt);
            },
          });
          writer.merge(
            st.toUIMessageStream({ sendStart: false, sendFinish: true }),
          );
          return;
        }

        // ── chat ─────────────────────────────────────────────────────────────
        if (intent === "chat") {
          const ctx = getConversationJobContext(uiMessages, savedEntries);
          const resumeText = (this.state as AgentState)?.resumeText;
          const resumeSnippet = resumeText
            ? `\n\nThe user's resume (extracted text, use to personalise advice):\n${resumeText.slice(0, 3000)}`
            : "";

          let system: string;

          if (ctx?.analysis) {
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
${resumeSnippet}

The user is asking a follow-up question about this role. Answer specifically using the research above. Be conversational and practical. Do not repeat section headings or restate the full analysis — focus on what the user actually asked.`;
          } else if (ctx) {
            system = `You are an expert career coach helping a job applicant.
Earlier in this conversation you discussed a role: ${ctx.jobTitle} at ${ctx.company}.
Read the full conversation history carefully and answer the user's follow-up question based on what was said. Be specific and practical. Do not say you cannot see the conversation — it is fully available to you in the message history.${resumeSnippet}`;
          } else {
            system = `You are a helpful job application research assistant. You help users analyze job postings, understand companies, and prepare for interviews. The user can paste a job description to get a detailed analysis. They currently have ${savedEntries.length} saved research${savedEntries.length === 1 ? "" : "es"}.${resumeSnippet}`;
          }

          const threadHint = ctx?.analysis
            ? `Follow-up about ${ctx.jobTitle} at ${ctx.company}`
            : ctx
              ? `Discussion referencing ${ctx.jobTitle} at ${ctx.company}`
              : undefined;

          if (ctx?.analysis || ctx || resumeText) {
            await runAgentStep(writer, "Loading saved context", async () => {
              await Promise.resolve();
            });
          }

          const writingStep = beginAgentStep(writer, "Writing reply");
          const wrappedFinish = this.withSidebarTitleAfterStream(
            onFinish,
            model,
            lastUser,
            threadHint,
            abortSignal,
          );
          const st = streamText({
            model,
            maxOutputTokens: OUT.streamReply,
            system,
            messages: modelMessages,
            abortSignal,
            onFinish: async (evt) => {
              endAgentStep(writer, writingStep, true);
              await wrappedFinish(evt);
            },
          });
          writer.merge(
            st.toUIMessageStream({ sendStart: false, sendFinish: true }),
          );
          return;
        }

        // ── generate-document ───────────────────────────────────────────────
        if (intent === "generate-document") {
          const ctx = getConversationJobContext(uiMessages, savedEntries);
          const resumeText = (this.state as AgentState)?.resumeText;

          const jobContext = ctx?.analysis
            ? `Role: ${ctx.jobTitle} at ${ctx.company}\nCompany Overview: ${ctx.analysis.companyOverview}\nRole Expectations: ${ctx.analysis.roleExpectations}\nPositioning Tips: ${ctx.analysis.positioningTips}`
            : ctx
              ? `Role: ${ctx.jobTitle} at ${ctx.company}`
              : "";

          const resumeContext = resumeText
            ? `\n\nCandidate's Resume:\n${resumeText.slice(0, 4000)}`
            : "";

          const docType = documentType ?? "cover-letter";
          const docLabel =
            docType === "cover-letter"
              ? "Cover Letter"
              : docType === "email"
                ? "Application Email"
                : "CV Improvement Tips";

          const docTitle = ctx
            ? `${docLabel} — ${ctx.jobTitle} at ${ctx.company}`
            : docLabel;

          const systemPrompts: Record<string, string> = {
            "cover-letter": `You are a professional cover letter writer. Write a compelling, personalized cover letter for the candidate applying to this role. Use their resume details and the job analysis to tailor every paragraph. Output the cover letter in clean HTML (use <p>, <strong>, <em>, <br> tags). Do NOT include any preamble or explanation — output ONLY the cover letter HTML.`,
            email: `You are a professional email drafter. Write a concise, professional application email for the candidate to send when applying to this role. Use their resume and the job analysis to personalize it. Output the email in clean HTML (use <p>, <strong>, <em>, <br> tags). Do NOT include any preamble — output ONLY the email HTML.`,
            "cv-tips": `You are an expert CV/resume consultant. Based on the job requirements and the candidate's current resume, provide specific, actionable tips to improve their CV for this exact role. Format as HTML with headings (<h3>), bullet lists (<ul><li>), and bold text (<strong>) for key points. Do NOT include preamble — output ONLY the tips HTML.`,
          };

          await runAgentStep(writer, "Gathering job and resume context", async () => {
            await Promise.resolve();
          });

          const genToolId = crypto.randomUUID();
          writer.write({
            type: "tool-input-start",
            toolCallId: genToolId,
            toolName: "generateDocument",
            providerExecuted: true,
          });
          writer.write({
            type: "tool-input-available",
            toolCallId: genToolId,
            toolName: "generateDocument",
            input: { documentType: docType, title: docTitle },
            providerExecuted: true,
          });

          const result = streamText({
            model,
            maxOutputTokens: OUT.documentHtml,
            system: `${systemPrompts[docType] ?? systemPrompts["cover-letter"]}\n\nJob Context:\n${jobContext}${resumeContext}`,
            messages: [
              {
                role: "user",
                content: lastUser,
              },
            ],
            abortSignal,
          });

          const chunks: string[] = [];
          for await (const chunk of result.textStream) {
            chunks.push(chunk);
          }
          const fullContent = chunks.join("");

          await this.persistSidebarTitle(docTitle);

          writer.write({
            type: "tool-output-available",
            toolCallId: genToolId,
            output: { content: fullContent, format: "html" },
            providerExecuted: true,
          });

          const docReplyStep = beginAgentStep(writer, "Writing reply");
          const commentary = streamText({
            model,
            maxOutputTokens: OUT.streamShort,
            system: "You are a concise career coach.",
            messages: [
              {
                role: "user",
                content: `You just generated a ${docLabel} for the user. Write 1-2 short sentences telling them their document is ready and they can click "Open in Editor" to review, edit, and export it. Be encouraging but brief.`,
              },
            ],
            abortSignal,
            onFinish: async (evt) => {
              endAgentStep(writer, docReplyStep, true);
              await onFinish(evt);
            },
          });
          writer.merge(
            commentary.toUIMessageStream({ sendStart: false, sendFinish: true }),
          );
          return;
        }

        // ── analyze-job (default) ───────────────────────────────────────────
        let result: z.infer<typeof fullAnalysisSchema>;
        const extractId = beginAgentStep(writer, "Extracting job details");
        try {
          const { object } = await generateObject({
            model,
            maxOutputTokens: OUT.jobAnalysisJson,
            schema: fullAnalysisSchema,
            system: `You are an expert career advisor. From the user's message, extract the job title and company name, then produce a detailed, specific analysis grounded entirely in the posting text. Use "Unknown company" only if the company truly cannot be determined.

Rules:
- Do not invent requirements, benefits, or tech stack not implied by the posting.
- Each string field: 2–5 tight paragraphs or structured sentences; avoid filler.
- questionsToAsk: at least 5, each specific to this role and company.
- Complete every list you start (no trailing setup line without the items).
- If information is missing, say what is missing instead of guessing.`,
            prompt: lastUser,
            abortSignal,
          });
          result = object;
          endAgentStep(writer, extractId, true);
        } catch (err) {
          console.error("Job analysis failed:", err);
          endAgentStep(writer, extractId, false);
          const errTextId = crypto.randomUUID();
          writer.write({ type: "text-start", id: errTextId });
          writer.write({
            type: "text-delta",
            id: errTextId,
            delta: "I couldn't analyze this as a job posting. Please paste the full job title, company, and description.",
          });
          writer.write({ type: "text-end", id: errTextId });
          writer.write({ type: "finish", finishReason: "stop" });
          await this.llmSidebarTitleFromUser(
            model,
            lastUser,
            "User message could not be analyzed as a job posting",
            abortSignal,
          );
          return;
        }

        const { jobTitle, company, ...analysis } = result;

        const saveId = beginAgentStep(writer, "Saving to your research");
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
            const newEntry: ResearchEntry = {
              id: crypto.randomUUID(),
              company,
              jobTitle,
              summary,
              timestamp: new Date().toISOString(),
              analysis,
            };
            updated = [...current, newEntry];
          }
          await this.setState({
            ...this.state,
            researches: updated,
            sidebarTitle: clipSidebarTitle(`${jobTitle} at ${company}`),
          });
          endAgentStep(writer, saveId, true);
        } catch (persistErr) {
          console.error("persist research failed:", persistErr);
          endAgentStep(writer, saveId, false);
        }

        const analysisToolId = crypto.randomUUID();
        writer.write({
          type: "tool-input-start",
          toolCallId: analysisToolId,
          toolName: "analyzeJobPosting",
          providerExecuted: true,
        });
        writer.write({
          type: "tool-input-available",
          toolCallId: analysisToolId,
          toolName: "analyzeJobPosting",
          input: { jobTitle, company },
          providerExecuted: true,
        });
        writer.write({
          type: "tool-output-available",
          toolCallId: analysisToolId,
          output: analysis,
          providerExecuted: true,
        });

        const insightStep = beginAgentStep(writer, "Writing reply");
        const commentary = streamText({
          model,
          maxOutputTokens: OUT.streamShort,
          system: "You are a concise career coach.",
          messages: [
            {
              role: "user",
              content: `Job: ${jobTitle} at ${company}.\n\nResearch excerpt:\n${analysis.companyOverview.slice(0, 600)}\n\nWrite 2–3 short sentences on the single most important insight for the applicant. Be specific. Do not repeat JSON or section headings.`,
            },
          ],
          abortSignal,
          onFinish: async (evt) => {
            endAgentStep(writer, insightStep, true);
            await onFinish(evt);
          },
        });
        writer.merge(
          commentary.toUIMessageStream({ sendStart: false, sendFinish: true }),
        );
      },
    });

    return createUIMessageStreamResponse({ stream });
  }
}
