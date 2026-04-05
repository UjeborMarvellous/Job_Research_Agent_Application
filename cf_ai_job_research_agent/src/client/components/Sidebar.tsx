import React, { useState } from "react";
import { Plus, Trash2, MoreVertical, FileSearch, PanelLeftClose, PanelLeft, ScanSearch } from "lucide-react";
import { theme } from "../types";
import type { ConversationMeta } from "../types";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
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
}: SidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
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
        width: "260px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: theme.colors.background,
        borderRadius: "16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.11), 0 2px 8px rgba(0,0,0,0.07)",
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
          padding: "0 14px",
          borderBottom: `1px solid ${theme.colors.border}`,
          gap: "10px",
          flexShrink: 0,
        }}
      >
        <IdentityStamp size={14} containerSize={30} />

        <span style={{ fontFamily: theme.font.family, flex: 1 }}>
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
              <Button variant="secondary" size="icon-sm" onClick={onNewConversation}>
                <Plus size={13} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New conversation</TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
            const menuOpen = openMenuId === convo.id;
            const showActions = isActive || isHovered || menuOpen;
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
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  width: "calc(100% - 16px)",
                  padding: "9px 12px",
                  cursor: "pointer",
                  background: isActive
                    ? theme.colors.surfaceElevated
                    : isHovered || menuOpen
                      ? theme.colors.surfaceHover
                      : "transparent",
                  transition: theme.transition,
                  borderRadius: "8px",
                  margin: "2px 8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      fontSize: theme.font.size.base,
                      fontWeight: isActive ? theme.font.weight.semibold : theme.font.weight.medium,
                      color: theme.colors.text,
                      fontFamily: theme.font.family,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {convo.title}
                  </span>

                  <DropdownMenu
                    open={menuOpen}
                    onOpenChange={(open) => setOpenMenuId(open ? convo.id : null)}
                  >
                    <DropdownMenuTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "22px",
                          height: "22px",
                          borderRadius: "6px",
                          border: "none",
                          background: menuOpen ? theme.colors.surfaceElevated : "transparent",
                          cursor: "pointer",
                          flexShrink: 0,
                          opacity: showActions ? 1 : 0,
                          transition: "opacity 120ms ease, background 120ms ease",
                          pointerEvents: showActions ? "auto" : "none",
                        }}
                      >
                        <MoreVertical size={13} color={theme.colors.textSecondary} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem
                        destructive
                        onSelect={() => onDeleteConversation(convo.id)}
                      >
                        <Trash2 size={13} />
                        Delete conversation
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <span style={{
                  fontSize: theme.font.size.xs,
                  color: theme.colors.textMuted,
                  fontFamily: theme.font.family,
                  marginTop: "3px",
                  paddingRight: "28px",
                }}>
                  {formatDate(convo.updatedAt)}
                </span>
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
