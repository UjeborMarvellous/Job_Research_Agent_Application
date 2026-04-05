import React from "react";
import { AlertTriangle } from "lucide-react";
import { theme } from "../types";
import type { JobAnalysis } from "../types";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Separator } from "./ui/separator";

interface ResearchCardProps {
  data: JobAnalysis;
  company: string;
  jobTitle: string;
}

interface SectionBlockProps {
  label: string;
  children: React.ReactNode;
  variant?: "default" | "danger";
}

function SectionBlock({ label, children, variant = "default" }: SectionBlockProps) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <span
        style={{
          display: "block",
          fontSize: "11px",
          fontWeight: theme.font.weight.semibold,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: theme.colors.textMuted,
          fontFamily: theme.font.family,
          marginBottom: "8px",
        }}
      >
        {label}
      </span>
      {variant === "danger" ? (
        <div
          style={{
            background: theme.colors.dangerDim,
            border: `1px solid ${theme.colors.dangerBorder}`,
            borderRadius: theme.radius.sm,
            padding: "10px 12px",
          }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

const FALLBACK_TEXT = "Analysis unavailable — please try again.";

function isDataEmpty(data: JobAnalysis): boolean {
  if (!data) return true;
  return (
    !data.companyOverview ||
    !data.roleExpectations ||
    !data.cultureSignals ||
    !data.potentialRedFlags ||
    !data.positioningTips ||
    !data.questionsToAsk ||
    data.questionsToAsk.length === 0 ||
    data.companyOverview === FALLBACK_TEXT
  );
}

export default function ResearchCard({ data, company, jobTitle }: ResearchCardProps) {
  if (isDataEmpty(data)) {
    return (
      <Card className="mt-2 max-w-[82%]">
        <CardContent className="pt-4">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertTriangle size={14} color={theme.colors.danger} />
            <span style={{ fontSize: theme.font.size.base, color: theme.colors.textSecondary, fontFamily: theme.font.family }}>
              Analysis unavailable
            </span>
          </div>
          <p style={{ fontSize: theme.font.size.sm, color: theme.colors.textMuted, marginTop: "4px", fontFamily: theme.font.family }}>
            Please try again or rephrase your message.
          </p>
        </CardContent>
      </Card>
    );
  }

  const pStyle: React.CSSProperties = {
    fontSize: theme.font.size.md,
    color: theme.colors.textSecondary,
    lineHeight: "1.6",
    fontFamily: theme.font.family,
    margin: 0,
  };

  return (
    <Card className="mount-anim my-2 max-w-[82%]">
      <CardHeader className="pb-3">
        {/* Document header — company left, job title right */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
          <span
            style={{
              fontSize: "18px",
              fontWeight: theme.font.weight.bold,
              color: theme.colors.text,
              fontFamily: theme.font.family,
            }}
          >
            {company}
          </span>
          <span
            style={{
              fontSize: theme.font.size.sm,
              color: theme.colors.textSecondary,
              fontFamily: theme.font.family,
              flexShrink: 0,
            }}
          >
            {jobTitle}
          </span>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="pt-5">
        <SectionBlock label="Company Overview">
          <p style={pStyle}>{data.companyOverview}</p>
        </SectionBlock>

        <SectionBlock label="Role Expectations">
          <p style={pStyle}>{data.roleExpectations}</p>
        </SectionBlock>

        <SectionBlock label="Culture Signals">
          <p style={pStyle}>{data.cultureSignals}</p>
        </SectionBlock>

        <SectionBlock label="Red Flags" variant="danger">
          <p style={{ ...pStyle, color: theme.colors.danger }}>{data.potentialRedFlags}</p>
        </SectionBlock>

        <SectionBlock label="Questions to Ask">
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {data.questionsToAsk.map((q, i) => (
              <div key={i} style={{ display: "flex", gap: "10px" }}>
                <span
                  style={{
                    color: theme.colors.textSecondary,
                    fontWeight: theme.font.weight.semibold,
                    fontSize: theme.font.size.md,
                    fontFamily: theme.font.family,
                    flexShrink: 0,
                    lineHeight: "1.6",
                  }}
                >
                  {i + 1}.
                </span>
                <span style={pStyle}>{q}</span>
              </div>
            ))}
          </div>
        </SectionBlock>

        <SectionBlock label="How to Position Yourself">
          <p style={{ ...pStyle, marginBottom: 0 }}>{data.positioningTips}</p>
        </SectionBlock>
      </CardContent>
    </Card>
  );
}
