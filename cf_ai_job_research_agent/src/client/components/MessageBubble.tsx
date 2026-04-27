import { useState, type CSSProperties } from "react";
import { Loader2, FileText, ExternalLink, Pencil, Copy, Check } from "lucide-react";
import { getToolName, isToolUIPart } from "ai";
import { theme } from "../types";
import type { UIMessage, JobAnalysis, DocumentSnapshot } from "../types";
import AgentStepRow from "./AgentStepRow";
import ResearchCard from "./ResearchCard";
import { Button } from "./ui/button";
import { stripUserMessageTagsForDisplay } from "../utils/userMessageComposerText";

// ─── URL chip helpers ─────────────────────────────────────────────────────────

type Segment = { type: "text"; value: string } | { type: "url"; value: string };

// Matches full URLs (https?://) OR bare domain.tld patterns like linkedin.com/jobs.
// The lookbehind prevents matching mid-word or email addresses (foo@domain.com).
const URL_RE =
  /https?:\/\/[^\s<>"]+|(?<![a-zA-Z0-9@])([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:com|org|net|io|co|jobs|app|edu|gov|ai|dev)(?:\/[^\s<>"()[\]]*)?)/g;

/** Strip trailing punctuation that is often captured as part of a URL but is not part of it. */
function cleanUrl(raw: string): string {
  return raw.replace(/[.,);:!?'"]+$/, "");
}

/** Ensure a URL has a protocol so window.open works correctly. */
function ensureProtocol(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function parseTextWithLinks(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    const url = cleanUrl(m[0]);
    if (m.index > last) segments.push({ type: "text", value: text.slice(last, m.index) });
    segments.push({ type: "url", value: url });
    // If trailing punctuation was stripped, keep it as plain text
    if (m[0].length > url.length) {
      segments.push({ type: "text", value: m[0].slice(url.length) });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments;
}

// ─── Navigation confirmation modal ───────────────────────────────────────────

function LinkModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleOpen = () => {
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(onClose, 1200);
    });
  };

  return (
    <>
      {/* Backdrop */}
      <button
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        aria-label="Close"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          background: "rgba(0,0,0,0.18)",
          border: "none",
          cursor: "default",
          padding: 0,
        }}
      />
      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 101,
          background: theme.colors.background,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radius.lg,
          boxShadow: theme.shadow.modal,
          padding: "20px 24px",
          width: "380px",
          maxWidth: "90vw",
          animation: "fadeSlideUp 150ms ease",
        }}
      >
        <p
          style={{
            fontSize: theme.font.size.md,
            fontWeight: theme.font.weight.semibold,
            color: theme.colors.text,
            fontFamily: theme.font.family,
            marginBottom: "10px",
          }}
        >
          Open link?
        </p>
        <p
          style={{
            fontSize: theme.font.size.sm,
            color: theme.colors.textSecondary,
            fontFamily: theme.font.mono,
            wordBreak: "break-all",
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.sm,
            padding: "8px 10px",
            marginBottom: "16px",
            lineHeight: String(theme.font.lineHeight.base),
          }}
        >
          {url}
        </p>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy"}
          </Button>
          <Button variant="default" size="sm" onClick={handleOpen}>
            Open
          </Button>
        </div>
      </div>
    </>
  );
}

// ─── Inline text renderer with link chips ────────────────────────────────────

function TextWithLinks({
  text,
  color: _color,
  onLinkClick,
}: {
  text: string;
  color: string;
  onLinkClick: (url: string) => void;
}) {
  const segments = parseTextWithLinks(text);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <span key={i} style={{ whiteSpace: "pre-wrap" }}>{seg.value}</span>
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => onLinkClick(ensureProtocol(seg.value))}
            style={{
              color: theme.colors.textSecondary,
              textDecoration: "underline",
              cursor: "pointer",
              borderRadius: "3px",
              padding: "0 2px",
              transition: "background 100ms ease",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
              border: "none",
              background: "transparent",
              font: "inherit",
              display: "inline",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = theme.colors.surfaceElevated;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            {seg.value}
          </button>
        ),
      )}
    </>
  );
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────

function looksLikeRawFunctionCallJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith("{") && /"type"\s*:\s*"function"/.test(t);
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: UIMessage;
  messageIndex?: number;
  onOpenDocument?: (doc: { title: string; content: string }, opts?: { fromAgent?: boolean }) => void;
  /** Full document from DO state — used instead of (possibly truncated) message part content. */
  stateDocContent?: string | null;
  /** Snapshots from agent state; keyed by tool output `versionedDocumentId`. */
  documentVersionMap?: Record<string, DocumentSnapshot>;
  /** toolCallId → snapshot id when `output.versionedDocumentId` is missing. */
  documentVersionByToolCallId?: Record<string, string>;
  /** Opens the editor to the snapshot for this tool part (preferred over raw message content). */
  onLoadDocumentVersion?: (versionedDocumentId: string) => void;
  canEditUserMessage?: boolean;
  onEditUserMessage?: (messageIndex: number) => void;
  isStreaming?: boolean;
  isMobile?: boolean;
}

function assistantMessagePlainText(message: UIMessage): string {
  const parts = message.parts ?? [];
  const chunks: string[] = [];
  for (const p of parts) {
    if (p.type === "text" && typeof (p as { text?: string }).text === "string") {
      const t = (p as { text: string }).text.trim();
      if (t) chunks.push((p as { text: string }).text);
    }
  }
  return chunks.join("\n\n");
}

