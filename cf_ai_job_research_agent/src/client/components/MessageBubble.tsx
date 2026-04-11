import { useState, useRef, useEffect } from "react";
import { Loader2, FileText, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { getToolName, isToolUIPart } from "ai";
import { theme } from "../types";
import type { UIMessage, JobAnalysis } from "../types";
import AgentStepRow from "./AgentStepRow";
import ResearchCard from "./ResearchCard";
import { Button } from "./ui/button";

// ─── URL chip helpers ─────────────────────────────────────────────────────────

type Segment = { type: "text"; value: string } | { type: "url"; value: string };

// Matches full URLs (https?://) OR bare domain.tld patterns like linkedin.com/jobs.
// The lookbehind prevents matching mid-word or email addresses (foo@domain.com).
const URL_RE =
  /https?:\/\/[^\s<>"]+|(?<![a-zA-Z0-9@])([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:com|org|net|io|co|jobs|app|edu|gov|ai|dev)(?:\/[^\s<>"()\[\]]*)?)/g;

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
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          background: "rgba(0,0,0,0.18)",
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
  color,
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
          <span
            key={i}
            onClick={() => onLinkClick(ensureProtocol(seg.value))}
            style={{
              color: theme.colors.textSecondary,
              textDecoration: "underline",
              cursor: "pointer",
              borderRadius: "3px",
              padding: "0 2px",
              transition: "background 100ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLSpanElement).style.background = theme.colors.surfaceElevated;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLSpanElement).style.background = "transparent";
            }}
          >
            {seg.value}
          </span>
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
  onOpenDocument?: (doc: { title: string; content: string }) => void;
  /** Full document from DO state — used instead of (possibly truncated) message part content. */
  stateDocContent?: string | null;
}

const TEXT_COLLAPSE_HEIGHT = 160;

