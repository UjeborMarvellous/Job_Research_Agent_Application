import React, { useRef, useEffect, useState } from "react";
import { Sparkles, Zap, Database, Layers, AlertTriangle } from "lucide-react";
import { theme } from "../types";
import type { UIMessage } from "../types";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import InputBar from "./InputBar";

const STALL_TIMEOUT_MS = 45_000;

interface ChatWindowProps {
  messages: UIMessage[];
  isStreaming: boolean;
  onSend: (text: string) => void;
  onOpenDocument?: (doc: { title: string; content: string }) => void;
}

export default function ChatWindow({ messages, isStreaming, onSend, onOpenDocument }: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [stalled, setStalled] = useState(false);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, [isStreaming, messages.length]);

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
          background: theme.colors.surface,
          borderBottom: `1px solid ${theme.colors.border}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Sparkles size={15} color={theme.colors.orange} />
          <span
            style={{
              fontSize: theme.font.size.md,
              fontWeight: theme.font.weight.semibold,
              color: theme.colors.text,
              fontFamily: theme.font.family,
            }}
          >
            Job Research Agent
          </span>
        </div>
        <span
          style={{
            fontSize: theme.font.size.xs,
            color: theme.colors.textMuted,
            fontFamily: theme.font.family,
          }}
        >
          Powered by Cloudflare Workers AI
        </span>
      </div>

      {/* Message area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px",
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              paddingTop: "80px",
            }}
          >
            <Sparkles size={36} color={theme.colors.orange} />
            <p
              style={{
                fontSize: theme.font.size.xxl,
                fontWeight: theme.font.weight.semibold,
                color: theme.colors.text,
                marginTop: "16px",
                fontFamily: theme.font.family,
              }}
            >
              Research any role, instantly.
            </p>
            <p
              style={{
                fontSize: theme.font.size.md,
                color: theme.colors.textSecondary,
                marginTop: "8px",
                fontFamily: theme.font.family,
              }}
            >
              Paste a job description or company name to get started.
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                gap: "8px",
                marginTop: "28px",
              }}
            >
              {[
                { icon: <Zap size={10} color={theme.colors.textMuted} />, label: "AI Analysis" },
                { icon: <Database size={10} color={theme.colors.textMuted} />, label: "Persistent Memory" },
                { icon: <Layers size={10} color={theme.colors.textMuted} />, label: "Structured Insights" },
              ].map(({ icon, label }) => (
                <div
                  key={label}
                  style={{
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.radius.sm,
                    padding: "5px 10px",
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  {icon}
                  <span
                    style={{
                      fontSize: theme.font.size.xs,
                      color: theme.colors.textMuted,
                      fontFamily: theme.font.family,
                    }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
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

      {/* Stalled-stream banner */}
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
            The response is taking longer than expected. You can wait or try
            sending your message again.
          </span>
        </div>
      )}

      {/* Input */}
      <InputBar onSend={onSend} disabled={isStreaming} />
    </div>
  );
}
