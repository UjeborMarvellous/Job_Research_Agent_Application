import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import type { Connection } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import {
  streamText,
  generateObject,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  getToolName,
  isToolUIPart,
  type LanguageModel,
  type UIMessage,
} from "ai";
import { z } from "zod";
import type { AgentState, ResearchEntry } from "../client/types";
import {
  AGENT_STEP_TOOL_NAME,
  beginAgentStep,
  endAgentStep,
  runAgentStep,
} from "./agentSteps";
import {
  braveWebSearchMulti,
  decideWebSearchQuery,
  formatWebSearchContext,
} from "./webSearch";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const intentSchema = z.object({
  intent: z.enum([
    "analyze-job",
    "view-history",
    "view-saved-entry",
    "generate-document",
    "update-document",
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
  classify: 50,
  sidebarTitle: 128,
  webSearchDecision: 128,
  streamShort: 2048,
  streamReply: 4096,
  documentHtml: 8192,
  jobAnalysisJson: 8192,
} as const;

/**
 * Per-docType output token cap.
 * Cover letters and emails are 3-4 paragraphs (~600 tokens max).
 * CV tips can be longer with headers and lists — give them a bit more room.
 */
function docMaxOutputTokens(docType: string): number {
  return docType === "cv-tips" ? 3072 : 2048;
}

/**
 * Truncate a string to maxChars, appending "..." if cut.
 * Used to cap resume and job context fields before they are embedded in prompts.
 */
function capStr(s: string, maxChars: number): string {
  if (!s || s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}...`;
}

/**
 * Detect a clear cover-letter / email / cv-tips generation request.
 * Returns the docType string or null if the message does not match.
 * Used as a pre-LLM heuristic to avoid misclassification as "chat".
 */
function looksLikeDocumentRequest(text: string): "cover-letter" | "email" | "cv-tips" | null {
  const t = text.toLowerCase();
  if (/cover[\s-]?letter/.test(t)) return "cover-letter";
  if (/application[\s-]?email|email.*application/.test(t)) return "email";
  if (/cv[\s-]?tip|resume[\s-]?tip|improve.*(?:cv|resume)|(?:cv|resume).*tip/.test(t)) return "cv-tips";
  return null;
}

/** True when the message contains clear document-revision signals. */
function looksLikeRevisionRequest(text: string): boolean {
  return /\b(?:update|revise|change|edit|rewrite|fix|adjust|improve|modify|alter|make it|make the)\b/i.test(text);
}

/**
 * Scan conversation history backwards for a user message that looks like a job
 * posting. Returns the raw text, or null if nothing matches.
 * Used as a fallback when structured analysis was not saved.
 */
function findRawJobDescriptionInHistory(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const parts = m.parts ?? [];
    const text = parts
      .filter(
        (p): p is { type: "text"; text: string } =>
          p.type === "text" && typeof (p as { text?: string }).text === "string",
      )
      .map((p) => p.text)
      .join("\n")
      .trim();
    // Skip resume-upload messages entirely — resume text isn't a JD
    if (/^\[resume-upload:/i.test(text)) continue;
    const cleaned = text
      .replace(/^\[editor-content:[A-Za-z0-9+/=]+\]\s*/, "")
      .replace(/^\[view-entry:[^\]]+\]\s*/, "")
      .trim();
    if (looksLikeJobPosting(cleaned)) return cleaned;
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Appended to streamText system prompts: allow real links only when grounded. */
const GROUNDED_URL_RULE =
  "Never invent or guess URLs. You may include full https:// links only when they appear in the user's message, in web search results provided in this prompt, or in structured data (saved research, tool outputs) you were given.";

/** Appended to document-generation system prompts. */
const NO_HREF_RULE =
  "Do not include any <a href> tags or URL text in the HTML output unless the URL was explicitly provided by the user in their input.";

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

/**
 * Extract and base64-decode the [editor-content:<base64html>] tag prepended by
 * the frontend when the editor is open during an update request. Returns the
 * decoded HTML string, or null if the tag is absent or malformed.
 */
function extractEditorContentTag(text: string): string | null {
  const m = text.match(/^\[editor-content:([A-Za-z0-9+/=]+)\]/);
  if (!m) return null;
  try {
    return atob(m[1]);
  } catch {
    return null;
  }
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
  if (text.length < 400) return false;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of JOB_KEYWORDS) {
    if (lower.includes(kw)) hits++;
    if (hits >= 3) return true;
  }
  return false;
}

/**
 * Short "give me links / apply URL / careers" follow-ups are chat (+ web search),
 * not structured job extraction — even if they mention role titles.
 */
function shouldForceChatInsteadOfJobAnalysis(text: string): boolean {
  if (looksLikeJobPosting(text)) return false;
  const trimmed = text.trim();
  if (trimmed.length > 4500) return false;
  const t = trimmed.toLowerCase();
  const asksLinkOrApply =
    /\b(direct )?link(s)?\b/.test(t) ||
    /\burl(s)?\b/.test(t) ||
    /\bcareers?\b/.test(t) ||
    /\bwhere (do |can )?i apply\b/.test(t) ||
    /\bapply (for|online|here)\b/.test(t) ||
    /\b(job )?posting (url|link)\b/.test(t) ||
    /\bofficial (site|website|page)\b/.test(t);
  if (!asksLinkOrApply) return false;
  if (
    trimmed.length >= 900 &&
    /(responsibilities|requirements|qualifications|what you('ll| will) do|years of experience)/i.test(
      trimmed,
    )
  ) {
    return false;
  }
  return true;
}

/** Block saving junk research when extraction had no real company/posting signal. */
function isPersistableJobAnalysis(
  company: string,
  jobTitle: string,
  companyOverview: string,
  userSourceText: string,
): boolean {
  const c = company.trim().toLowerCase();
  const overview = companyOverview.trim().toLowerCase();
  const src = userSourceText.trim();
  if (!company.trim() || !jobTitle.trim()) return false;
  if (
    c === "unknown company" ||
    c === "unknown" ||
    c === "n/a" ||
    c === "not specified" ||
    /^unknown(\s+company)?$/.test(c)
  ) {
    return false;
  }
  if (
    src.length < 600 &&
    (/unknown company|not provided|cannot be determined|missing as the company name/.test(overview) ||
      /company name is not provided/.test(overview))
  ) {
    return false;
  }
  return true;
}

async function classifyIntent(
  model: LanguageModel,
  lastUserText: string,
  savedEntries: ResearchEntry[],
  hasGeneratedDocument: boolean,
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

Document status: A document HAS${hasGeneratedDocument ? "" : " NOT"} been generated in this conversation.

Classify the user's message into exactly one intent:
- "analyze-job": the message IS or CONTAINS a substantial job posting/description (multi-line: responsibilities, requirements, role scope, company context). NOT for bare role-title lists or "give me the link" follow-ups.
- "view-history": the user wants a list or summary of all their saved research.
- "view-saved-entry": the user is asking to see a specific saved entry from the list above. If matched, also return its id in entryId.
- "generate-document": the user is requesting a document be generated — a cover letter, email draft, or CV/resume improvement tips. If matched, also return documentType as "cover-letter", "email", or "cv-tips". This includes phrases like "write me a cover letter", "give me another cover letter", "draft a new version", "generate a cover letter with a different tone", "can you write a cover letter", "another cover letter please".
- "update-document": the user is requesting edits or revisions to a previously generated document. Signals include words like update, revise, change, edit, rewrite, fix, adjust, improve the [document type]. Only classify as update-document if the document status above says a document HAS been generated. If no document exists, classify as generate-document.
- "chat": follow-up questions, greetings, asking for URLs/careers/apply links, listing job titles without a full posting, or general conversation.

Rules:
- If the message starts with [view-entry:<id>] always return view-saved-entry with that id.
- If the user asks for links, URLs, careers pages, or where to apply — and did NOT paste a full job description — classify as "chat", not "analyze-job".
- Do NOT classify full job postings as "chat" even if they contain words like "history" or "culture".
- A real job posting usually includes: responsibilities, requirements, compensation, or detailed company/role description (not only a bullet list of titles).
- Any request to write, draft, generate, or produce a cover letter, application email, or CV tips — even if phrased as "another one", "a new version", "a different tone" — MUST be "generate-document", never "chat".
- Only use "update-document" when the user clearly wants to modify the existing document (update, revise, change, edit, rewrite, fix, adjust, improve) and a document already exists.`,
      prompt: lastUserText,
      abortSignal,
    });
    return object;
  } catch (err) {
    console.error("[classifyIntent] failed, defaulting to chat:", err);
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

/**
 * Scan the message thread backwards for the last assistant turn that contained
 * a generateDocument tool part with output available. Returns the document
 * title, content, and documentType, or null if none found.
 */
function getLastGeneratedDocument(
  uiMessages: UIMessage[],
): { title: string; content: string; documentType: string } | null {
  for (let i = uiMessages.length - 1; i >= 0; i--) {
    const m = uiMessages[i];
    if (m.role !== "assistant") continue;
    for (const part of m.parts ?? []) {
      if (
        typeof part.type === "string" &&
        part.type === "tool-generateDocument"
      ) {
        const output = (part as { output?: { content?: string; format?: string } }).output;
        const input = (part as { input?: { title?: string; documentType?: string } }).input;
        if (output?.content) {
          return {
            title: input?.title ?? "Document",
            content: output.content,
            documentType: input?.documentType ?? "cover-letter",
          };
        }
      }
    }
  }
  return null;
}

/**
 * Provider-executed UI tools (progress rows, research cards, document tiles) are
 * not valid multi-turn context for Workers AI — they stall follow-up streams.
 * Job context for replies still comes from getConversationJobContext + state.
 */
const STRIP_FROM_LLM_CONTEXT = new Set<string>([
  AGENT_STEP_TOOL_NAME,
  "analyzeJobPosting",
  "generateDocument",
]);

function stripUiToolPartsForLlm(messages: UIMessage[]): UIMessage[] {
  const out: UIMessage[] = [];
  for (const msg of messages) {
    const parts = (msg.parts ?? []).filter((p) => {
      if (!isToolUIPart(p)) return true;
      return !STRIP_FROM_LLM_CONTEXT.has(getToolName(p));
    });
    if (msg.role === "assistant" && parts.length === 0) continue;
    out.push({ ...msg, parts });
  }
  return out;
}

/** Check whether an error is a Workers AI rate limit / quota error. */
function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("quota")
  );
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

/** Immediate short label so JD saves never see an empty sidebarTitle (race with LLM titling). */
function provisionalSidebarTitleFromUserText(text: string): string {
  const resume = extractResumeUploadTag(text);
  let body: string;
  if (resume) {
    // Prefer the user intent portion over the full resume body for the title
    const delimIdx = resume.resumeText.indexOf("---USER_INTENT---");
    body = delimIdx >= 0 ? resume.resumeText.slice(delimIdx + 17).trim() : "";
    if (!body) return "";
  } else {
    body = text.trim();
  }
  if (!body) return "";
  let t = body;
  t = t.replace(/^\[view-entry:[^\]]+\]\s*/i, "").trim();
  t = t.replace(/^\[editor-content:[A-Za-z0-9+/=]+\]\s*/, "").trim();
  if (!t) return "";
  const words = t.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  return clipSidebarTitle(words);
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export class JobResearchAgent extends AIChatAgent<Env, AgentState> {
  initialState: AgentState = {
    researches: [],
    resumeText: undefined,
    resumeFileName: undefined,
    sidebarTitle: undefined,
    sidebarTitleFinalized: false,
  };

  private async persistSidebarTitle(title: string): Promise<void> {
    const clipped = clipSidebarTitle(title);
    if (!clipped) return;
    if (this.state.sidebarTitleFinalized === true) return;
    if (this.state.sidebarTitle?.trim()) return;
    try {
      await this.setState({
        ...this.state,
        sidebarTitle: clipped,
        sidebarTitleFinalized: true,
      });
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
    if (this.state.sidebarTitleFinalized === true) return;
    if (
      this.state.sidebarTitle?.trim() &&
      this.state.sidebarTitleFinalized !== false
    ) {
      return;
    }
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
      const clipped = clipSidebarTitle(object.title);
      if (!clipped) return;
      await this.setState({
        ...this.state,
        sidebarTitle: clipped,
        sidebarTitleFinalized: true,
      });
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
    let lastUser = getLastUserText(uiMessages);

    // Extract and strip the [editor-content:...] tag before any LLM sees it
    const liveEditorContent = extractEditorContentTag(lastUser);
    if (liveEditorContent !== null) {
      lastUser = lastUser.replace(/^\[editor-content:[A-Za-z0-9+/=]+\]\s*/, "");
    }

    const modelMessages = await convertToModelMessages(
      stripUiToolPartsForLlm(uiMessages),
    );
    const savedEntries = (this.state?.researches ?? []) as ResearchEntry[];

    if (
      this.state.sidebarTitleFinalized !== true &&
      !this.state.sidebarTitle?.trim() &&
      !extractResumeUploadTag(lastUser) &&
      !extractViewEntryTag(lastUser)
    ) {
      const seed = provisionalSidebarTitleFromUserText(lastUser);
      if (seed) {
        try {
          await this.setState({
            ...this.state,
            sidebarTitle: seed,
            sidebarTitleFinalized: false,
          });
        } catch (e) {
          console.error("seed sidebar title:", e);
        }
      }
    }

    // ── Resume upload: store resume, then optionally fall through to intent ───
    let tagIntentText: string | null = null;
    const resumeTag = extractResumeUploadTag(lastUser);
    if (resumeTag) {
      const hadResume = !!(this.state as AgentState)?.resumeText;
      // Split resume body from optional user intent (delimiter added by client)
      const delimIdx = resumeTag.resumeText.indexOf("---USER_INTENT---");
      const actualResumeText =
        delimIdx >= 0 ? resumeTag.resumeText.slice(0, delimIdx).trim() : resumeTag.resumeText.trim();
      const intentFromTag =
        delimIdx >= 0 ? resumeTag.resumeText.slice(delimIdx + "---USER_INTENT---".length).trim() : "";

      try {
        const fileLabel =
          resumeTag.fileName.length > 36
            ? `${resumeTag.fileName.slice(0, 33)}…`
            : resumeTag.fileName;
        await this.setState({
          ...this.state,
          resumeText: actualResumeText,
          resumeFileName: resumeTag.fileName,
          ...(this.state.sidebarTitleFinalized !== true && !this.state.sidebarTitle?.trim()
            ? {
                sidebarTitle: clipSidebarTitle(`Resume: ${fileLabel}`),
                sidebarTitleFinalized: true,
              }
            : {}),
        });
      } catch (err) {
        console.error("Failed to store resume:", err);
      }

      if (!intentFromTag && !actualResumeText) {
        // No text extracted and no intent — likely parsing error
        return streamText({
          model,
          temperature: 0.7,
          maxOutputTokens: OUT.streamShort,
          system: `You are a job application research assistant. The user tried to upload a resume but you could not read its contents. Ask them to copy-paste the resume text or try a different file format (plain text or PDF). Be concise (2–3 sentences). ${GROUNDED_URL_RULE}`,
          messages: [
            { role: "user", content: `I uploaded my resume: ${resumeTag.fileName}` },
          ],
          abortSignal,
          onFinish,
        }).toUIMessageStreamResponse({ originalMessages: uiMessages });
      }

      if (!intentFromTag) {
        // Standalone CV upload — stream confirmation mentioning key details extracted
        const snippet = actualResumeText.slice(0, 300);
        return streamText({
          model,
          temperature: 0.7,
          maxOutputTokens: OUT.streamShort,
          system: hadResume
            ? `You are a job application research assistant. The user just replaced their previously uploaded resume with a new one. You successfully read the resume. Briefly confirm what key details you noticed (name, role/skills if visible) and that it will now be used for cover letters, email drafts, and CV tips. Be concise (3–4 sentences). ${GROUNDED_URL_RULE}`
            : `You are a job application research assistant. The user just uploaded their resume. You successfully read it. Briefly confirm what key details you noticed (name, role/skills if visible) and mention you can now help with cover letters, email drafts, and CV tips tailored to their experience. Be concise (3–4 sentences). ${GROUNDED_URL_RULE}`,
          messages: [
            {
              role: "user",
              content: `I uploaded my resume (${resumeTag.fileName}). Here is the beginning of its content:\n\n${snippet}`,
            },
          ],
          abortSignal,
          onFinish,
        }).toUIMessageStreamResponse({ originalMessages: uiMessages });
      }

      // Intent text follows the upload tag — fall through to orchestrated stream
      tagIntentText = intentFromTag;
    }

    // ── Orchestrated turn: classify + intent branches in one UI stream ────────
    const textToClassify = tagIntentText ?? lastUser;
    const stream = createUIMessageStream({
      originalMessages: uiMessages,
      execute: async ({ writer }) => {
        try {
          writer.write({ type: "start" });

          const jobHeuristic = looksLikeJobPosting(textToClassify);
          const hasGeneratedDocument = getLastGeneratedDocument(uiMessages) !== null;
          const hasJobContext = getConversationJobContext(uiMessages, savedEntries) !== null;
          const hasResume = !!((this.state as AgentState)?.resumeText);
          let classified!: z.infer<typeof intentSchema>;
          await runAgentStep(
            writer,
            jobHeuristic ? "Detected job posting" : "Understanding your request",
            async () => {
              if (shouldForceChatInsteadOfJobAnalysis(textToClassify)) {
                classified = {
                  intent: "chat" as const,
                  entryId: undefined,
                  documentType: undefined,
                };
              } else if (jobHeuristic) {
                classified = {
                  intent: "analyze-job" as const,
                  entryId: undefined,
                  documentType: undefined,
                };
              } else {
                // Pre-LLM heuristic: catch "another cover letter" / "new version" requests
                // that the LLM sometimes misroutes to "chat".
                const docRequestType = looksLikeDocumentRequest(textToClassify);
                const hasRawJdInHistory = !hasJobContext && findRawJobDescriptionInHistory(uiMessages) !== null;
                if (docRequestType && (hasJobContext || hasRawJdInHistory) && hasResume) {
                  if (hasGeneratedDocument && looksLikeRevisionRequest(textToClassify)) {
                    // User wants to revise the existing document
                    classified = { intent: "update-document" as const, documentType: docRequestType };
                  } else {
                    // Fresh generation (including "another" / "different tone")
                    classified = { intent: "generate-document" as const, documentType: docRequestType };
                  }
                } else {
                  classified = await classifyIntent(
                    model,
                    textToClassify,
                    savedEntries,
                    hasGeneratedDocument,
                    abortSignal,
                  );
                }
              }
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
                temperature: 0.7,
                maxOutputTokens: OUT.streamShort,
                system: `You are a job application research assistant. The requested saved research could not be found. Ask the user to paste the job posting again. ${GROUNDED_URL_RULE}`,
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
              temperature: 0.7,
              maxOutputTokens: OUT.streamShort,
              system: `You are a concise career coach. ${GROUNDED_URL_RULE}`,
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
              temperature: 0.7,
              maxOutputTokens: OUT.streamReply,
              system: `You are a job application research assistant. The user asked about their saved research. Here is the saved list as JSON (may be empty):\n${JSON.stringify(researches.map((r) => ({ company: r.company, jobTitle: r.jobTitle, timestamp: r.timestamp, summary: r.summary })), null, 2)}\n\nList each entry clearly with company, job title, and how long ago it was saved. If empty, say nothing has been saved yet. Be concise. ${GROUNDED_URL_RULE}`,
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
              ? `\n\nThe user's resume (extracted text, use to personalise advice):\n${resumeText}`
              : "";

            let webBlock = "";
            const searchDecision = await decideWebSearchQuery(
              model,
              lastUser,
              abortSignal,
              OUT.webSearchDecision,
            );
            const searchQuery = searchDecision.query;
            const searchQuery2 = searchDecision.query2;
            if (searchDecision.needsSearch && searchQuery) {
              await runAgentStep(writer, "Searching the web", async () => {
                const key = this.env.BRAVE_SEARCH_API_KEY;
                if (!key?.trim()) {
                  webBlock =
                    "## Web search\nLive web search is not configured on this deployment (set BRAVE_SEARCH_API_KEY). Answer from the conversation and prior context only; do not invent URLs.";
                  return;
                }
                const queries: [string] | [string, string] = searchQuery2
                  ? [searchQuery, searchQuery2]
                  : [searchQuery];
                const hits = await braveWebSearchMulti(queries, key, abortSignal);
                webBlock = formatWebSearchContext(hits);
              });
            }

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
              system = `You are a helpful job application research assistant. You help users analyze job postings, understand companies, and prepare for interviews.

IMPORTANT — When the user sends a vague or broad request (e.g. "get me a job", "find me work", "help me get hired", "I need a job"), you MUST:
1. Briefly acknowledge their request.
2. Explain that you can give a generic starting point, but results will be much better if they share context: the industry/role they are targeting, their experience level, and ideally a job posting to analyze.
3. Ask 2-3 short clarifying questions (e.g. "What kind of role are you looking for?", "Do you have a specific job posting you'd like me to analyze?", "What industry or field are you interested in?").
4. If you have their resume on file, mention specific skills/experience you see and suggest directions based on that.
Do NOT give a long generic response. Keep it concise and conversational.

The user can paste a job description to get a detailed analysis. They currently have ${savedEntries.length} saved research${savedEntries.length === 1 ? "" : "es"}.${resumeSnippet}`;
            }

            const webSection = webBlock ? `\n\n${webBlock}` : "";
            system = `${system}${webSection}\n\n${GROUNDED_URL_RULE}`;

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
              temperature: 0.7,
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
            // Fallback: if structured analysis was not saved, look for a raw JD in history
            const rawJdFallback = !ctx ? findRawJobDescriptionInHistory(uiMessages) : null;
            const hasAnyJobContext = !!(ctx || rawJdFallback);

            // Gate: resume is always required
            if (!resumeText) {
              const gateStep = beginAgentStep(writer, "Writing reply");
              const wrappedFinish = this.withSidebarTitleAfterStream(onFinish, model, lastUser, undefined, abortSignal);
              const hint = hasAnyJobContext
                ? "Please upload your resume first so I can tailor the document to your experience."
                : "I need both a job description and your resume before I can write a tailored document. Please paste a job description and upload your resume.";
              const st = streamText({
                model,
                temperature: 0.7,
                maxOutputTokens: OUT.streamShort,
                system: `You are a helpful job application research assistant. ${GROUNDED_URL_RULE}`,
                messages: [{ role: "user", content: hint }],
                abortSignal,
                onFinish: async (evt) => { endAgentStep(writer, gateStep, true); await wrappedFinish(evt); },
              });
              writer.merge(st.toUIMessageStream({ sendStart: false, sendFinish: true }));
              return;
            }
            // Gate: need some form of job context (structured OR raw JD from history)
            if (!hasAnyJobContext) {
              const gateStep = beginAgentStep(writer, "Writing reply");
              const wrappedFinish = this.withSidebarTitleAfterStream(onFinish, model, lastUser, undefined, abortSignal);
              const st = streamText({
                model,
                temperature: 0.7,
                maxOutputTokens: OUT.streamShort,
                system: `You are a helpful job application research assistant. ${GROUNDED_URL_RULE}`,
                messages: [{ role: "user", content: "Please paste a job description first so I can tailor the document to the role. The user has a resume but no job description yet." }],
                abortSignal,
                onFinish: async (evt) => { endAgentStep(writer, gateStep, true); await wrappedFinish(evt); },
              });
              writer.merge(st.toUIMessageStream({ sendStart: false, sendFinish: true }));
              return;
            }

            // Build job context: prefer structured analysis, fall back to raw JD
            const jobContext = ctx?.analysis
              ? [
                  `Role: ${ctx.jobTitle} at ${ctx.company}`,
                  `Company Overview: ${capStr(ctx.analysis.companyOverview, 500)}`,
                  `Role Expectations: ${capStr(ctx.analysis.roleExpectations, 500)}`,
                  `Positioning Tips: ${capStr(ctx.analysis.positioningTips, 500)}`,
                ].join("\n")
              : ctx
                ? `Role: ${ctx.jobTitle} at ${ctx.company}`
                : rawJdFallback
                  ? `Job description from conversation:\n${capStr(rawJdFallback, 2000)}`
                  : "";

            const resumeContext = resumeText
              ? `\n\nCandidate's Resume:\n${capStr(resumeText, 3000)}`
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
              "cover-letter": `You are a professional cover letter writer. Write a compelling, personalized cover letter for the candidate applying to this role. Use their resume details and the job analysis to tailor every paragraph. Output the cover letter in clean HTML (use <p>, <strong>, <em>, <br> tags). Do NOT include any preamble or explanation — output ONLY the cover letter HTML. ${NO_HREF_RULE}`,
              email: `You are a professional email drafter. Write a concise, professional application email for the candidate to send when applying to this role. Use their resume and the job analysis to personalize it. Output the email in clean HTML (use <p>, <strong>, <em>, <br> tags). Do NOT include any preamble — output ONLY the email HTML. ${NO_HREF_RULE}`,
              "cv-tips": `You are an expert CV/resume consultant. Based on the job requirements and the candidate's current resume, provide specific, actionable tips to improve their CV for this exact role. Format as HTML with headings (<h3>), bullet lists (<ul><li>), and bold text (<strong>) for key points. Do NOT include preamble — output ONLY the tips HTML. ${NO_HREF_RULE}`,
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

            const docSystem = `${systemPrompts[docType] ?? systemPrompts["cover-letter"]}\n\nJob Context:\n${jobContext}${resumeContext}`;
            const docTokenCap = docMaxOutputTokens(docType);
            let fullContent = "";
            try {
              const result = streamText({
                model,
                maxOutputTokens: docTokenCap,
                system: docSystem,
                messages: [{ role: "user", content: `Generate the ${docLabel}.` }],
                abortSignal,
              });
              const chunks: string[] = [];
              for await (const chunk of result.textStream) {
                chunks.push(chunk);
              }
              fullContent = chunks.join("");
              const reason = await result.finishReason;
              if (reason === "length") {
                console.warn(`[generateDocument] output truncated at token limit — docType=${docType} cap=${docTokenCap}`);
              }
            } catch (docErr) {
              if (isRateLimitError(docErr)) {
                await new Promise((r) => setTimeout(r, 4000));
                const retry = streamText({
                  model,
                  maxOutputTokens: docTokenCap,
                  system: docSystem,
                  messages: [{ role: "user", content: `Generate the ${docLabel}.` }],
                  abortSignal,
                });
                const retryChunks: string[] = [];
                for await (const chunk of retry.textStream) {
                  retryChunks.push(chunk);
                }
                fullContent = retryChunks.join("");
                const retryReason = await retry.finishReason;
                if (retryReason === "length") {
                  console.warn(`[generateDocument] retry output truncated — docType=${docType} cap=${docTokenCap}`);
                }
              } else {
                throw docErr;
              }
            }

            await this.persistSidebarTitle(docTitle);

            // Persist full document to DO state — message storage truncates large
            // tool outputs, so the client reads the full content from state instead.
            try {
              await this.setState({
                ...this.state,
                lastGeneratedDocument: { title: docTitle, content: fullContent, documentType: docType },
              });
            } catch (e) {
              console.error("persist lastGeneratedDocument:", e);
            }

            writer.write({
              type: "tool-output-available",
              toolCallId: genToolId,
              output: { content: fullContent, format: "html" },
              providerExecuted: true,
            });

            const docReplyStep = beginAgentStep(writer, "Writing reply");
            const commentary = streamText({
              model,
              temperature: 0.7,
              maxOutputTokens: OUT.streamShort,
              system: `You are a concise career coach. ${GROUNDED_URL_RULE}`,
              messages: [
                {
                  role: "user",
                  content: `You just generated a ${docLabel} for the user based on their resume and the job analysis. Give them 1–2 sentences of specific, encouraging feedback — mention something concrete from the role or their background that makes the document well-suited. Then tell them they can click "Open in Editor" to review, edit, and export it.`,
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

          // ── update-document ─────────────────────────────────────────────────
          if (intent === "update-document") {
            const existingDoc = getLastGeneratedDocument(uiMessages);

            if (!existingDoc) {
              // No prior document — let the model explain
              const writingStep = beginAgentStep(writer, "Writing reply");
              const wrappedFinish = this.withSidebarTitleAfterStream(
                onFinish,
                model,
                lastUser,
                undefined,
                abortSignal,
              );
              const st = streamText({
                model,
                temperature: 0.7,
                maxOutputTokens: OUT.streamReply,
                system: `You are a helpful job application research assistant. The user asked to update a document, but no document has been generated yet in this conversation. Let them know politely and offer to generate one for them. ${GROUNDED_URL_RULE}`,
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

            const docLabel =
              existingDoc.documentType === "cover-letter"
                ? "Cover Letter"
                : existingDoc.documentType === "email"
                  ? "Application Email"
                  : "CV Improvement Tips";

            await runAgentStep(writer, "Applying document revisions", async () => {
              await Promise.resolve();
            });

            const updateToolId = crypto.randomUUID();
            writer.write({
              type: "tool-input-start",
              toolCallId: updateToolId,
              toolName: "generateDocument",
              providerExecuted: true,
            });
            writer.write({
              type: "tool-input-available",
              toolCallId: updateToolId,
              toolName: "generateDocument",
              input: { documentType: existingDoc.documentType, title: existingDoc.title },
              providerExecuted: true,
            });

            // Use live editor content (user's manual edits) when available,
            // then full content from DO state (bypasses message truncation),
            // then fall back to message history as last resort.
            const stateDoc = (this.state as AgentState)?.lastGeneratedDocument;
            const docContent = liveEditorContent ?? stateDoc?.content ?? existingDoc.content;

            const revisionSystem = `You are a professional document editor. You are given an existing document in HTML format and a revision instruction from the user. Apply the instruction precisely. Output the complete revised document as clean HTML — same tags and structure as the input (p, strong, em, h2, ul, li, br). Do NOT output preamble, explanation, or markdown. Output ONLY the revised HTML document. ${NO_HREF_RULE}`;
            const revTokenCap = docMaxOutputTokens(existingDoc.documentType);
            let revisedContent = "";
            try {
              const result = streamText({
                model,
                maxOutputTokens: revTokenCap,
                system: revisionSystem,
                messages: [
                  {
                    role: "user",
                    content: `Existing document:\n${docContent}\n\nRevision instruction:\n${lastUser}`,
                  },
                ],
                abortSignal,
              });
              const chunks: string[] = [];
              for await (const chunk of result.textStream) {
                chunks.push(chunk);
              }
              revisedContent = chunks.join("");
              const reason = await result.finishReason;
              if (reason === "length") {
                console.warn(`[updateDocument] output truncated — docType=${existingDoc.documentType} cap=${revTokenCap}`);
              }
            } catch (revErr) {
              if (isRateLimitError(revErr)) {
                await new Promise((r) => setTimeout(r, 4000));
                const retry = streamText({
                  model,
                  maxOutputTokens: revTokenCap,
                  system: revisionSystem,
                  messages: [
                    {
                      role: "user",
                      content: `Existing document:\n${docContent}\n\nRevision instruction:\n${lastUser}`,
                    },
                  ],
                  abortSignal,
                });
                const retryChunks: string[] = [];
                for await (const chunk of retry.textStream) {
                  retryChunks.push(chunk);
                }
                revisedContent = retryChunks.join("");
                const retryReason = await retry.finishReason;
                if (retryReason === "length") {
                  console.warn(`[updateDocument] retry truncated — docType=${existingDoc.documentType} cap=${revTokenCap}`);
                }
              } else {
                throw revErr;
              }
            }

            // Persist revised document to DO state (bypasses message truncation)
            try {
              await this.setState({
                ...this.state,
                lastGeneratedDocument: {
                  title: existingDoc.title,
                  content: revisedContent,
                  documentType: existingDoc.documentType,
                },
              });
            } catch (e) {
              console.error("persist revised lastGeneratedDocument:", e);
            }

            writer.write({
              type: "tool-output-available",
              toolCallId: updateToolId,
              output: { content: revisedContent, format: "html" },
              providerExecuted: true,
            });

            const confirmStep = beginAgentStep(writer, "Writing reply");
            const confirmStream = streamText({
              model,
              temperature: 0.7,
              maxOutputTokens: OUT.streamShort,
              system: `You are a concise career coach. ${GROUNDED_URL_RULE}`,
              messages: [
                {
                  role: "user",
                  content: `You just revised the user's ${docLabel} based on their instruction. Confirm in 1–2 sentences that the changes are done and are reflected in their editor. Be brief and encouraging.`,
                },
              ],
              abortSignal,
              onFinish: async (evt) => {
                endAgentStep(writer, confirmStep, true);
                await onFinish(evt);
              },
            });
            writer.merge(
              confirmStream.toUIMessageStream({ sendStart: false, sendFinish: true }),
            );
            return;
          }

          // ── analyze-job (default) ───────────────────────────────────────────
          let result: z.infer<typeof fullAnalysisSchema>;
          const extractId = beginAgentStep(writer, "Extracting job details");
          const analysisSystem = `You are an expert career advisor. From the user's message, extract the job title and company name, then produce a detailed, specific analysis grounded entirely in the posting text.

Rules:
- Extract company and jobTitle only from what the user actually wrote; do not invent an employer name.
- Do not invent requirements, benefits, or tech stack not implied by the posting.
- Each string field: 2–5 tight paragraphs or structured sentences; avoid filler.
- questionsToAsk: at least 5, each specific to this role and company.
- Complete every list you start (no trailing setup line without the items).
- If information is missing, say what is missing instead of guessing.`;
          try {
            let analysisObj: z.infer<typeof fullAnalysisSchema>;
            try {
              const { object } = await generateObject({
                model,
                maxOutputTokens: OUT.jobAnalysisJson,
                schema: fullAnalysisSchema,
                system: analysisSystem,
                prompt: lastUser,
                abortSignal,
              });
              analysisObj = object;
            } catch (analysisErr) {
              if (isRateLimitError(analysisErr)) {
                await new Promise((r) => setTimeout(r, 4000));
                const { object } = await generateObject({
                  model,
                  maxOutputTokens: OUT.jobAnalysisJson,
                  schema: fullAnalysisSchema,
                  system: analysisSystem,
                  prompt: lastUser,
                  abortSignal,
                });
                analysisObj = object;
              } else {
                throw analysisErr;
              }
            }
            result = analysisObj;
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

          if (!isPersistableJobAnalysis(company, jobTitle, analysis.companyOverview, lastUser)) {
            const bailStep = beginAgentStep(writer, "Writing reply");
            const wrappedFinish = this.withSidebarTitleAfterStream(
              onFinish,
              model,
              lastUser,
              "Job analysis skipped — input was not a saveable posting",
              abortSignal,
            );
            const st = streamText({
              model,
              temperature: 0.7,
              maxOutputTokens: OUT.streamShort,
              system: `You are a helpful job research assistant. ${GROUNDED_URL_RULE}`,
              messages: [
                {
                  role: "user",
                  content: `The user's message was too thin to save as structured job research (missing a clear company and/or full posting). Their message:\n---\n${lastUser.slice(0, 3500)}\n---\nExplain in 2–4 sentences: (1) To run a full saved analysis they should paste the complete job description including company name. (2) If they only need apply/careers links, they should ask in plain language and name the employer (you can use web search when available). Be concise.`,
                },
              ],
              abortSignal,
              onFinish: async (evt) => {
                endAgentStep(writer, bailStep, true);
                await wrappedFinish(evt);
              },
            });
            writer.merge(st.toUIMessageStream({ sendStart: false, sendFinish: true }));
            return;
          }

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
              updated = [...current, newEntry].slice(-100);
            }
            await this.setState({
              ...this.state,
              researches: updated,
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
          // Slim commentary prompt: the ResearchCard already shows the full analysis to the user.
          // We pass only a short digest so the LLM can give a targeted insight without a heavy input.
          const commentaryDigest = [
            `Role: ${jobTitle} at ${company}.`,
            analysis.cultureSignals ? `Culture signal: ${capStr(analysis.cultureSignals, 300)}` : "",
            analysis.potentialRedFlags ? `Red flags: ${capStr(analysis.potentialRedFlags, 200)}` : "",
            analysis.positioningTips ? `Positioning: ${capStr(analysis.positioningTips, 200)}` : "",
          ].filter(Boolean).join(" ");
          const commentary = streamText({
            model,
            temperature: 0.7,
            maxOutputTokens: OUT.streamShort,
            system: `You are a concise career coach. ${GROUNDED_URL_RULE}`,
            messages: [
              {
                role: "user",
                content: `${commentaryDigest}\n\nGive the applicant one specific, actionable insight about this opportunity — a stand-out signal, a positioning angle, or a red flag to probe. Be direct and concrete. 2–3 sentences max.`,
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
        } catch (err) {
          console.error("[JobResearchAgent] execute error:", err);
          const errId = crypto.randomUUID();
          writer.write({ type: "text-start", id: errId });
          if (isRateLimitError(err)) {
            await new Promise((r) => setTimeout(r, 4000));
            writer.write({
              type: "text-delta",
              id: errId,
              delta: "The AI service is temporarily over capacity. Wait a few seconds and send your message again.",
            });
          } else {
            writer.write({
              type: "text-delta",
              id: errId,
              delta: "Something went wrong on my end. Please try sending your message again.",
            });
          }
          writer.write({ type: "text-end", id: errId });
          writer.write({ type: "finish", finishReason: "error" });
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
  }
}
