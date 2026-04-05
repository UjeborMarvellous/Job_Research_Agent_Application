import React, { useState, useRef, useEffect } from "react";
import { ArrowUp, Loader2, Paperclip, FileText, X } from "lucide-react";
import { theme } from "../types";
import { parseResumeFile } from "../utils/parseResumeFile";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

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
  const canSend = value.trim().length > 0 && !disabled;

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
        background: theme.colors.background,
        borderTop: `1px solid ${theme.colors.border}`,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {/* Resume badge */}
      {resumeFileName && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Badge variant="secondary" className="gap-1.5 max-w-[260px] pr-1">
            <FileText size={11} />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "180px",
              }}
            >
              {resumeFileName}
            </span>
            <button
              type="button"
              onClick={onResumeRemove}
              title="Remove resume"
              className="ml-0.5 rounded hover:bg-accent p-0.5 flex items-center justify-center border-none bg-transparent cursor-pointer"
            >
              <X size={10} />
            </button>
          </Badge>
        </div>
      )}

      {/* Input row */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-end",
          gap: "8px",
          background: theme.colors.surface,
          border: focused
            ? `1.5px solid ${theme.colors.text}`
            : `1px solid ${theme.colors.border}`,
          borderRadius: "16px",
          padding: "8px 10px",
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
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={uploadDisabled}
          onClick={() => !uploadDisabled && fileInputRef.current?.click()}
          className="shrink-0"
        >
          {parsing ? (
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Paperclip size={16} />
          )}
        </Button>

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

        {/* Send */}
        <Button
          size="icon-sm"
          disabled={!canSend}
          onClick={handleSend}
          variant={canSend ? "default" : "secondary"}
          className="shrink-0"
        >
          {disabled ? (
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <ArrowUp size={14} />
          )}
        </Button>
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
  );
}
