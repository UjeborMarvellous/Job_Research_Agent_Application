import React, { useRef, useEffect } from "react";
import { Sparkles, Zap, Database, Layers } from "lucide-react";
import { theme } from "../types";
import type { UIMessage } from "../types";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import InputBar from "./InputBar";

interface ChatWindowProps {
  messages: UIMessage[];
  isStreaming: boolean;
  onSend: (text: string) => void;
}

export default function ChatWindow({ messages, isStreaming, onSend }: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isStreaming && <TypingIndicator />}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <InputBar onSend={onSend} disabled={isStreaming} />
    </div>
  );
}
