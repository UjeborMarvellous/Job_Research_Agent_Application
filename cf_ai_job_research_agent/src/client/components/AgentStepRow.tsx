import React from "react";
import { Loader2 } from "lucide-react";
import { theme } from "../types";

export type AgentStepVisualState = "active" | "done" | "error";

interface AgentStepRowProps {
  label: string;
  state: AgentStepVisualState;
  /** Slightly smaller type and spacing on mobile */
  compact?: boolean;
}

const SQUARE_COLOR: Record<AgentStepVisualState, string> = {
  active: theme.colors.textSecondary,
  done:   theme.colors.success,
  error:  theme.colors.danger,
};

export default function AgentStepRow({ label, state, compact }: AgentStepRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: compact ? "6px" : "8px",
        padding: compact ? "1px 0" : "2px 0",
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      {/* Square status indicator */}
      <div
        style={{
          width: compact ? "9px" : "10px",
          height: compact ? "9px" : "10px",
          borderRadius: "2px",
          background: SQUARE_COLOR[state],
          flexShrink: 0,
        }}
      />

      {/* Label */}
      <span
        style={{
          fontSize: compact ? theme.font.size.sm : "13px",
          color: theme.colors.textSecondary,
          fontFamily: theme.font.family,
          flex: 1,
          minWidth: 0,
          overflowWrap: "break-word",
        }}
      >
        {label}
      </span>

      {/* Spinner — active state only */}
      {state === "active" && (
        <Loader2
          size={compact ? 10 : 11}
          color={theme.colors.textMuted}
          style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}
        />
      )}
    </div>
  );
}
