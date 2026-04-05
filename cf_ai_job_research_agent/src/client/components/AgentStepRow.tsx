import React from "react";
import { Loader2, Check, X } from "lucide-react";
import { theme } from "../types";

export type AgentStepVisualState = "active" | "done" | "error";

interface AgentStepRowProps {
  label: string;
  state: AgentStepVisualState;
}

export default function AgentStepRow({ label, state }: AgentStepRowProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: "6px",
        padding: "4px 0",
      }}
    >
      {state === "active" && (
        <Loader2
          size={12}
          color={theme.colors.textMuted}
          style={{ animation: "spin 1s linear infinite" }}
        />
      )}
      {state === "done" && <Check size={12} color={theme.colors.orange} strokeWidth={2.5} />}
      {state === "error" && <X size={12} color={theme.colors.danger} strokeWidth={2.5} />}
      <span
        style={{
          fontSize: theme.font.size.sm,
          color: theme.colors.textMuted,
          fontFamily: theme.font.family,
        }}
      >
        {label}
      </span>
    </div>
  );
}
