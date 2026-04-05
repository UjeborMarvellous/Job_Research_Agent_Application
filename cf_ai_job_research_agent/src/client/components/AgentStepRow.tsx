import React from "react";
import { Loader2 } from "lucide-react";
import { theme } from "../types";

export type AgentStepVisualState = "active" | "done" | "error";

interface AgentStepRowProps {
  label: string;
  state: AgentStepVisualState;
}

const SQUARE_COLOR: Record<AgentStepVisualState, string> = {
  active: theme.colors.textSecondary,
  done:   theme.colors.success,
  error:  theme.colors.danger,
};

export default function AgentStepRow({ label, state }: AgentStepRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "2px 0",
      }}
    >
      {/* Square status indicator */}
      <div
        style={{
          width: "10px",
          height: "10px",
          borderRadius: "2px",
          background: SQUARE_COLOR[state],
          flexShrink: 0,
        }}
      />

      {/* Label */}
      <span
        style={{
          fontSize: "13px",
          color: theme.colors.textSecondary,
          fontFamily: theme.font.family,
          flex: 1,
        }}
      >
        {label}
      </span>

      {/* Spinner — active state only */}
      {state === "active" && (
        <Loader2
          size={11}
          color={theme.colors.textMuted}
          style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}
        />
      )}
    </div>
  );
}
