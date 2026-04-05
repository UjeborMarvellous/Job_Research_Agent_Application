import React, { useState, useRef, useEffect } from "react";
import { ArrowUp, Loader2, Paperclip, FileText, X } from "lucide-react";
import { theme } from "../types";
import { parseResumeFile } from "../utils/parseResumeFile";

interface InputBarProps {
  onSend: (text: string) => void;
  disabled: boolean;
  resumeFileName?: string;
  onResumeExtracted: (text: string, fileName: string) => void;
  onResumeRemove: () => void;
}

export default function InputBar({
  onSend,
  disabled,
  resumeFileName,
  onResumeExtracted,
  onResumeRemove,
}: InputBarProps) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadDisabled = disabled || parsing;

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setParsing(true);
    try {
      const text = await parseResumeFile(file);
      onResumeExtracted(text, file.name);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {resumeFileName && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 10px",
              background: theme.colors.orangeDim,
              border: `1px solid ${theme.colors.orangeBorder}`,
              borderRadius: theme.radius.sm,
            }}
          >
            <FileText size={14} color={theme.colors.orange} />
            <span
              style={{
                flex: 1,
                fontSize: theme.font.size.sm,
                color: theme.colors.text,
                fontFamily: theme.font.family,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Resume: {resumeFileName}
            </span>
            <button
              type="button"
              onClick={onResumeRemove}
              title="Remove resume from display (server may still hold last upload until replaced)"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "22px",
                height: "22px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                borderRadius: theme.radius.sm,
                flexShrink: 0,
              }}
            >
              <X size={14} color={theme.colors.textMuted} />
            </button>
          </div>
        )}

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
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!uploadDisabled) fileInputRef.current?.click();
            }}
            disabled={uploadDisabled}
            title="Attach resume"
            style={{
              width: "32px",
              height: "32px",
              flexShrink: 0,
              border: "none",
              borderRadius: theme.radius.md,
              cursor: uploadDisabled ? "not-allowed" : "pointer",
              background: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: theme.transition,
            }}
          >
            {parsing ? (
              <Loader2
                size={17}
                color={theme.colors.textMuted}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : (
              <Paperclip
                size={17}
                color={uploadDisabled ? theme.colors.textMuted : theme.colors.textSecondary}
              />
            )}
          </button>
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
            type="button"
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

        {parseError && (
          <p
            style={{
              fontSize: theme.font.size.xs,
              color: theme.colors.danger,
              fontFamily: theme.font.family,
              margin: 0,
            }}
          >
            {parseError}
          </p>
        )}
      </div>
    </>
  );
}