function MessageBubble({ message, onOpenDocument, stateDocContent }: MessageBubbleProps) {
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [textExpanded, setTextExpanded] = useState(false);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const textContainerRef = useRef<HTMLDivElement>(null);

  // Fingerprint that detects real content changes without relying on the parts
  // array reference (which the AI SDK recreates on every streaming chunk).
  const partsSig = (() => {
    const parts = message.parts ?? [];
    let textLen = 0;
    for (const p of parts) {
      const part = p as { type?: string; text?: string };
      if (part.type === "text") textLen += (part.text ?? "").length;
    }
    const lastState = (parts[parts.length - 1] as { state?: string } | undefined)?.state ?? "";
    return `${parts.length}:${textLen}:${lastState}`;
  })();
  useEffect(() => {
    const el = textContainerRef.current;
    if (!el) return;
    setNeedsCollapse(el.scrollHeight > TEXT_COLLAPSE_HEIGHT + 40);
  }, [partsSig]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const remainingText = delimIdx >= 0
          ? rawPayload.slice(delimIdx + "---USER_INTENT---".length).trim()
          : "";
        return (
          <>
            {activeUrl && <LinkModal url={activeUrl} onClose={() => setActiveUrl(null)} />}
            <div
              className="mount-anim"
              style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", margin: "3px 0", gap: "4px" }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 12px",
                  background: theme.colors.text,
                  borderRadius: "18px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  maxWidth: "68%",
                }}
              >
                <FileText size={13} color="#ffffff" style={{ flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: theme.font.size.sm,
                    color: "#ffffff",
                    fontFamily: theme.font.family,
                    fontWeight: theme.font.weight.medium,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "220px",
                  }}
                >
                  {fileName}
                </span>
              </div>
              {remainingText && (
                <div
                  style={{
                    background: theme.colors.text,
                    borderRadius: "18px",
                    padding: "10px 16px",
                    maxWidth: "68%",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  }}
                >
                  <p
                    style={{
                      fontSize: theme.font.size.base,
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
          </>
        );
      }

      if (text.startsWith("[view-entry:")) return null;

      return (
        <>
          {activeUrl && <LinkModal url={activeUrl} onClose={() => setActiveUrl(null)} />}
          <div
            className="mount-anim"
            style={{ display: "flex", justifyContent: "flex-end", margin: "3px 0" }}
          >
            <div
              style={{
                background: theme.colors.text,
                borderRadius: "18px",
                padding: "10px 16px",
                maxWidth: "68%",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              }}
            >
              <p
                style={{
                  fontSize: theme.font.size.base,
                  color: "#ffffff",
                  lineHeight: String(theme.font.lineHeight.relaxed),
                  fontFamily: theme.font.family,
                  whiteSpace: "pre-wrap",
                }}
              >
                <TextWithLinks text={text} color="#ffffff" onLinkClick={setActiveUrl} />
              </p>
            </div>
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
                fontSize: "15px",
                color: theme.colors.text,
                lineHeight: String(theme.font.lineHeight.relaxed),
                fontFamily: theme.font.family,
                whiteSpace: "pre-wrap",
                paddingLeft: "14px",
                borderLeft: `2px solid ${theme.colors.border}`,
                marginBottom: "8px",
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
            const out = aiPart.output as { ok?: boolean } | undefined;
            const ok = out?.ok !== false;
            toolElements.push(<AgentStepRow key={`s-${index}`} label={label} state={ok ? "done" : "error"} />);
          } else if (aiPart.state === "input-streaming" || aiPart.state === "input-available") {
            toolElements.push(<AgentStepRow key={`s-${index}`} label={label} state="active" />);
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
              />,
            );
          } else if (aiPart.state === "input-streaming" || aiPart.state === "input-available") {
            toolElements.push(
              <div key={`a-${index}`} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 0" }}>
                <Loader2 size={12} color={theme.colors.textMuted} style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: theme.font.size.sm, color: theme.colors.textMuted, fontFamily: theme.font.family }}>
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
            <div key={`ac-${index}`} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 0" }}>
              <Loader2 size={12} color={theme.colors.textMuted} style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: theme.font.size.sm, color: theme.colors.textMuted, fontFamily: theme.font.family }}>
                Analyzing role...
              </span>
            </div>,
          );
          return;
        }

        if (isToolUIPart(aiPart) && getToolName(aiPart) === "generateDocument") {
          if (aiPart.state === "output-available") {
            const input = aiPart.input as { title?: string; documentType?: string };
            const output = aiPart.output as { content?: string; format?: string };
            const title = input?.title ?? "Document";
            const content = stateDocContent ?? output?.content ?? "";

            toolElements.push(
              <div
                key={`d-${index}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 14px",
                  marginTop: "8px",
                  background: theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.radius.md,
                }}
              >
                <FileText size={16} color={theme.colors.textSecondary} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: theme.font.size.base,
                      fontWeight: theme.font.weight.semibold,
                      color: theme.colors.text,
                      fontFamily: theme.font.family,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {title}
                  </p>
                  <p style={{ fontSize: theme.font.size.xs, color: theme.colors.textMuted, fontFamily: theme.font.family, marginTop: "2px" }}>
                    Ready to edit and export
                  </p>
                </div>
                {onOpenDocument && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpenDocument({ title, content })}
                    className="gap-1.5 shrink-0"
                  >
                    <ExternalLink size={11} />
                    Open in Editor
                  </Button>
                )}
              </div>,
            );
          } else if (aiPart.state === "input-streaming" || aiPart.state === "input-available") {
            toolElements.push(
              <div key={`dl-${index}`} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 0" }}>
                <Loader2 size={12} color={theme.colors.textMuted} style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: theme.font.size.sm, color: theme.colors.textMuted, fontFamily: theme.font.family }}>
                  Generating document...
                </span>
              </div>,
            );
          }
          return;
        }
      });

      const showCollapse = needsCollapse && !textExpanded;

      return (
        <>
          {activeUrl && <LinkModal url={activeUrl} onClose={() => setActiveUrl(null)} />}
          <div
            className="mount-anim"
            style={{
              display: "flex",
              justifyContent: "flex-start",
              margin: "3px 0",
              maxWidth: "82%",
              flexDirection: "column",
            }}
          >
            {toolElements}
            {textElements.length > 0 && (
              <div style={{ position: "relative" }}>
                <div
                  ref={textContainerRef}
                  style={{
                    maxHeight: showCollapse ? `${TEXT_COLLAPSE_HEIGHT}px` : undefined,
                    overflow: showCollapse ? "hidden" : undefined,
                  }}
                >
                  {textElements}
                </div>
                {showCollapse && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: "48px",
                      background: "linear-gradient(transparent, #ffffff)",
                      pointerEvents: "none",
                    }}
                  />
                )}
                {needsCollapse && (
                  <button
                    onClick={() => setTextExpanded((v) => !v)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      margin: "4px 0 0 14px",
                      padding: "2px 8px",
                      fontSize: theme.font.size.xs,
                      color: theme.colors.textSecondary,
                      fontFamily: theme.font.family,
                      background: "none",
                      border: `1px solid ${theme.colors.border}`,
                      borderRadius: theme.radius.sm,
                      cursor: "pointer",
                    }}
                  >
                    {textExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {textExpanded ? "Show less" : "Show more"}
                  </button>
                )}
              </div>
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
