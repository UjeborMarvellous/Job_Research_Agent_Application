import React from "react";

// Aceternity-inspired shimmer text — used in TypingIndicator.
// The shimmer sweeps across the text using a CSS gradient + clip.
interface ShimmerTextProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ShimmerText({ children, style }: ShimmerTextProps) {
  return (
    <span className="shimmer-text" style={style}>
      {children}
    </span>
  );
}
