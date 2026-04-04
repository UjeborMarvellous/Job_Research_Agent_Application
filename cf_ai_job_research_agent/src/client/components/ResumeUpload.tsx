import React, { useRef, useState } from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { theme } from "../types";

interface ResumeUploadProps {
  onResumeExtracted: (text: string, fileName: string) => void;
  currentFileName?: string;
  onRemove: () => void;
}

async function parsePdf(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" "),
    );
  }
  return pages.join("\n\n");
}

async function parseDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

function parseTxt(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export default function ResumeUpload({
  onResumeExtracted,
  currentFileName,
  onRemove,
}: ResumeUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setParsing(true);

    try {
      let text: string;
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

      if (ext === "pdf") {
        text = await parsePdf(file);
      } else if (ext === "docx" || ext === "doc") {
        text = await parseDocx(file);
      } else if (ext === "txt") {
        text = await parseTxt(file);
      } else {
        throw new Error("Unsupported file type. Use PDF, DOCX, or TXT.");
      }

      const trimmed = text.trim();
      if (!trimmed) {
        throw new Error("Could not extract any text from this file.");
      }

      onResumeExtracted(trimmed, file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div
      style={{
        padding: "12px 16px",
        borderTop: `1px solid ${theme.colors.border}`,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {currentFileName ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 10px",
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
            {currentFileName}
          </span>
          <button
            onClick={onRemove}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "18px",
              height: "18px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              borderRadius: "50%",
              flexShrink: 0,
            }}
            title="Remove resume"
          >
            <X size={12} color={theme.colors.textMuted} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={parsing}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            width: "100%",
            padding: "8px 10px",
            background: theme.colors.surfaceElevated,
            border: `1px dashed ${theme.colors.border}`,
            borderRadius: theme.radius.sm,
            cursor: parsing ? "wait" : "pointer",
            transition: theme.transition,
          }}
        >
          {parsing ? (
            <Loader2
              size={13}
              color={theme.colors.textMuted}
              style={{ animation: "spin 1s linear infinite" }}
            />
          ) : (
            <Upload size={13} color={theme.colors.textMuted} />
          )}
          <span
            style={{
              fontSize: theme.font.size.sm,
              color: theme.colors.textSecondary,
              fontFamily: theme.font.family,
            }}
          >
            {parsing ? "Parsing resume…" : "Upload resume"}
          </span>
        </button>
      )}

      {error && (
        <p
          style={{
            fontSize: theme.font.size.xs,
            color: theme.colors.danger,
            fontFamily: theme.font.family,
            marginTop: "6px",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
