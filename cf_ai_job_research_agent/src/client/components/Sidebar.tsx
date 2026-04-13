import { useState } from "react";
import { Plus, Trash2, FileSearch, PanelLeftClose, PanelLeft, ScanSearch } from "lucide-react";
import { theme } from "../types";
import type { ConversationMeta } from "../types";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./ui/tooltip";

interface SidebarProps {
  conversations: ConversationMeta[];
  activeConversationId: string;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** When true, disables border-radius/shadow (drawer container owns those). */
  inDrawer?: boolean;
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function IdentityStamp({ size = 15, containerSize = 32 }: { size?: number; containerSize?: number }) {
  return (
    <div
      style={{
        width: `${containerSize}px`,
        height: `${containerSize}px`,
        borderRadius: "8px",
        background: theme.colors.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
      }}
    >
      <ScanSearch size={size} color={theme.colors.background} />
    </div>
  );
}

export default function Sidebar({
  conversations,
  activeConversationId,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  collapsed,
  onToggleCollapse,
  inDrawer = false,
}: SidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const sortedConvos = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  if (collapsed) {
    return (
      <div
        style={{
          width: "56px",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "14px",
          background: theme.colors.background,
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.11), 0 2px 8px rgba(0,0,0,0.07)",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <IdentityStamp size={14} containerSize={30} />

        <div style={{ marginTop: "10px" }}>
          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={onNewConversation}
                  className="w-8 h-8"
                >
                  <Plus size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">New conversation</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ paddingBottom: "14px" }}>
          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="w-8 h-8">
                  <PanelLeft size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: inDrawer ? "100%" : "260px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: theme.colors.background,
        borderRadius: inDrawer ? 0 : "16px",
        boxShadow: inDrawer ? "none" : "0 8px 32px rgba(0,0,0,0.11), 0 2px 8px rgba(0,0,0,0.07)",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: "56px",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          padding: "0 12px 0 14px",
          borderBottom: `1px solid ${theme.colors.border}`,
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <IdentityStamp size={14} containerSize={28} />

        <span style={{ fontFamily: theme.font.family, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
            Research{" "}
          </span>
          <span style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium, color: theme.colors.textSecondary }}>
            Agent
          </span>
        </span>

        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onNewConversation}
                aria-label="New conversation"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  border: `1px solid ${theme.colors.border}`,
                  background: theme.colors.background,
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "background 120ms ease, border-color 120ms ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = theme.colors.surfaceElevated;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = theme.colors.text;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = theme.colors.background;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = theme.colors.border;
                }}
              >
                <Plus size={14} color={theme.colors.text} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New conversation</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {sortedConvos.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "32px 16px",
              animation: "fadeSlideUp 200ms ease forwards",
            }}
          >
            <FileSearch size={26} color={theme.colors.textMuted} />
            <p style={{ fontSize: theme.font.size.md, color: theme.colors.textSecondary, fontWeight: theme.font.weight.medium, marginTop: "8px", fontFamily: theme.font.family }}>
              No conversations yet
            </p>
            <p style={{ fontSize: theme.font.size.sm, color: theme.colors.textMuted, marginTop: "4px", fontFamily: theme.font.family, textAlign: "center" }}>
              Paste a job description to begin
            </p>
          </div>
        ) : (
          sortedConvos.map((convo) => {
            const isActive = convo.id === activeConversationId;
            const isHovered = hoveredId === convo.id;
            const showDelete = isActive || isHovered;
            return (
              <div
                key={convo.id}
                onClick={() => onSelectConversation(convo.id)}
                onMouseEnter={() => setHoveredId(convo.id)}
                onMouseLeave={() => setHoveredId(null)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onSelectConversation(convo.id)}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "8px",
                  width: "calc(100% - 16px)",
                  padding: "9px 10px 9px 12px",
                  cursor: "pointer",
                  background: isActive
                    ? theme.colors.surfaceElevated
                    : isHovered
                      ? theme.colors.surfaceHover
                      : "transparent",
                  transition: theme.transition,
                  borderRadius: "8px",
                  margin: "2px 8px",
                }}
              >
                {/* Text block */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span
                    style={{
                      fontSize: theme.font.size.base,
                      fontWeight: isActive ? theme.font.weight.semibold : theme.font.weight.medium,
                      color: theme.colors.text,
                      fontFamily: theme.font.family,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {convo.title}
                  </span>
                  <span style={{
                    fontSize: theme.font.size.xs,
                    color: theme.colors.textMuted,
                    fontFamily: theme.font.family,
                  }}>
                    {formatDate(convo.updatedAt)}
                  </span>
                </div>

                {/* Inline delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteConversation(convo.id); }}
                  title="Delete conversation"
                  aria-label={`Delete conversation: ${convo.title}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "26px",
                    height: "26px",
                    borderRadius: "6px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    flexShrink: 0,
                    opacity: showDelete ? 1 : 0,
                    transition: "opacity 120ms ease, background 120ms ease",
                    pointerEvents: showDelete ? "auto" : "none",
                    color: theme.colors.textMuted,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(220,38,38,0.08)";
                    (e.currentTarget as HTMLButtonElement).style.color = theme.colors.danger;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    (e.currentTarget as HTMLButtonElement).style.color = theme.colors.textMuted;
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Collapse toggle — pinned bottom */}
      <div style={{ padding: "10px 14px", borderTop: `1px solid ${theme.colors.border}`, flexShrink: 0 }}>
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onToggleCollapse}>
                <PanelLeftClose size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Collapse sidebar</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
