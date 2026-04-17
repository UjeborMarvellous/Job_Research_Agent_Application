import React, { useRef, useEffect, useState, useMemo } from "react";
import { ScanSearch, AlertTriangle, Menu } from "lucide-react";
import { theme } from "../types";
import type { DocumentSnapshot, UIMessage } from "../types";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import InputBar from "./InputBar";
import { ScrollArea } from "./ui/scroll-area";
import { getUserMessagePlainTextForComposer } from "../utils/userMessageComposerText";

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
  onRetry?: () => void;
  onOpenDocument?: (doc: { title: string; content: string }, opts?: { fromAgent?: boolean }) => void;
  /** Full document from DO state (bypasses message truncation). */
  stateDocContent?: string | null;
  documentVersionMap?: Record<string, DocumentSnapshot>;
  /** toolCallId → snapshot id (survives when tool output is sanitized). */
  documentVersionByToolCallId?: Record<string, string>;
  /** Load a snapshot into the editor (by deterministic id from tool output). */
  onLoadDocumentVersion?: (versionedDocumentId: string) => void;
  resumeFileName?: string;
  onResumeExtracted: (text: string, fileName: string) => void;
  onResumeRemove: () => void;
  pendingResumeFileName?: string;
  /** When set, InputBar loads this text once (e.g. edit-message flow). */
  composerSeed?: { text: string; nonce: number } | null;
  onComposerSeedConsumed?: () => void;
  /** Truncate history at index and send to regenerate from an edited user message. */
  onBeginEditUserMessage?: (messageIndex: number) => void;
  isMobile?: boolean;
  onOpenSidebar?: () => void;
}