function MessageBubble({
  message,
  messageIndex,
  onOpenDocument,
  stateDocContent,
  documentVersionMap = {},
  documentVersionByToolCallId = {},
  onLoadDocumentVersion,
  canEditUserMessage,
  onEditUserMessage,
  isStreaming = false,
  isMobile,
}: MessageBubbleProps) {
  const compact = isMobile === true;
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [userRowHover, setUserRowHover] = useState(false);
  const [assistantRowHover, setAssistantRowHover] = useState(false);
  const [copiedAssistant, setCopiedAssistant] = useState(false);

  const showUserEdit =
    canEditUserMessage &&
    messageIndex !== undefined &&
    typeof onEditUserMessage === "function";

  const userEditBtn = showUserEdit ? (
    <button
      type="button"
      onClick={() => onEditUserMessage!(messageIndex!)}
      title="Edit message"
      aria-label="Edit message"
      style={{
        alignSelf: "flex-start",
        marginTop: compact ? "6px" : "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: compact ? "26px" : "28px",
        height: compact ? "26px" : "28px",
        borderRadius: "8px",
        border: "none",
        background: userRowHover ? theme.colors.surfaceElevated : "transparent",
        cursor: "pointer",
        flexShrink: 0,
        color: theme.colors.textMuted,
        opacity: userRowHover ? 1 : 0,
        transition: "opacity 120ms ease, background 120ms ease",
      }}
    >
      <Pencil size={compact ? 13 : 14} />
    </button>
  ) : null;

  const handleCopyAssistant = () => {
    const t = assistantMessagePlainText(message);
    if (!t) return;
    void navigator.clipboard.writeText(t).then(() => {
      setCopiedAssistant(true);
      setTimeout(() => setCopiedAssistant(false), 2000);
    });
  };

  try {
    if (message.role === "user") {
      const text =
        message.parts
          ?.filter((p) => p.type === "text" && p.text)
          .map((p) => (p as { text: string }).text)
          .join("\n") ?? "";

      const resumeMatch = text.match(/^\[resume-upload:([^\]]+)\]([\s\S]*)$/);
      if (resumeMatch) {
        const fileName = resumeMatch[1];
        // Only show the user's typed intent, not the full resume body
        const rawPayload = resumeMatch[2].trim();
        const delimIdx = rawPayload.indexOf("---USER_INTENT---");
        const remainingTextRaw =
          delimIdx >= 0 ? rawPayload.slice(delimIdx + "---USER_INTENT---".length).trim() : "";
        const remainingText = stripUserMessageTagsForDisplay(remainingTextRaw);
        return (
          <>
            {activeUrl && <LinkModal url={activeUrl} onClose={() => setActiveUrl(null)} />}
            <div
              className="mount-anim"
              onMouseEnter={() => setUserRowHover(true)}
              onMouseLeave={() => setUserRowHover(false)}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "flex-end",
                gap: "4px",
                margin: "3px 0",
                minWidth: 0,
                width: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: "4px",
                  minWidth: 0,
                  width: "100%",
                  maxWidth: "100%",
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: compact ? "5px" : "6px",
                    padding: compact ? "6px 10px" : "7px 12px",
                    background: theme.colors.text,
                    borderRadius: compact ? "14px" : "18px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    maxWidth: compact ? "min(100%, 85%)" : "68%",
                  }}
                >
                  <FileText size={compact ? 12 : 13} color="#ffffff" style={{ flexShrink: 0 }} />
                  <span
                    style={{
                      fontSize: compact ? theme.font.size.xs : theme.font.size.sm,
                      color: "#ffffff",
                      fontFamily: theme.font.family,
                      fontWeight: theme.font.weight.medium,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: compact ? "140px" : "220px",
                    }}
                  >
                    {fileName}
                  </span>
                </div>
                {remainingText && (
                  <div
                    style={{
                      background: theme.colors.text,
                      borderRadius: compact ? "14px" : "18px",
                      padding: compact ? "8px 12px" : "10px 16px",
                      maxWidth: compact ? "min(100%, 85%)" : "68%",
                      minWidth: 0,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                      overflowWrap: "break-word",
                      wordBreak: "break-word",
                    }}
                  >
                    <p
                      style={{
                        fontSize: compact ? theme.font.size.sm : theme.font.size.base,
                        color: "#ffffff",
                        lineHeight: String(theme.font.lineHeight.relaxed),
                        fontFamily: theme.font.family,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      <TextWithLinks text={remainingText} color="#ffffff" onLinkClick={setActiveUrl} />
                    </p>
                  </div>
                )}
              </div>
              {userEditBtn}
            </div>
          </>
        );
      }

      if (text.startsWith("[view-entry:")) return null;

      const displayText = stripUserMessageTagsForDisplay(text);

      return (
        <>
          {activeUrl && <LinkModal url={activeUrl} onClose={() => setActiveUrl(null)} />}
          <div
            className="mount-anim"
            onMouseEnter={() => setUserRowHover(true)}
            onMouseLeave={() => setUserRowHover(false)}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "flex-end",
              gap: "4px",
              margin: "3px 0",
              minWidth: 0,
              width: "100%",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                minWidth: 0,
                width: "100%",
                maxWidth: "100%",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  background: theme.colors.text,
                  borderRadius: compact ? "14px" : "18px",
                  padding: compact ? "8px 12px" : "10px 16px",
                  maxWidth: compact ? "min(100%, 85%)" : "68%",
                  minWidth: 0,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  overflowWrap: "break-word",
                  wordBreak: "break-word",
                }}
              >
                <p
                  style={{
                    fontSize: compact ? theme.font.size.sm : theme.font.size.base,
                    color: "#ffffff",
                    lineHeight: String(theme.font.lineHeight.relaxed),
                    fontFamily: theme.font.family,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <TextWithLinks text={displayText} color="#ffffff" onLinkClick={setActiveUrl} />
                </p>
              </div>
            </div>
            {userEditBtn}
          </div>
        </>
      );
    }

    if (message.role === "assistant") {
      const parts = message.parts ?? [];

      // Separate text parts from tool/UI parts to wrap text in a collapsible container
      const toolElements: React.ReactNode[] = [];
      const textElements: React.ReactNode[] = [];

      parts.forEach((part, index) => {
        if (part.type === "text" && part.text && part.text.trim() !== "") {
          if (looksLikeRawFunctionCallJson(part.text)) return;
          textElements.push(
            <p
              key={`t-${index}`}
              style={{
                fontSize: compact ? theme.font.size.sm : "15px",
                color: theme.colors.text,
                lineHeight: String(theme.font.lineHeight.relaxed),
                fontFamily: theme.font.family,
                whiteSpace: "pre-wrap",
                overflowWrap: "break-word",
                wordBreak: "break-word",
                paddingLeft: compact ? "10px" : "14px",
                borderLeft: `2px solid ${theme.colors.border}`,
                marginBottom: compact ? "6px" : "8px",
                minWidth: 0,
                maxWidth: "100%",
              }}
            >
              <TextWithLinks text={part.text} color={theme.colors.text} onLinkClick={setActiveUrl} />
            </p>,
          );
          return;
        }

        const aiPart = part as Parameters<typeof isToolUIPart>[0];
        if (isToolUIPart(aiPart) && getToolName(aiPart) === "agentStep") {
          const input = aiPart.input as { label?: string } | undefined;
          const label = input?.label?.trim() || "Working…";
          if (aiPart.state === "output-available") {
            if (isStreaming) {
              const out = aiPart.output as { ok?: boolean } | undefined;
              const ok = out?.ok !== false;
              toolElements.push(
                <AgentStepRow key={`s-${index}`} label={label} state={ok ? "done" : "error"} compact={compact} />,
              );
            }
          } else if (aiPart.state === "input-streaming" || aiPart.state === "input-available") {
            toolElements.push(<AgentStepRow key={`s-${index}`} label={label} state="active" compact={compact} />);
          }
          return;
        }

        if (isToolUIPart(aiPart) && getToolName(aiPart) === "analyzeJobPosting") {
          if (aiPart.state === "output-available") {
            const input = aiPart.input as { jobTitle?: string; company?: string };
            toolElements.push(
              <ResearchCard
                key={`a-${index}`}
                data={aiPart.output as JobAnalysis}
                company={input.company ?? ""}
                jobTitle={input.jobTitle ?? ""}
                compact={compact}
              />,
            );
          } else if (aiPart.state === "input-streaming" || aiPart.state === "input-available") {
            toolElements.push(
              <div key={`a-${index}`} style={{ display: "flex", alignItems: "center", gap: compact ? "5px" : "6px", padding: compact ? "3px 0" : "4px 0" }}>
                <Loader2 size={compact ? 11 : 12} color={theme.colors.textMuted} style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: compact ? theme.font.size.xs : theme.font.size.sm, color: theme.colors.textMuted, fontFamily: theme.font.family }}>
                  Analyzing role...
                </span>
              </div>,
            );
          }
          return;
        }

        if (
          part.type === "tool-invocation" &&
          (part as { state?: string }).state === "result" &&
          (part as { toolName?: string }).toolName === "analyzeJobPosting"
        ) {
          const typedPart = part as {
            toolName: string;
            state: string;
            input?: { jobTitle?: string; company?: string };
            output?: unknown;
          };
          toolElements.push(
            <ResearchCard
              key={`ar-${index}`}
              data={typedPart.output as JobAnalysis}
              company={typedPart.input?.company ?? ""}
              jobTitle={typedPart.input?.jobTitle ?? ""}
              compact={compact}
            />,
          );
          return;
        }

        if (
          part.type === "tool-invocation" &&
          (part as { state?: string }).state === "call" &&
          (part as { toolName?: string }).toolName === "analyzeJobPosting"
        ) {
          toolElements.push(
            <div key={`ac-${index}`} style={{ display: "flex", alignItems: "center", gap: compact ? "5px" : "6px", padding: compact ? "3px 0" : "4px 0" }}>
              <Loader2 size={compact ? 11 : 12} color={theme.colors.textMuted} style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: compact ? theme.font.size.xs : theme.font.size.sm, color: theme.colors.textMuted, fontFamily: theme.font.family }}>
                Analyzing role...
              </span>
            </div>,
          );
          return;
        }

        if (isToolUIPart(aiPart) && getToolName(aiPart) === "generateDocument") {
          if (aiPart.state === "output-available") {
            const input = aiPart.input as {
              title?: string;
              documentType?: string;
              documentRevision?: boolean;
            };
            const output = aiPart.output as {
              content?: string;
              format?: string;
              versionedDocumentId?: string;
            };
            const title = input?.title ?? "Document";
            const toolCallId =
              typeof (aiPart as { toolCallId?: string }).toolCallId === "string"
                ? (aiPart as { toolCallId: string }).toolCallId
                : "";
            const idFromOutput =
              typeof output?.versionedDocumentId === "string" ? output.versionedDocumentId.trim() : "";
            const idFromToolCall =
              toolCallId && documentVersionByToolCallId[toolCallId]
                ? documentVersionByToolCallId[toolCallId]
                : "";
            const versionedDocumentId = idFromOutput || idFromToolCall;
            const mapped = versionedDocumentId ? documentVersionMap[versionedDocumentId] : undefined;
            const content =
              mapped?.content ?? output?.content ?? stateDocContent ?? "";
            const isRevision = input?.documentRevision === true;

            const canOpenVersion =
              !!versionedDocumentId &&
              typeof onLoadDocumentVersion === "function" &&
              !!documentVersionMap[versionedDocumentId]?.content;
            const openThisDocument = () => {
              if (canOpenVersion) onLoadDocumentVersion!(versionedDocumentId);
              else if (onOpenDocument && content) onOpenDocument({ title, content });
            };
            const interactive = canOpenVersion || (!!onOpenDocument && !!content);
            const cardShellStyle: CSSProperties = {
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-start",
              gap: compact ? "8px" : "10px",
              padding: isRevision
                ? compact
                  ? "6px 10px"
                  : "8px 12px"
                : compact
                  ? "8px 10px"
                  : "10px 14px",
              marginTop: compact ? "6px" : "8px",
              minWidth: 0,
              maxWidth: "100%",
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.md,
              ...(interactive
                ? {
                    cursor: "pointer",
                    transition: "background 120ms ease, box-shadow 120ms ease",
                  }
                : {}),
            };

            if (isRevision) {
              toolElements.push(
                <button
                  key={`d-${index}`}
                  type="button"
                  disabled={!interactive}
                  onClick={interactive ? openThisDocument : undefined}
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openThisDocument();
                          }
                        }
                      : undefined
                  }
                  style={{ ...cardShellStyle, border: "none", textAlign: "left", font: "inherit" }}
                  onMouseEnter={
                    interactive
                      ? (e) => {
                          (e.currentTarget as HTMLButtonElement).style.background =
                            theme.colors.surfaceHover;
                        }
                      : undefined
                  }
                  onMouseLeave={
                    interactive
                      ? (e) => {
                          (e.currentTarget as HTMLButtonElement).style.background =
                            theme.colors.surface;
                        }
                      : undefined
                  }
                >
                  <FileText size={compact ? 14 : 15} color={theme.colors.success} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: compact ? theme.font.size.xs : theme.font.size.sm,
                        fontWeight: theme.font.weight.semibold,
                        color: theme.colors.text,
                        fontFamily: theme.font.family,
                        overflow: compact ? "visible" : "hidden",
                        textOverflow: compact ? "clip" : "ellipsis",
                        whiteSpace: compact ? "normal" : "nowrap",
                        overflowWrap: compact ? "anywhere" : undefined,
                        wordBreak: compact ? "break-word" : undefined,
                      }}
                    >
                      {title}
                    </p>
                    <p
                      style={{
                        fontSize: theme.font.size.xs,
                        color: theme.colors.textSecondary,
                        fontFamily: theme.font.family,
                        marginTop: "2px",
                      }}
                    >
                      {canOpenVersion
                        ? "Click to view this version in the editor"
                        : "Revised in your open editor"}
                    </p>
                  </div>
                  {canOpenVersion && (
                    <span
                      style={{
                        fontSize: theme.font.size.xs,
                        fontWeight: theme.font.weight.medium,
                        color: theme.colors.textSecondary,
                        fontFamily: theme.font.family,
                        flexShrink: 0,
                      }}
                    >
                      View version
                    </span>
                  )}
                </button>,
              );
            } else {
              toolElements.push(
                <button
                  key={`d-${index}`}
                  type="button"
                  disabled={!interactive}
                  onClick={interactive ? openThisDocument : undefined}
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openThisDocument();
                          }
                        }
                      : undefined
                  }
                  style={{ ...cardShellStyle, border: "none", textAlign: "left", font: "inherit" }}
                  onMouseEnter={
                    interactive
                      ? (e) => {
                          (e.currentTarget as HTMLButtonElement).style.background =
                            theme.colors.surfaceHover;
                        }
                      : undefined
                  }
                  onMouseLeave={
                    interactive
                      ? (e) => {
                          (e.currentTarget as HTMLButtonElement).style.background =
                            theme.colors.surface;
                        }
                      : undefined
                  }
                >
                  <FileText size={compact ? 14 : 16} color={theme.colors.textSecondary} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: compact ? theme.font.size.sm : theme.font.size.base,
                        fontWeight: theme.font.weight.semibold,
                        color: theme.colors.text,
                        fontFamily: theme.font.family,
                        overflow: compact ? "visible" : "hidden",
                        textOverflow: compact ? "clip" : "ellipsis",
                        whiteSpace: compact ? "normal" : "nowrap",
                        overflowWrap: compact ? "anywhere" : undefined,
                        wordBreak: compact ? "break-word" : undefined,
                      }}
                    >
                      {title}
                    </p>
                    <p
                      style={{
                        fontSize: theme.font.size.xs,
                        color: theme.colors.textMuted,
                        fontFamily: theme.font.family,
                        marginTop: "2px",
                      }}
                    >
                      {canOpenVersion
                        ? "Click to open this version in the editor"
                        : "Ready to edit and export"}
                    </p>
                  </div>
                  {onOpenDocument && content && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openThisDocument();
                      }}
                      className="gap-1.5 shrink-0"
                    >
                      <ExternalLink size={11} />
                      {canOpenVersion ? "View version" : "Open in Editor"}
                    </Button>
                  )}
                </button>,
              );
            }
          } else if (aiPart.state === "input-streaming" || aiPart.state === "input-available") {
            const input = aiPart.input as { documentRevision?: boolean };
            const isRevision = input?.documentRevision === true;
            toolElements.push(
              <div key={`dl-${index}`} style={{ display: "flex", alignItems: "center", gap: compact ? "5px" : "6px", padding: compact ? "3px 0" : "4px 0" }}>
                <Loader2 size={compact ? 11 : 12} color={theme.colors.textMuted} style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: compact ? theme.font.size.xs : theme.font.size.sm, color: theme.colors.textMuted, fontFamily: theme.font.family }}>
                  {isRevision ? "Applying revisions…" : "Generating document..."}
                </span>
              </div>,
            );
          }
          return;
        }
      });

      const assistantText = assistantMessagePlainText(message);
      const showAssistantCopy = assistantText.trim().length > 0;

      return (
        <>
          {activeUrl && <LinkModal url={activeUrl} onClose={() => setActiveUrl(null)} />}
          <div
            className="mount-anim"
            onMouseEnter={() => setAssistantRowHover(true)}
            onMouseLeave={() => setAssistantRowHover(false)}
            style={{
              position: "relative",
              display: "flex",
              justifyContent: "flex-start",
              margin: "3px 0",
              width: "100%",
              minWidth: 0,
              maxWidth: compact ? "100%" : "82%",
              boxSizing: "border-box",
              flexDirection: "column",
              paddingRight: showAssistantCopy ? (compact ? "30px" : "36px") : "0",
            }}
          >
            {showAssistantCopy && (
              <button
                type="button"
                onClick={handleCopyAssistant}
                title="Copy reply"
                aria-label="Copy assistant reply"
                style={{
                  position: "absolute",
                  top: "0",
                  right: "0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: compact ? "28px" : "30px",
                  height: compact ? "28px" : "30px",
                  borderRadius: "8px",
                  border: "none",
                  background:
                    assistantRowHover || copiedAssistant
                      ? theme.colors.surfaceElevated
                      : "transparent",
                  cursor: "pointer",
                  color: copiedAssistant ? theme.colors.success : theme.colors.textMuted,
                  opacity: assistantRowHover || copiedAssistant ? 1 : 0.35,
                  transition: "opacity 120ms ease, background 120ms ease, color 120ms ease",
                }}
              >
                {copiedAssistant ? (
                  <Check size={compact ? 14 : 15} strokeWidth={2.5} />
                ) : (
                  <Copy size={compact ? 14 : 15} />
                )}
              </button>
            )}
            {toolElements}
            {textElements.length > 0 && (
              <div>{textElements}</div>
            )}
          </div>
        </>
      );
    }

    return null;
  } catch {
    return (
      <div style={{ color: theme.colors.textMuted, fontSize: theme.font.size.sm, fontFamily: theme.font.family }}>
        Unable to display message.
      </div>
    );
  }
}

export default MessageBubble;
