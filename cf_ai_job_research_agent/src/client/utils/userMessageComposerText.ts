import type { UIMessage } from "../types";

function joinUserText(message: UIMessage): string {
  return (
    message.parts
      ?.filter((p) => p.type === "text" && (p as { text?: string }).text)
      .map((p) => (p as { text: string }).text)
      .join("\n") ?? ""
  ).trim();
}

/** Strip editor session hint prepended for the agent (not shown in chat UI). */
function stripEditorSessionTag(text: string): string {
  return text.replace(/^\[editor-session:[A-Za-z0-9+/=]+\]\s*/, "").trim();
}

/** Strip editor live-content tag added when the editor is open. */
function stripEditorContentTag(text: string): string {
  return text.replace(/^\[editor-content:[A-Za-z0-9+/=]+\]\s*/, "").trim();
}

function stripLeadingAgentTags(text: string): string {
  let t = text;
  for (let i = 0; i < 4; i++) {
    const next = stripEditorSessionTag(stripEditorContentTag(t));
    if (next === t) break;
    t = next;
  }
  return t;
}

/** Strip `[editor-session]` / `[editor-content]` prefixes for chat display. */
export function stripUserMessageTagsForDisplay(text: string): string {
  return stripLeadingAgentTags(text);
}

/**
 * Text to load into the composer when editing a user message.
 * Returns null when the message should not be editable (hidden system rows).
 */
export function getUserMessagePlainTextForComposer(message: UIMessage): string | null {
  if (message.role !== "user") return null;
  const raw = joinUserText(message);
  if (!raw) return "";

  if (/^\[view-entry:/i.test(raw)) return null;

  const resumeMatch = raw.match(/^\[resume-upload:([^\]]+)\]([\s\S]*)$/);
  if (resumeMatch) {
    const body = resumeMatch[2].trim();
    const delimIdx = body.indexOf("---USER_INTENT---");
    const intent =
      delimIdx >= 0 ? body.slice(delimIdx + "---USER_INTENT---".length).trim() : "";
    return stripLeadingAgentTags(intent);
  }

  return stripLeadingAgentTags(raw);
}
