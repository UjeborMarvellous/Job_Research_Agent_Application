import React from "react";
import { Loader2 } from "lucide-react";
import { getToolName, isToolUIPart } from "ai";
import { theme } from "../types";
import type { UIMessage, JobAnalysis } from "../types";
import ResearchCard from "./ResearchCard";

function looksLikeRawFunctionCallJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith("{") && /"type"\s*:\s*"function"/.test(t);
}

interface MessageBubbleProps {
  message: UIMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  try {
    if (message.role === "user") {
      const text =
        message.parts
          ?.filter((p) => p.type === "text" && p.text)
          .map((p) => (p as { text: string }).text)
          .join("\n") ?? "";
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
              border: `1px solid ${theme.colors.orangeBorder}`,
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
              if (looksLikeRawFunctionCallJson(part.text)) {
                return null;
              }
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

            const aiPart = part as Parameters<typeof isToolUIPart>[0];
            if (isToolUIPart(aiPart) && getToolName(aiPart) === "analyzeJobPosting") {
              if (aiPart.state === "output-available") {
                const input = aiPart.input as {
                  jobTitle?: string;
                  company?: string;
                };
                return (
                  <ResearchCard
                    key={index}
                    data={aiPart.output as JobAnalysis}
                    company={input.company ?? ""}
                    jobTitle={input.jobTitle ?? ""}
                  />
                );
              }
              if (
                aiPart.state === "input-streaming" ||
                aiPart.state === "input-available"
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
