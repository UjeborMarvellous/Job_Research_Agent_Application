import React, { useCallback, useState, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import {
  X,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Download,
  FileText,
  FileDown,
  FileType,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { theme } from "../types";
import { exportAsPdf, exportAsDocx, exportAsTxt } from "../utils/exportDocument";
import { Button } from "./ui/button";

/**
 * Strip stray <html>, <head>, <body> wrapper tags that the model occasionally emits.
 * TipTap/ProseMirror will misinterpret these and scatter the layout.
 * We also collapse multiple blank lines and trim whitespace.
 */
function normalizeDocHtml(html: string): string {
  return html
    .replace(/<\/?html[^>]*>/gi, "")
    .replace(/<\/?head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<\/?body[^>]*>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .trim();
}

interface OpenDocument {
  id: string;
  title: string;
  content: string;
}

interface DocumentEditorProps {
  openDocuments: OpenDocument[];
  activeDocumentId: string;
  onCloseDocument: (id: string) => void;
  onSetActiveDocument: (id: string) => void;
  onUpdateContent: (id: string, content: string) => void;
}

function ToolbarBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );
}

export default function DocumentEditor({
  openDocuments,
  activeDocumentId,
  onCloseDocument,
  onSetActiveDocument,
  onUpdateContent,
}: DocumentEditorProps) {
  const activeDoc = openDocuments.find((d) => d.id === activeDocumentId) ?? openDocuments[0];

  const [updatedFlash, setUpdatedFlash] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({ placeholder: "Start editing your document…" }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: activeDoc?.content ?? "",
    onUpdate: ({ editor: e }) => {
      if (activeDoc) onUpdateContent(activeDoc.id, e.getHTML());
    },
    editorProps: {
      attributes: {
        style: [
          `color: ${theme.colors.text}`,
          `font-family: ${theme.font.family}`,
          `font-size: ${theme.font.size.md}`,
          `line-height: ${theme.font.lineHeight.relaxed}`,
          "outline: none",
          "min-height: 100%",
          "padding: 24px",
        ].join("; "),
      },
    },
  });

  // Reinitialize editor when active document switches or content is pushed from agent.
  // normalizeDocHtml strips stray <html>/<head>/<body> wrappers that the model occasionally
  // emits, which cause TipTap/ProseMirror to produce a broken layout on setContent.
  const prevDocIdRef = React.useRef<string | null>(null);
  const prevContentRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!editor || !activeDoc) return;
    const docSwitched = prevDocIdRef.current !== activeDoc.id;
    const contentPushed = !docSwitched && prevContentRef.current !== activeDoc.content;
    if (docSwitched || contentPushed) {
      editor.commands.setContent(normalizeDocHtml(activeDoc.content ?? ""));
      prevDocIdRef.current = activeDoc.id;
      prevContentRef.current = activeDoc.content;
      if (contentPushed) {
        setUpdatedFlash(true);
        const t = setTimeout(() => setUpdatedFlash(false), 1500);
        return () => clearTimeout(t);
      }
    }
  }, [activeDocumentId, activeDoc?.content]); // eslint-disable-line react-hooks/exhaustive-deps

  const [exporting, setExporting] = useState<string | null>(null);

  const handleExport = useCallback(
    async (format: "pdf" | "docx" | "txt") => {
      if (!editor || !activeDoc) return;
      setExporting(format);
      try {
        if (format === "pdf") {
          await exportAsPdf(activeDoc.title, editor.getHTML());
        } else if (format === "docx") {
          await exportAsDocx(activeDoc.title, editor.getHTML());
        } else {
          exportAsTxt(activeDoc.title, editor.getText());
        }
      } catch (err) {
        console.error(`Export ${format} failed:`, err);
      } finally {
        setExporting(null);
      }
    },
    [editor, activeDoc],
  );

  if (!editor || !activeDoc) return null;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        borderLeft: `1px solid ${theme.colors.border}`,
        background: theme.colors.background,
        minWidth: "300px",
        maxWidth: "50%",
        animation: "fadeSlideUp 250ms ease-out",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
      }}
    >
      {/* Tab bar — Fix 4 */}
      {openDocuments.length > 1 && (
        <div
          style={{
            display: "flex",
            overflowX: "auto",
            borderBottom: `1px solid ${theme.colors.border}`,
            background: theme.colors.surface,
            flexShrink: 0,
          }}
        >
          {openDocuments.map((doc) => {
            const isActive = doc.id === activeDocumentId;
            return (
              <div
                key={doc.id}
                onClick={() => onSetActiveDocument(doc.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "0 10px 0 12px",
                  height: "36px",
                  cursor: "pointer",
                  flexShrink: 0,
                  maxWidth: "180px",
                  borderRight: `1px solid ${theme.colors.border}`,
                  background: isActive ? theme.colors.background : "transparent",
                  borderBottom: isActive ? `2px solid ${theme.colors.text}` : "none",
                  transition: "background 120ms ease",
                }}
              >
                <span
                  style={{
                    fontSize: theme.font.size.sm,
                    fontWeight: isActive ? theme.font.weight.semibold : theme.font.weight.regular,
                    color: isActive ? theme.colors.text : theme.colors.textSecondary,
                    fontFamily: theme.font.family,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {doc.title}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onCloseDocument(doc.id); }}
                  aria-label={`Close ${doc.title}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "18px",
                    height: "18px",
                    borderRadius: "4px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    flexShrink: 0,
                    color: theme.colors.textMuted,
                    transition: "background 100ms ease, color 100ms ease",
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
            );
          })}
        </div>
      )}

      {/* Header */}
      <div
        style={{
          height: "56px",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          borderBottom: `1px solid ${theme.colors.border}`,
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <FileText size={14} color={theme.colors.textSecondary} />
        <span
          style={{
            flex: 1,
            fontSize: theme.font.size.md,
            fontWeight: theme.font.weight.semibold,
            color: theme.colors.text,
            fontFamily: theme.font.family,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {activeDoc.title}
        </span>
        {/* Fix 3 — "Document updated" flash */}
        {updatedFlash && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: theme.font.size.sm,
              color: theme.colors.success,
              fontFamily: theme.font.family,
              animation: "fadeSlideUp 200ms ease",
            }}
          >
            <CheckCircle2 size={12} />
            Updated
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onCloseDocument(activeDoc.id)}
          title="Close editor"
          aria-label="Close editor"
        >
          <X size={15} />
        </Button>
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "2px",
          padding: "6px 12px",
          borderBottom: `1px solid ${theme.colors.border}`,
          background: theme.colors.surface,
          flexShrink: 0,
        }}
      >
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
          <Bold size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
          <Italic size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline">
          <UnderlineIcon size={13} />
        </ToolbarBtn>

        <div style={{ width: "1px", height: "18px", background: theme.colors.border, margin: "0 4px", flexShrink: 0 }} />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1">
          <Heading1 size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">
          <Heading2 size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">
          <Heading3 size={13} />
        </ToolbarBtn>

        <div style={{ width: "1px", height: "18px", background: theme.colors.border, margin: "0 4px", flexShrink: 0 }} />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list">
          <List size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list">
          <ListOrdered size={13} />
        </ToolbarBtn>

        <div style={{ width: "1px", height: "18px", background: theme.colors.border, margin: "0 4px", flexShrink: 0 }} />

        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align left">
          <AlignLeft size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Align center">
          <AlignCenter size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align right">
          <AlignRight size={13} />
        </ToolbarBtn>
      </div>

      {/* Editor area */}
      <div style={{ flex: 1, overflowY: "auto", background: theme.colors.background }}>
        <EditorContent editor={editor} />
      </div>

      {/* Footer — export buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 16px",
          borderTop: `1px solid ${theme.colors.border}`,
          background: theme.colors.surface,
          flexShrink: 0,
        }}
      >
        <Download size={13} color={theme.colors.textMuted} />
        <span style={{ fontSize: theme.font.size.sm, color: theme.colors.textSecondary, fontFamily: theme.font.family, marginRight: "4px" }}>
          Export:
        </span>

        <Button
          variant="default"
          size="sm"
          onClick={() => handleExport("pdf")}
          disabled={!!exporting}
          className="gap-1.5"
        >
          {exporting === "pdf" ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <FileDown size={11} />}
          PDF
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleExport("docx")}
          disabled={!!exporting}
          className="gap-1.5"
        >
          {exporting === "docx" ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <FileText size={11} />}
          DOCX
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleExport("txt")}
          disabled={!!exporting}
          className="gap-1.5"
        >
          {exporting === "txt" ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <FileType size={11} />}
          TXT
        </Button>
      </div>
    </div>
  );
}
