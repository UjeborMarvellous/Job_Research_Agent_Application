import React, { useState } from "react";
import { History, Clock, ChevronRight, FileSearch } from "lucide-react";
import { theme } from "../types";
import type { ResearchEntry } from "../types";

interface SidebarProps {
  researches: ResearchEntry[];
  onSelect: (entry: ResearchEntry) => void;
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

export default function Sidebar({ researches, onSelect }: SidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const reversed = [...researches].reverse();

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
        }}
      >
        <History size={14} color={theme.colors.orange} />
        <span
          style={{
            fontSize: theme.font.size.sm,
            fontWeight: theme.font.weight.semibold,
            color: theme.colors.text,
            fontFamily: theme.font.family,
            flex: 1,
          }}
        >
          Research History
        </span>
        {researches.length > 0 && (
          <span
            style={{
              fontFamily: theme.font.mono,
              fontSize: theme.font.size.xs,
              color: theme.colors.orange,
              background: theme.colors.orangeDim,
              borderRadius: theme.radius.sm,
              padding: "2px 6px",
            }}
          >
            {researches.length}
          </span>
        )}
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {reversed.length === 0 ? (
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
              No research yet
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
          reversed.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onSelect(entry)}
              onMouseEnter={() => setHoveredId(entry.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "12px 16px",
                borderBottom: `1px solid ${theme.colors.border}`,
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                cursor: "pointer",
                background:
                  hoveredId === entry.id
                    ? theme.colors.surfaceHover
                    : "transparent",
                transition: theme.transition,
              }}
            >
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
                    fontWeight: theme.font.weight.medium,
                    color: theme.colors.text,
                    fontFamily: theme.font.family,
                  }}
                >
                  {entry.company}
                </span>
                <ChevronRight
                  size={12}
                  color={theme.colors.textMuted}
                  style={{
                    opacity: hoveredId === entry.id ? 1 : 0,
                    transition: theme.transition,
                  }}
                />
              </div>
              <p
                style={{
                  fontSize: theme.font.size.sm,
                  color: theme.colors.textSecondary,
                  marginTop: "2px",
                  fontFamily: theme.font.family,
                }}
              >
                {entry.jobTitle}
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  marginTop: "4px",
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
                  {relativeTime(entry.timestamp)}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
