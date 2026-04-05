import React, { useRef, useEffect, useState, useMemo } from "react";
import { ScanSearch, AlertTriangle } from "lucide-react";
import { theme } from "../types";
import type { UIMessage } from "../types";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import InputBar from "./InputBar";
import { ScrollArea } from "./ui/scroll-area";

/** No progress for this long while streaming → show gentle notice (job analysis can be 30–60s+). */
const STALL_TIMEOUT_MS = 90_000;

/** Identity mark stamp — ScanSearch on a dark/black square (inverse on white bg). */
function IdentityMark({ size = 15, containerSize = 32 }: { size?: number; containerSize?: number }) {
  return (
    <div
      style={{
        width: `${containerSize}px`,
        height: `${containerSize}px`,
        borderRadius: "8px",
        background: theme.colors.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
      }}
    >
      <ScanSearch size={size} color={theme.colors.white} />
    </div>
  );
}

function streamingProgressKey(messages: UIMessage[]): string {
  const last = messages[messages.length - 1];
  if (!last) return "0";
  let textLen = 0;
  let toolStates = 0;
  for (const p of last.parts ?? []) {
    const part = p as { type?: string; text?: string; state?: string };
    if (part.type === "text" && typeof part.text === "string") textLen += part.text.length;
    if (typeof part.type === "string" && part.type.startsWith("tool")) {
      toolStates += 1;
      if ("state" in part && typeof part.state === "string") toolStates += part.state.length;
    }
  }
  return `${last.id}:${textLen}:${toolStates}`;
}

interface ChatWindowProps {
  messages: UIMessage[];
  isStreaming: boolean;
  onSend: (text: string) => void;
  onOpenDocument?: (doc: { title: string; content: string }) => void;
  resumeFileName?: string;
  onResumeExtracted: (text: string, fileName: string) => void;
  onResumeRemove: () => void;
}

export default function ChatWindow({
  messages,
  isStreaming,
  onSend,
  onOpenDocument,
  resumeFileName,
  onResumeExtracted,
  onResumeRemove,
}: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [stalled, setStalled] = useState(false);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const progressKey = useMemo(() => streamingProgressKey(messages), [messages]);

  useEffect(() => {
    if (stallTimer.current) clearTimeout(stallTimer.current);
    if (isStreaming) {
      setStalled(false);
      stallTimer.current = setTimeout(() => setStalled(true), STALL_TIMEOUT_MS);
    } else {
      setStalled(false);
    }
    return () => {
      if (stallTimer.current) clearTimeout(stallTimer.current);
    };
  }, [isStreaming, progressKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflow: "hidden",
        background: theme.colors.background,
        borderRadius: "16px",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: "56px",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          background: theme.colors.background,
          borderBottom: `1px solid ${theme.colors.border}`,
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <IdentityMark size={15} containerSize={32} />
          <span style={{ fontFamily: theme.font.family }}>
            <span
              style={{
                fontSize: theme.font.size.md,
                fontWeight: theme.font.weight.medium,
                color: theme.colors.text,
              }}
            >
              Research{" "}
            </span>
            <span
              style={{
                fontSize: theme.font.size.md,
                fontWeight: theme.font.weight.medium,
                color: theme.colors.textSecondary,
              }}
            >
              Agent
            </span>
          </span>
        </div>
      </div>

      {/* Message area */}
      <ScrollArea className="flex-1">
        <div style={{ padding: "24px" }}>
          {messages.length === 0 ? (
            // ── Empty state ──────────────────────────────────────────────────
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                paddingTop: "100px",
                paddingBottom: "60px",
                minHeight: "400px",
                animation: "fadeSlideUp 250ms ease forwards",
              }}
            >
              <IdentityMark size={28} containerSize={56} />

              <p
                style={{
                  fontSize: "22px",
                  fontWeight: theme.font.weight.semibold,
                  color: theme.colors.text,
                  marginTop: "20px",
                  fontFamily: theme.font.family,
                  textAlign: "center",
                }}
              >
                Research any role.
              </p>

              <p
                style={{
                  fontSize: theme.font.size.md,
                  color: theme.colors.textSecondary,
                  marginTop: "10px",
                  fontFamily: theme.font.family,
                  textAlign: "center",
                  lineHeight: String(theme.font.lineHeight.relaxed),
                  maxWidth: "360px",
                }}
              >
                Paste a job description to get a full company and role breakdown.
              </p>
              <p
                style={{
                  fontSize: theme.font.size.md,
                  color: theme.colors.textSecondary,
                  marginTop: "6px",
                  fontFamily: theme.font.family,
                  textAlign: "center",
                  lineHeight: String(theme.font.lineHeight.relaxed),
                  maxWidth: "360px",
                }}
              >
                Upload your resume to get personalized positioning advice.
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} onOpenDocument={onOpenDocument} />
              ))}
              {isStreaming && <TypingIndicator />}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Stall banner */}
      {stalled && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            background: theme.colors.dangerDim,
            borderTop: `1px solid ${theme.colors.dangerBorder}`,
            flexShrink: 0,
          }}
        >
          <AlertTriangle size={13} color={theme.colors.danger} />
          <span
            style={{
              fontSize: theme.font.size.sm,
              color: theme.colors.danger,
              fontFamily: theme.font.family,
            }}
          >
            Still working — large job analyses can take up to a minute. You can
            keep waiting; avoid sending again unless nothing changes for several minutes.
          </span>
        </div>
      )}

      <InputBar
        onSend={onSend}
        disabled={isStreaming}
        resumeFileName={resumeFileName}
        onResumeExtracted={onResumeExtracted}
        onResumeRemove={onResumeRemove}
      />
    </div>
  );
}
