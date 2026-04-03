import React, { useState, useRef, useEffect } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { theme } from "../types";

interface InputBarProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export default function InputBar({ onSend, disabled }: InputBarProps) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [value]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        textarea::placeholder { color: ${theme.colors.textMuted}; }
      `}</style>
      <div
        style={{
          flexShrink: 0,
          borderTop: `1px solid ${theme.colors.border}`,
          background: theme.colors.surface,
          padding: "12px 16px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-end",
            gap: "10px",
            background: theme.colors.surfaceElevated,
            border: focused
              ? `1px solid ${theme.colors.orange}`
              : `1px solid ${theme.colors.border}`,
            boxShadow: focused
              ? `0 0 0 3px ${theme.colors.orangeDim}`
              : "none",
            borderRadius: theme.radius.lg,
            padding: "10px 12px",
            transition: theme.transition,
          }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Paste a job description or ask about a company..."
            rows={1}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontFamily: theme.font.family,
              fontSize: theme.font.size.base,
              color: theme.colors.text,
              lineHeight: String(theme.font.lineHeight.base),
              minHeight: "24px",
              maxHeight: "120px",
              resize: "none",
            }}
          />
          <button
            onClick={handleSend}
            style={{
              width: "32px",
              height: "32px",
              flexShrink: 0,
              border: "none",
              borderRadius: theme.radius.md,
              cursor: disabled || !value.trim() ? "not-allowed" : "pointer",
              background:
                value.trim() && !disabled
                  ? theme.colors.orange
                  : theme.colors.surfaceElevated,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: theme.transition,
            }}
          >
            {disabled ? (
              <Loader2
                size={15}
                color={theme.colors.textMuted}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : (
              <ArrowUp
                size={15}
                color={value.trim() ? theme.colors.white : theme.colors.textMuted}
              />
            )}
          </button>
        </div>
      </div>
    </>
  );
}
