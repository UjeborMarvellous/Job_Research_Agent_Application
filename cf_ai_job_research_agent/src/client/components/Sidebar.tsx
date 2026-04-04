import React, { useState } from "react";
import { MessageSquare, Plus, Clock, Trash2, FileSearch, PanelLeftClose, PanelLeft } from "lucide-react";
import { theme } from "../types";
import type { ConversationMeta } from "../types";
import ResumeUpload from "./ResumeUpload";

interface SidebarProps {
  conversations: ConversationMeta[];
  activeConversationId: string;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  resumeFileName?: string;
  onResumeExtracted: (text: string, fileName: string) => void;
  onResumeRemove: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function relativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function Sidebar({
  conversations,
  activeConversationId,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  resumeFileName,
  onResumeExtracted,
  onResumeRemove,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const sortedConvos = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  if (collapsed) {
    return (
      <div
        style={{
          width: "48px",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "12px",
          gap: "12px",
          background: theme.colors.surface,
          borderRight: `1px solid ${theme.colors.border}`,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onToggleCollapse}
          title="Expand sidebar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            borderRadius: theme.radius.sm,
          }}
        >
          <PanelLeft size={16} color={theme.colors.textSecondary} />
        </button>
        <button
          onClick={onNewConversation}
          title="New conversation"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            background: theme.colors.orangeDim,
            border: `1px solid ${theme.colors.orangeBorder}`,
            borderRadius: theme.radius.sm,
            cursor: "pointer",
          }}
        >
          <Plus size={14} color={theme.colors.orange} />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "260px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: theme.colors.surface,
        borderRight: `1px solid ${theme.colors.border}`,
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: "56px",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          padding: "0 16px",
          borderBottom: `1px solid ${theme.colors.border}`,
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <MessageSquare size={14} color={theme.colors.orange} />
        <span
          style={{
            fontSize: theme.font.size.sm,
            fontWeight: theme.font.weight.semibold,
            color: theme.colors.text,
            fontFamily: theme.font.family,
            flex: 1,
          }}
        >
          Conversations
        </span>
        <button
          onClick={onNewConversation}
          title="New conversation"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "24px",
            height: "24px",
            background: theme.colors.orangeDim,
            border: `1px solid ${theme.colors.orangeBorder}`,
            borderRadius: theme.radius.sm,
            cursor: "pointer",
            transition: theme.transition,
          }}
        >
          <Plus size={12} color={theme.colors.orange} />
        </button>
        <button
          onClick={onToggleCollapse}
          title="Collapse sidebar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "24px",
            height: "24px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            borderRadius: theme.radius.sm,
          }}
        >
          <PanelLeftClose size={14} color={theme.colors.textMuted} />
        </button>
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {sortedConvos.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "32px 16px",
            }}
          >
            <FileSearch size={28} color={theme.colors.textMuted} />
            <p
              style={{
                fontSize: theme.font.size.md,
                color: theme.colors.textSecondary,
                fontWeight: theme.font.weight.medium,
                marginTop: "8px",
                fontFamily: theme.font.family,
              }}
            >
              No conversations yet
            </p>
            <p
              style={{
                fontSize: theme.font.size.sm,
                color: theme.colors.textMuted,
                marginTop: "4px",
                fontFamily: theme.font.family,
                textAlign: "center",
              }}
            >
              Paste a job description to begin
            </p>
          </div>
        ) : (
          sortedConvos.map((convo) => {
            const isActive = convo.id === activeConversationId;
            const isHovered = hoveredId === convo.id;
            return (
              <button
                key={convo.id}
                onClick={() => onSelectConversation(convo.id)}
                onMouseEnter={() => setHoveredId(convo.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 16px",
                  borderBottom: `1px solid ${theme.colors.border}`,
                  borderTop: "none",
                  borderRight: "none",
                  borderLeft: isActive
                    ? `3px solid ${theme.colors.orange}`
                    : "3px solid transparent",
                  cursor: "pointer",
                  background: isActive
                    ? theme.colors.orangeSubtle
                    : isHovered
                      ? theme.colors.surfaceHover
                      : "transparent",
                  transition: theme.transition,
                }}
              >
                {confirmDeleteId === convo.id ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: theme.font.size.sm,
                        color: theme.colors.danger,
                        fontFamily: theme.font.family,
                      }}
                    >
                      Delete this conversation?
                    </span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteConversation(convo.id);
                          setConfirmDeleteId(null);
                        }}
                        style={{
                          flex: 1,
                          padding: "4px 0",
                          fontSize: theme.font.size.xs,
                          fontFamily: theme.font.family,
                          color: theme.colors.white,
                          background: theme.colors.danger,
                          border: "none",
                          borderRadius: theme.radius.sm,
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(null);
                        }}
                        style={{
                          flex: 1,
                          padding: "4px 0",
                          fontSize: theme.font.size.xs,
                          fontFamily: theme.font.family,
                          color: theme.colors.textSecondary,
                          background: theme.colors.surfaceElevated,
                          border: `1px solid ${theme.colors.border}`,
                          borderRadius: theme.radius.sm,
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: theme.font.size.base,
                          fontWeight: isActive
                            ? theme.font.weight.semibold
                            : theme.font.weight.medium,
                          color: isActive ? theme.colors.orange : theme.colors.text,
                          fontFamily: theme.font.family,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                        }}
                      >
                        {convo.title}
                      </span>
                      {isHovered && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(convo.id);
                          }}
                          title="Delete conversation"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "20px",
                            height: "20px",
                            background: theme.colors.dangerDim,
                            border: "none",
                            cursor: "pointer",
                            borderRadius: theme.radius.sm,
                            flexShrink: 0,
                            marginLeft: "4px",
                          }}
                        >
                          <Trash2 size={11} color={theme.colors.danger} />
                        </button>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        marginTop: "3px",
                      }}
                    >
                      <Clock size={10} color={theme.colors.textMuted} />
                      <span
                        style={{
                          fontSize: theme.font.size.xs,
                          color: theme.colors.textMuted,
                          fontFamily: theme.font.family,
                        }}
                      >
                        {relativeTime(convo.updatedAt)}
                      </span>
                    </div>
                  </>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Resume upload */}
      <ResumeUpload
        currentFileName={resumeFileName}
        onResumeExtracted={onResumeExtracted}
        onRemove={onResumeRemove}
      />
    </div>
  );
}
