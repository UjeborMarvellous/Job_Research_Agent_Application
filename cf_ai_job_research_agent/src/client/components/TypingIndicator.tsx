import React from "react";
import { ShimmerText } from "./aceternity/ShimmerText";
import { theme } from "../types";

interface TypingIndicatorProps {
  message?: string;
  isMobile?: boolean;
}

export default function TypingIndicator({ message = "Thinking…", isMobile }: TypingIndicatorProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        gap: isMobile ? "8px" : "10px",
        padding: isMobile ? "6px 0" : "10px 0",
        alignItems: "center",
        animation: "fadeSlideUp 200ms ease forwards",
      }}
    >
      {/* Three animated dots */}
      <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: "4px",
              height: "4px",
              borderRadius: "50%",
              background: theme.colors.textMuted,
              animation: `pulse 1.2s ease ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>

      <ShimmerText
        style={{
          fontSize: isMobile ? theme.font.size.xs : theme.font.size.sm,
          fontFamily: theme.font.family,
        }}
      >
        {message}
      </ShimmerText>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}
