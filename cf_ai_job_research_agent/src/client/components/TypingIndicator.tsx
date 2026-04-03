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
          gap: "4px",
          padding: "8px 0",
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
    </>
  );
}