export default function ChatWindow({
  messages,
  isStreaming,
  onSend,
  onRetry,
  onOpenDocument,
  stateDocContent,
  documentVersionMap = {},
  documentVersionByToolCallId = {},
  onLoadDocumentVersion,
  resumeFileName,
  onResumeExtracted,
  onResumeRemove,
  pendingResumeFileName,
  composerSeed,
  onComposerSeedConsumed,
  onBeginEditUserMessage,
  isMobile,
  onOpenSidebar,
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
        minHeight: 0,
        minWidth: 0,
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
        background: theme.colors.background,
        borderRadius: "16px",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: isMobile ? "48px" : "56px",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 0,
          paddingBottom: 0,
          paddingLeft: isMobile ? "max(10px, env(safe-area-inset-left, 0px))" : "24px",
          paddingRight: isMobile ? "max(10px, env(safe-area-inset-right, 0px))" : "24px",
          background: theme.colors.background,
          borderBottom: `1px solid ${theme.colors.border}`,
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "8px" : "10px" }}>
          {isMobile && onOpenSidebar && (
            <button
              onClick={onOpenSidebar}
              aria-label="Open sidebar"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: theme.colors.text,
                flexShrink: 0,
              }}
            >
              <Menu size={18} />
            </button>
          )}
          <IdentityMark size={isMobile ? 14 : 15} containerSize={isMobile ? 28 : 32} />
          <span style={{ fontFamily: theme.font.family }}>
            <span
              style={{
                fontSize: isMobile ? theme.font.size.sm : theme.font.size.md,
                fontWeight: theme.font.weight.medium,
                color: theme.colors.text,
              }}
            >
              Research{" "}
            </span>
            <span
              style={{
                fontSize: isMobile ? theme.font.size.sm : theme.font.size.md,
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
      <ScrollArea className="flex-1 min-w-0 min-h-0 overflow-x-hidden">
        <div
          style={{
            padding: isMobile ? "10px 12px" : "24px",
            overflowWrap: "break-word",
            wordBreak: "break-word",
            minWidth: 0,
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
            overflowX: "hidden",
          }}
        >
          {messages.length === 0 ? (
            // ── Empty state ──────────────────────────────────────────────────
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                paddingTop: isMobile ? "40px" : "100px",
                paddingBottom: isMobile ? "30px" : "60px",
                minHeight: isMobile ? "200px" : "400px",
                animation: "fadeSlideUp 250ms ease forwards",
              }}
            >
              <IdentityMark size={isMobile ? 22 : 28} containerSize={isMobile ? 44 : 56} />

              <p
                style={{
                  fontSize: isMobile ? theme.font.size.lg : "22px",
                  fontWeight: theme.font.weight.semibold,
                  color: theme.colors.text,
                  marginTop: isMobile ? "14px" : "20px",
                  fontFamily: theme.font.family,
                  textAlign: "center",
                }}
              >
                Research any role.
              </p>

              <p
                style={{
                  fontSize: isMobile ? theme.font.size.sm : theme.font.size.md,
                  color: theme.colors.textSecondary,
                  marginTop: isMobile ? "8px" : "10px",
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
                  fontSize: isMobile ? theme.font.size.sm : theme.font.size.md,
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
              {(() => {
                // stateDocContent is the latest DO-state document; only pass it
                // to the last assistant bubble as a fallback when a tool part has
                // no versionedDocumentId (legacy threads).
                const lastAssistantId =
                  [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null;
                return messages.map((msg, index) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    messageIndex={index}
                    onOpenDocument={onOpenDocument}
                    stateDocContent={msg.id === lastAssistantId ? stateDocContent : null}
                    documentVersionMap={documentVersionMap}
                    documentVersionByToolCallId={documentVersionByToolCallId}
                    onLoadDocumentVersion={onLoadDocumentVersion}
                    isStreaming={msg.id === lastAssistantId && isStreaming}
                    isMobile={isMobile}
                    canEditUserMessage={
                      msg.role === "user" &&
                      !!onBeginEditUserMessage &&
                      getUserMessagePlainTextForComposer(msg) !== null
                    }
                    onEditUserMessage={onBeginEditUserMessage}
                  />
                ));
              })()}
              {isStreaming && (() => {
                const last = messages[messages.length - 1];
                const lastHasParts = last?.role === "assistant" && (last.parts?.length ?? 0) > 0;
                if (lastHasParts) return null;
                const lastUser = [...messages].reverse().find(m => m.role === "user");
                const lastUserText = (lastUser?.parts ?? []).find((p: {type?: string; text?: string}) => p.type === "text")?.text ?? "";
                const hint = lastUserText.length > 300 ? "Analyzing role — this may take up to 20 seconds…" : "Thinking…";
                return <TypingIndicator message={hint} isMobile={isMobile} />;
              })()}
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
            gap: isMobile ? "6px" : "8px",
            padding: isMobile ? "6px 10px" : "8px 16px",
            background: theme.colors.dangerDim,
            borderTop: `1px solid ${theme.colors.dangerBorder}`,
            flexShrink: 0,
          }}
        >
          <AlertTriangle size={isMobile ? 12 : 13} color={theme.colors.danger} />
          <span
            style={{
              fontSize: isMobile ? theme.font.size.xs : theme.font.size.sm,
              color: theme.colors.danger,
              fontFamily: theme.font.family,
              flex: 1,
              minWidth: 0,
            }}
          >
            Still working — large job analyses can take up to a minute.
          </span>
          {onRetry && (
            <button
              onClick={onRetry}
              style={{
                fontSize: isMobile ? theme.font.size.xs : theme.font.size.sm,
                fontFamily: theme.font.family,
                color: theme.colors.danger,
                background: "transparent",
                border: `1px solid ${theme.colors.dangerBorder}`,
                borderRadius: "6px",
                padding: isMobile ? "2px 8px" : "2px 10px",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}

      <InputBar
        onSend={onSend}
        disabled={isStreaming}
        resumeFileName={resumeFileName}
        onResumeExtracted={onResumeExtracted}
        onResumeRemove={onResumeRemove}
        pendingResumeFileName={pendingResumeFileName}
        composerSeed={composerSeed}
        onComposerSeedConsumed={onComposerSeedConsumed}
        isMobile={isMobile}
      />
    </div>
  );
}
