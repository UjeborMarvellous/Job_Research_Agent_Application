import React from "react";

// Aceternity-inspired background beams — animated SVG paths radiating from
// a central focal point. Used in the ChatWindow empty state.
export function BackgroundBeams() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="bgGlow" cx="50%" cy="40%" r="50%">
            <stop offset="0%"   stopColor="rgba(244,129,32,0.07)" />
            <stop offset="100%" stopColor="rgba(244,129,32,0)" />
          </radialGradient>
          <linearGradient id="beam1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="rgba(244,129,32,0)" />
            <stop offset="50%"  stopColor="rgba(244,129,32,0.12)" />
            <stop offset="100%" stopColor="rgba(244,129,32,0)" />
          </linearGradient>
          <linearGradient id="beam2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="rgba(244,129,32,0)" />
            <stop offset="50%"  stopColor="rgba(244,129,32,0.08)" />
            <stop offset="100%" stopColor="rgba(244,129,32,0)" />
          </linearGradient>
        </defs>

        {/* Ambient glow blob */}
        <ellipse cx="400" cy="240" rx="320" ry="200" fill="url(#bgGlow)" />

        {/* Animated beam lines */}
        {[
          "M400,240 L20,20",
          "M400,240 L200,0",
          "M400,240 L400,0",
          "M400,240 L600,0",
          "M400,240 L780,20",
          "M400,240 L800,180",
          "M400,240 L800,340",
          "M400,240 L780,580",
          "M400,240 L600,600",
          "M400,240 L200,600",
          "M400,240 L20,580",
          "M400,240 L0,340",
          "M400,240 L0,180",
        ].map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="url(#beam1)"
            strokeWidth="0.8"
            strokeDasharray="600"
            strokeDashoffset="600"
            style={{
              animation: `beamDrift ${3.5 + i * 0.4}s ease-in-out ${i * 0.25}s infinite`,
            }}
          />
        ))}

        {/* Secondary subtler beams */}
        {[
          "M400,240 L100,80",
          "M400,240 L300,10",
          "M400,240 L500,10",
          "M400,240 L700,80",
          "M400,240 L740,400",
          "M400,240 L500,590",
          "M400,240 L300,590",
          "M400,240 L60,400",
        ].map((d, i) => (
          <path
            key={`s${i}`}
            d={d}
            fill="none"
            stroke="url(#beam2)"
            strokeWidth="0.5"
            strokeDasharray="600"
            strokeDashoffset="600"
            style={{
              animation: `beamDrift ${4 + i * 0.35}s ease-in-out ${0.6 + i * 0.3}s infinite`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}
