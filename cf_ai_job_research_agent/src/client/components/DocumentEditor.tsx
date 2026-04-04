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

interface DocumentEditorProps {
  document: { title: string; content: string };
  onClose: () => void;
  onUpdateContent: (content: string) => void;
}

function ToolbarButton({
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
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "28px",
        height: "28px",
        background: active ? theme.colors.orangeDim : "transparent",
        border: active
          ? `1px solid ${theme.colors.orangeBorder}`
          : "1px solid transparent",
        borderRadius: theme.radius.sm,
        cursor: "pointer",
        transition: theme.transition,
      }}
    >
      {children}
    </button>
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
          "padding: 20px",
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

  const iconColor = theme.colors.textSecondary;
  const activeColor = theme.colors.orange;

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
          background: theme.colors.surface,
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <FileText size={14} color={theme.colors.orange} />
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
        <button
          onClick={onClose}
          title="Close editor"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "28px",
            height: "28px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            borderRadius: theme.radius.sm,
          }}
        >
          <X size={16} color={theme.colors.textMuted} />
        </button>
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
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <Bold size={14} color={editor.isActive("bold") ? activeColor : iconColor} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <Italic size={14} color={editor.isActive("italic") ? activeColor : iconColor} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline"
        >
          <UnderlineIcon size={14} color={editor.isActive("underline") ? activeColor : iconColor} />
        </ToolbarButton>

        <div style={{ width: "1px", height: "20px", background: theme.colors.border, margin: "0 4px" }} />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive("heading", { level: 1 })}
          title="Heading 1"
        >
          <Heading1 size={14} color={editor.isActive("heading", { level: 1 }) ? activeColor : iconColor} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          <Heading2 size={14} color={editor.isActive("heading", { level: 2 }) ? activeColor : iconColor} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title="Heading 3"
        >
          <Heading3 size={14} color={editor.isActive("heading", { level: 3 }) ? activeColor : iconColor} />
        </ToolbarButton>

        <div style={{ width: "1px", height: "20px", background: theme.colors.border, margin: "0 4px" }} />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          <List size={14} color={editor.isActive("bulletList") ? activeColor : iconColor} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numbered list"
        >
          <ListOrdered size={14} color={editor.isActive("orderedList") ? activeColor : iconColor} />
        </ToolbarButton>

        <div style={{ width: "1px", height: "20px", background: theme.colors.border, margin: "0 4px" }} />

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="Align left"
        >
          <AlignLeft size={14} color={editor.isActive({ textAlign: "left" }) ? activeColor : iconColor} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title="Align center"
        >
          <AlignCenter size={14} color={editor.isActive({ textAlign: "center" }) ? activeColor : iconColor} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title="Align right"
        >
          <AlignRight size={14} color={editor.isActive({ textAlign: "right" }) ? activeColor : iconColor} />
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          background: theme.colors.background,
        }}
      >
        <style>{`
          .ProseMirror { min-height: 100%; }
          .ProseMirror p.is-editor-empty:first-child::before {
            color: ${theme.colors.textMuted};
            content: attr(data-placeholder);
            float: left;
            height: 0;
            pointer-events: none;
          }
          .ProseMirror h1 { font-size: 1.6em; font-weight: 700; margin: 0.8em 0 0.4em; color: ${theme.colors.text}; }
          .ProseMirror h2 { font-size: 1.3em; font-weight: 600; margin: 0.7em 0 0.3em; color: ${theme.colors.text}; }
          .ProseMirror h3 { font-size: 1.1em; font-weight: 600; margin: 0.6em 0 0.3em; color: ${theme.colors.text}; }
          .ProseMirror ul, .ProseMirror ol { padding-left: 1.5em; margin: 0.5em 0; }
          .ProseMirror li { margin: 0.2em 0; }
          .ProseMirror p { margin: 0.4em 0; }
          .ProseMirror strong { font-weight: 700; }
          .ProseMirror em { font-style: italic; }
          .ProseMirror u { text-decoration: underline; }
          .ProseMirror blockquote { border-left: 3px solid ${theme.colors.orangeBorder}; padding-left: 1em; margin: 0.5em 0; color: ${theme.colors.textSecondary}; }
        `}</style>
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
        <span
          style={{
            fontSize: theme.font.size.sm,
            color: theme.colors.textSecondary,
            fontFamily: theme.font.family,
            marginRight: "4px",
          }}
        >
          Export:
        </span>
        <ExportButton label="PDF" icon={<FileDown size={12} />} onClick={() => handleExport("pdf")} loading={exporting === "pdf"} />
        <ExportButton label="DOCX" icon={<FileText size={12} />} onClick={() => handleExport("docx")} loading={exporting === "docx"} />
        <ExportButton label="TXT" icon={<FileType size={12} />} onClick={() => handleExport("txt")} loading={exporting === "txt"} />
      </div>
    </div>
  );
}

function ExportButton({
  label,
  icon,
  onClick,
  loading,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "4px 10px",
        background: theme.colors.surfaceElevated,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.sm,
        cursor: loading ? "wait" : "pointer",
        transition: theme.transition,
        fontSize: theme.font.size.sm,
        color: theme.colors.textSecondary,
        fontFamily: theme.font.family,
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? (
        <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
      ) : (
        icon
      )}
      {label}
    </button>
  );
}
