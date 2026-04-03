import React from "react";
import {
  Building2,
  Target,
  Leaf,
  AlertTriangle,
  MessageSquare,
  Lightbulb,
} from "lucide-react";
import { theme } from "../types";
import type { JobAnalysis } from "../types";

interface ResearchCardProps {
  data: JobAnalysis;
  company: string;
  jobTitle: string;
}

interface SectionBlockProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  variant: "default" | "danger";
}

function SectionBlock({ icon, label, children, variant }: SectionBlockProps) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        {icon}
        <span
          style={{
            fontSize: theme.font.size.sm,
            fontWeight: theme.font.weight.semibold,
            color: theme.colors.text,
            fontFamily: theme.font.family,
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ marginLeft: "20px", marginTop: "6px" }}>
        {variant === "danger" ? (
          <div
            style={{
              background: theme.colors.dangerDim,
              border: `1px solid ${theme.colors.dangerBorder}`,
              borderRadius: theme.radius.sm,
              padding: "8px 10px",
            }}
          >
            {children}
          </div>
        ) : (
          children
        )}
      </div>
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
    data.companyOverview === FALLBACK_TEXT
  );
}

export default function ResearchCard({ data, company, jobTitle }: ResearchCardProps) {
  if (isDataEmpty(data)) {
    return (
      <div
        style={{
          background: theme.colors.surfaceElevated,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radius.md,
          padding: "16px 20px",
          marginTop: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <AlertTriangle size={14} color={theme.colors.danger} />
          <span
            style={{
              fontSize: theme.font.size.base,
              color: theme.colors.textSecondary,
              fontFamily: theme.font.family,
            }}
          >
            Analysis unavailable
          </span>
        </div>
        <p
          style={{
            fontSize: theme.font.size.sm,
            color: theme.colors.textMuted,
            marginTop: "4px",
            fontFamily: theme.font.family,
          }}
        >
          Please try again or rephrase your message.
        </p>
      </div>
    );
  }

  const pStyle: React.CSSProperties = {
    fontSize: theme.font.size.base,
    color: theme.colors.textSecondary,
    lineHeight: String(theme.font.lineHeight.relaxed),
    fontFamily: theme.font.family,
  };

  return (
    <div
      style={{
        background: theme.colors.surfaceElevated,
        border: `1px solid ${theme.colors.border}`,
        borderLeft: `3px solid ${theme.colors.orange}`,
        borderRadius: theme.radius.md,
        padding: "20px 24px",
        margin: "8px 0",
        maxWidth: "82%",
      }}
    >
      <p
        style={{
          fontSize: theme.font.size.lg,
          fontWeight: theme.font.weight.bold,
          color: theme.colors.text,
          fontFamily: theme.font.family,
        }}
      >
        {company}
      </p>
      <p
        style={{
          fontSize: theme.font.size.md,
          color: theme.colors.textSecondary,
          marginTop: "4px",
          fontFamily: theme.font.family,
        }}
      >
        {jobTitle}
      </p>
      <div
        style={{
          borderTop: `1px solid ${theme.colors.border}`,
          margin: "16px 0",
        }}
      />

      <SectionBlock
        icon={<Building2 size={14} color={theme.colors.orange} />}
        label="Company Overview"
        variant="default"
      >
        <p style={pStyle}>{data.companyOverview}</p>
      </SectionBlock>

      <SectionBlock
        icon={<Target size={14} color={theme.colors.orange} />}
        label="Role Expectations"
        variant="default"
      >
        <p style={pStyle}>{data.roleExpectations}</p>
      </SectionBlock>

      <SectionBlock
        icon={<Leaf size={14} color={theme.colors.orange} />}
        label="Culture Signals"
        variant="default"
      >
        <p style={pStyle}>{data.cultureSignals}</p>
      </SectionBlock>

      <SectionBlock
        icon={<AlertTriangle size={14} color={theme.colors.danger} />}
        label="Red Flags"
        variant="danger"
      >
        <p style={pStyle}>{data.potentialRedFlags}</p>
      </SectionBlock>

      <SectionBlock
        icon={<MessageSquare size={14} color={theme.colors.orange} />}
        label="Questions to Ask"
        variant="default"
      >
        <ol style={{ paddingLeft: "16px", margin: 0 }}>
          {data.questionsToAsk.map((q, i) => (
            <li
              key={i}
              style={{
                marginBottom: "4px",
                lineHeight: String(theme.font.lineHeight.relaxed),
                fontSize: theme.font.size.base,
                color: theme.colors.textSecondary,
                fontFamily: theme.font.family,
              }}
            >
              {q}
            </li>
          ))}
        </ol>
      </SectionBlock>

      <SectionBlock
        icon={<Lightbulb size={14} color={theme.colors.orange} />}
        label="How to Position Yourself"
        variant="default"
      >
        <p style={pStyle}>{data.positioningTips}</p>
      </SectionBlock>
    </div>
  );
}
