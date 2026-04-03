import React from "react";
import { Loader2 } from "lucide-react";
import { theme } from "../types";
import ResearchCard from "./ResearchCard";
import type { JobAnalysis } from "../types";

interface MessageBubbleProps {
  message: {
    id: string;
    role: string;
    parts: Array<{
      type: string;
      text?: string;
      toolName?: string;
      state?: string;
      input?: unknown;
      output?: unknown;
    }>;
  };
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  try {
    if (message.role === "user") {
      const text =
        message.parts?.find((p) => p.type === "text")?.text ?? "";
      return (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            margin: "3px 0",
          }}
        >
          <div
            style={{
              background: theme.colors.orangeDim,
              border: "1px solid rgba(244,129,32,0.2)",
              borderRadius: theme.radius.lg,
              padding: "10px 14px",
              maxWidth: "68%",
            }}
          >
            <p
              style={{
                fontSize: theme.font.size.base,
                color: theme.colors.text,
                lineHeight: String(theme.font.lineHeight.relaxed),
                fontFamily: theme.font.family,
                whiteSpace: "pre-wrap",
              }}
            >
              {text}
            </p>
          </div>
        </div>
      );
    }

    if (message.role === "assistant") {
      return (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-start",
            margin: "3px 0",
            maxWidth: "82%",
            flexDirection: "column",
          }}
        >
          {message.parts?.map((part, index) => {
            if (part.type === "text" && part.text && part.text.trim() !== "") {
              return (
                <p
                  key={index}
                  style={{
                    fontSize: theme.font.size.base,
                    color: theme.colors.textSecondary,
                    lineHeight: String(theme.font.lineHeight.relaxed),
                    fontFamily: theme.font.family,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {part.text}
                </p>
              );
            }

            if (
              part.type === "tool-invocation" &&
              (part as { state?: string }).state === "result" &&
              (part as { toolName?: string }).toolName === "analyzeJobPosting"
            ) {
              const typedPart = part as {
                toolName: string;
                state: string;
                input?: { jobTitle?: string; company?: string };
                output?: unknown;
              };
              const company = typedPart.input?.company ?? "";
              const jobTitle = typedPart.input?.jobTitle ?? "";
              return (
                <ResearchCard
                  key={index}
                  data={typedPart.output as JobAnalysis}
                  company={company}
                  jobTitle={jobTitle}
                />
              );
            }

            if (
              part.type === "tool-invocation" &&
              (part as { state?: string }).state === "call" &&
              (part as { toolName?: string }).toolName === "analyzeJobPosting"
            ) {
              return (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: "6px",
                    padding: "4px 0",
                  }}
                >
                  <Loader2
                    size={12}
                    color={theme.colors.textMuted}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                  <span
                    style={{
                      fontSize: theme.font.size.sm,
                      color: theme.colors.textMuted,
                      fontFamily: theme.font.family,
                    }}
                  >
                    Analyzing role...
                  </span>
                </div>
              );
            }

            return null;
          })}
        </div>
      );
    }

    return null;
  } catch {
    return (
      <div
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.font.size.sm,
          fontFamily: theme.font.family,
        }}
      >
        Unable to display message.
      </div>
    );
  }
}
