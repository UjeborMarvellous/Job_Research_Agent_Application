import React from "react";
import { theme } from "../types";

export default function TypingIndicator() {
  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
      `}</style>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: "8px",
          padding: "8px 0",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: "4px",
            alignItems: "center",
          }}
        >
          {[0, 0.2, 0.4].map((delay, i) => (
            <div
              key={i}
              style={{
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: theme.colors.orange,
                animation: `pulse 1.2s ease-in-out ${delay}s infinite`,
              }}
            />
          ))}
        </div>
        <span
          style={{
            fontSize: theme.font.size.sm,
            color: theme.colors.textMuted,
            fontFamily: theme.font.family,
          }}
        >
          Analyzing role — this may take up to 20 seconds…
        </span>
      </div>
    </>
  );
}
