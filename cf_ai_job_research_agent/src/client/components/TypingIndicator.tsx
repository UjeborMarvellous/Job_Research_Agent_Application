import React from "react";
import { ShimmerText } from "./aceternity/ShimmerText";
import { theme } from "../types";

export default function TypingIndicator() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        gap: "10px",
        padding: "10px 0",
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
          fontSize: theme.font.size.sm,
          fontFamily: theme.font.family,
        }}
      >
        Analyzing role — this may take up to 20 seconds…
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
