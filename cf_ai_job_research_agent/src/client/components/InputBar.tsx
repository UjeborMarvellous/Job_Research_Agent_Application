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
  pendingResumeFileName?: string;
  /** One-shot prefill (e.g. edit message). `nonce` changes each time so identical text still applies. */
  composerSeed?: { text: string; nonce: number } | null;
  onComposerSeedConsumed?: () => void;
  isMobile?: boolean;
}

export default function InputBar({
  onSend,
  disabled,
  resumeFileName,
  onResumeExtracted,
  onResumeRemove,
  pendingResumeFileName,
  composerSeed,
  onComposerSeedConsumed,
  isMobile,
}: InputBarProps) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadDisabled = disabled || parsing;
  const canSend = !disabled && (value.trim().length > 0 || !!pendingResumeFileName);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [value]);

  useEffect(() => {
    if (!composerSeed) return;
    setValue(composerSeed.text);
    onComposerSeedConsumed?.();
    queueMicrotask(() => textareaRef.current?.focus());
  }, [composerSeed, onComposerSeedConsumed]);

  const handleSend = () => {
    const trimmed = value.trim();
    if ((!trimmed && !pendingResumeFileName) || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
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
    <div
      style={{
        flexShrink: 0,
        minWidth: 0,
        width: "100%",
        maxWidth: "100%",
        padding: isMobile
          ? `6px 8px max(8px, env(safe-area-inset-bottom, 0px))`
          : "10px 14px 14px",
        display: "flex",
        flexDirection: "column",
        gap: isMobile ? "6px" : "8px",
        background: theme.colors.background,
        borderTop: `1px solid ${theme.colors.border}`,
        boxSizing: "border-box",
      }}
    >
      {/* Resume chip */}
      {(resumeFileName || pendingResumeFileName) && (
        <div style={{ display: "flex", alignItems: "center", paddingLeft: "2px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: isMobile ? "4px" : "6px",
              height: isMobile ? "26px" : "28px",
              padding: isMobile ? "0 4px 0 8px" : "0 4px 0 10px",
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: "20px",
              maxWidth: isMobile ? "min(100%, 220px)" : "260px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              flexShrink: 0,
            }}
          >
            <FileText size={isMobile ? 11 : 12} color={theme.colors.textSecondary} style={{ flexShrink: 0 }} />
            <span
              style={{
                fontSize: isMobile ? theme.font.size.xs : theme.font.size.sm,
                fontFamily: theme.font.family,
                color: theme.colors.text,
                fontWeight: theme.font.weight.medium,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: isMobile ? "140px" : "180px",
              }}
            >
              {resumeFileName ?? pendingResumeFileName}
            </span>
            <button
              type="button"
              onClick={onResumeRemove}
              title="Remove resume"
              aria-label="Remove resume"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                flexShrink: 0,
                color: theme.colors.textMuted,
                transition: "background 120ms ease, color 120ms ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = theme.colors.surfaceElevated;
                (e.currentTarget as HTMLButtonElement).style.color = theme.colors.text;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                (e.currentTarget as HTMLButtonElement).style.color = theme.colors.textMuted;
              }}
            >
              <X size={11} />
            </button>
          </div>
        </div>
      )}

      {/* Input row */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          minWidth: 0,
          width: "100%",
          maxWidth: "100%",
          gap: isMobile ? "4px" : "6px",
          background: theme.colors.surface,
          border: focused
            ? `1.5px solid ${theme.colors.text}`
            : `1px solid ${theme.colors.border}`,
          borderRadius: isMobile ? "14px" : "16px",
          padding: isMobile ? "6px 6px 6px 8px" : "8px 8px 8px 12px",
          transition: "border-color 150ms ease, box-shadow 150ms ease",
          boxShadow: focused
            ? "0 0 0 4px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.10)"
            : "0 2px 8px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc,.txt"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        {/* Attach */}
        <button
          onClick={() => !uploadDisabled && fileInputRef.current?.click()}
          disabled={uploadDisabled}
          title="Attach resume"
          aria-label="Attach resume"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: isMobile ? "26px" : "28px",
            height: isMobile ? "26px" : "28px",
            borderRadius: "8px",
            border: "none",
            background: "transparent",
            cursor: uploadDisabled ? "not-allowed" : "pointer",
            flexShrink: 0,
            color: theme.colors.textMuted,
            opacity: uploadDisabled ? 0.4 : 1,
            transition: "background 120ms ease, color 120ms ease",
          }}
          onMouseEnter={(e) => {
            if (!uploadDisabled) {
              (e.currentTarget as HTMLButtonElement).style.background = theme.colors.surfaceElevated;
              (e.currentTarget as HTMLButtonElement).style.color = theme.colors.text;
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = theme.colors.textMuted;
          }}
        >
          {parsing
            ? <Loader2 size={isMobile ? 14 : 15} style={{ animation: "spin 1s linear infinite" }} />
            : <Paperclip size={isMobile ? 14 : 15} />
          }
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Paste a job description, company name, or question..."
          rows={1}
          style={{
            flex: "1 1 0",
            minWidth: 0,
            width: "100%",
            maxWidth: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            fontFamily: theme.font.family,
            fontSize: theme.font.size.base,
            color: theme.colors.text,
            lineHeight: "1.5",
            minHeight: "24px",
            maxHeight: "120px",
            resize: "none",
            padding: "0",
            margin: "0",
            verticalAlign: "middle",
            overflowWrap: "break-word",
            wordBreak: "break-word",
          }}
        />

        {/* Send */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          title="Send"
          aria-label="Send message"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: isMobile ? "28px" : "30px",
            height: isMobile ? "28px" : "30px",
            borderRadius: isMobile ? "8px" : "10px",
            border: "none",
            background: canSend ? theme.colors.text : theme.colors.surfaceElevated,
            cursor: canSend ? "pointer" : "not-allowed",
            flexShrink: 0,
            transition: "background 150ms ease, transform 100ms ease",
            color: canSend ? "#ffffff" : theme.colors.textMuted,
          }}
          onMouseEnter={(e) => {
            if (canSend) (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.06)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          }}
        >
          {disabled
            ? <Loader2 size={isMobile ? 13 : 14} style={{ animation: "spin 1s linear infinite" }} />
            : <ArrowUp size={isMobile ? 13 : 14} />
          }
        </button>
      </div>

      {parseError && (
        <p
          style={{
            fontSize: theme.font.size.xs,
            color: theme.colors.danger,
            fontFamily: theme.font.family,
            margin: "0",
            paddingLeft: "2px",
          }}
        >
          {parseError}
        </p>
      )}
    </div>
  );
}
