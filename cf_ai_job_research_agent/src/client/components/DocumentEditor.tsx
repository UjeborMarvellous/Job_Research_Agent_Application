import React, { useCallback, useState } from "react";
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
} from "lucide-react";
import { theme } from "../types";
import { exportAsPdf, exportAsDocx, exportAsTxt } from "../utils/exportDocument";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";

interface DocumentEditorProps {
  document: { title: string; content: string };
  onClose: () => void;
  onUpdateContent: (content: string) => void;
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
  document: doc,
  onClose,
  onUpdateContent,
}: DocumentEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({ placeholder: "Start editing your document…" }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: doc.content,
    onUpdate: ({ editor: e }) => {
      onUpdateContent(e.getHTML());
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

  const [exporting, setExporting] = useState<string | null>(null);

  const handleExport = useCallback(
    async (format: "pdf" | "docx" | "txt") => {
      if (!editor) return;
      setExporting(format);
      try {
        if (format === "pdf") {
          await exportAsPdf(doc.title, editor.getHTML());
        } else if (format === "docx") {
          await exportAsDocx(doc.title, editor.getHTML());
        } else {
          exportAsTxt(doc.title, editor.getText());
        }
      } catch (err) {
        console.error(`Export ${format} failed:`, err);
      } finally {
        setExporting(null);
      }
    },
    [editor, doc.title],
  );

  if (!editor) return null;

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
          {doc.title}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close editor">
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
