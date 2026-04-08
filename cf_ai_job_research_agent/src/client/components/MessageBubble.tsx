import { useState } from "react";
import { Loader2, FileText, ExternalLink } from "lucide-react";
import { getToolName, isToolUIPart } from "ai";
import { theme } from "../types";
import type { UIMessage, JobAnalysis } from "../types";
import AgentStepRow from "./AgentStepRow";
import ResearchCard from "./ResearchCard";
import { Button } from "./ui/button";

// ─── URL chip helpers ─────────────────────────────────────────────────────────

type Segment = { type: "text"; value: string } | { type: "url"; value: string };

const URL_RE = /https?:\/\/[^\s<>"]+/g;

function parseTextWithLinks(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: "text", value: text.slice(last, m.index) });
    segments.push({ type: "url", value: m[0] });
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
            onClick={() => onLinkClick(seg.value)}
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
}

export default function MessageBubble({ message, onOpenDocument }: MessageBubbleProps) {
  const [activeUrl, setActiveUrl] = useState<string | null>(null);

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
        const remainingText = resumeMatch[2].trim();
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
            {message.parts?.map((part, index) => {
              if (part.type === "text" && part.text && part.text.trim() !== "") {
                if (looksLikeRawFunctionCallJson(part.text)) return null;
                return (
                  <p
                    key={index}
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
                  </p>
                );
              }

              const aiPart = part as Parameters<typeof isToolUIPart>[0];
              if (isToolUIPart(aiPart) && getToolName(aiPart) === "agentStep") {
                const input = aiPart.input as { label?: string } | undefined;
                const label = input?.label?.trim() || "Working…";
                if (aiPart.state === "output-available") {
                  const out = aiPart.output as { ok?: boolean } | undefined;
                  const ok = out?.ok !== false;
                  return <AgentStepRow key={index} label={label} state={ok ? "done" : "error"} />;
                }
                if (aiPart.state === "input-streaming" || aiPart.state === "input-available") {
                  return <AgentStepRow key={index} label={label} state="active" />;
                }
              }

              if (isToolUIPart(aiPart) && getToolName(aiPart) === "analyzeJobPosting") {
                if (aiPart.state === "output-available") {
                  const input = aiPart.input as { jobTitle?: string; company?: string };
                  return (
                    <ResearchCard
                      key={index}
                      data={aiPart.output as JobAnalysis}
                      company={input.company ?? ""}
                      jobTitle={input.jobTitle ?? ""}
                    />
                  );
                }
                if (aiPart.state === "input-streaming" || aiPart.state === "input-available") {
                  return (
                    <div key={index} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 0" }}>
                      <Loader2 size={12} color={theme.colors.textMuted} style={{ animation: "spin 1s linear infinite" }} />
                      <span style={{ fontSize: theme.font.size.sm, color: theme.colors.textMuted, fontFamily: theme.font.family }}>
                        Analyzing role...
                      </span>
                    </div>
                  );
                }
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
                return (
                  <ResearchCard
                    key={index}
                    data={typedPart.output as JobAnalysis}
                    company={typedPart.input?.company ?? ""}
                    jobTitle={typedPart.input?.jobTitle ?? ""}
                  />
                );
              }

              if (
                part.type === "tool-invocation" &&
                (part as { state?: string }).state === "call" &&
                (part as { toolName?: string }).toolName === "analyzeJobPosting"
              ) {
                return (
                  <div key={index} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 0" }}>
                    <Loader2 size={12} color={theme.colors.textMuted} style={{ animation: "spin 1s linear infinite" }} />
                    <span style={{ fontSize: theme.font.size.sm, color: theme.colors.textMuted, fontFamily: theme.font.family }}>
                      Analyzing role...
                    </span>
                  </div>
                );
              }

              if (isToolUIPart(aiPart) && getToolName(aiPart) === "generateDocument") {
                if (aiPart.state === "output-available") {
                  const input = aiPart.input as { title?: string; documentType?: string };
                  const output = aiPart.output as { content?: string; format?: string };
                  const title = input?.title ?? "Document";
                  const content = output?.content ?? "";

                  return (
                    <div
                      key={index}
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
                    </div>
                  );
                }

                if (aiPart.state === "input-streaming" || aiPart.state === "input-available") {
                  return (
                    <div key={index} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 0" }}>
                      <Loader2 size={12} color={theme.colors.textMuted} style={{ animation: "spin 1s linear infinite" }} />
                      <span style={{ fontSize: theme.font.size.sm, color: theme.colors.textMuted, fontFamily: theme.font.family }}>
                        Generating document...
                      </span>
                    </div>
                  );
                }
              }

              return null;
            })}
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
