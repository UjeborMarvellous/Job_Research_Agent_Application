import React, { type CSSProperties } from "react";
import {
  AlertTriangle,
  Building2,
  MessageCircleQuestion,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { theme } from "../types";
import type { JobAnalysis } from "../types";
import { Card, CardContent } from "./ui/card";

interface ResearchCardProps {
  data: JobAnalysis;
  company: string;
  jobTitle: string;
}

interface InsightSectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  accent?: "default" | "danger" | "success";
}

function InsightSection({ icon, title, children, accent = "default" }: InsightSectionProps) {
  const accentBar =
    accent === "danger"
      ? theme.colors.danger
      : accent === "success"
        ? theme.colors.success
        : theme.colors.text;

  return (
    <section
      style={{
        borderRadius: theme.radius.md,
        border: `1px solid ${theme.colors.border}`,
        background: theme.colors.background,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(15, 15, 15, 0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 14px",
          background: theme.colors.surface,
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        <span
          aria-hidden
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "28px",
            height: "28px",
            borderRadius: theme.radius.sm,
            background: theme.colors.background,
            border: `1px solid ${theme.colors.border}`,
            color: theme.colors.textSecondary,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <h3
          style={{
            margin: 0,
            flex: 1,
            fontSize: theme.font.size.sm,
            fontWeight: theme.font.weight.semibold,
            letterSpacing: "0.02em",
            color: theme.colors.text,
            fontFamily: theme.font.family,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span
            style={{
              width: "3px",
              height: "14px",
              borderRadius: "2px",
              background: accentBar,
              flexShrink: 0,
            }}
          />
          {title}
        </h3>
      </div>
      <div style={{ padding: "14px 16px 16px" }}>{children}</div>
    </section>
  );
}

const bodyText: CSSProperties = {
  fontSize: theme.font.size.md,
  color: theme.colors.textSecondary,
  lineHeight: String(theme.font.lineHeight.relaxed),
  fontFamily: theme.font.family,
  margin: 0,
};

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
      <Card className="mount-anim mt-2 max-w-[82%] overflow-hidden border-border/80 shadow-[0_4px_24px_rgba(15,15,15,0.06)]">
        <CardContent className="p-5 pt-5">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: theme.radius.md,
                background: theme.colors.dangerDim,
                border: `1px solid ${theme.colors.dangerBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={16} color={theme.colors.danger} strokeWidth={2} />
            </div>
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: theme.font.size.md,
                  fontWeight: theme.font.weight.semibold,
                  color: theme.colors.text,
                  fontFamily: theme.font.family,
                }}
              >
                Analysis unavailable
              </p>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: theme.font.size.sm,
                  color: theme.colors.textMuted,
                  fontFamily: theme.font.family,
                }}
              >
                Please try again or rephrase your message.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="mount-anim my-2 max-w-[82%] overflow-hidden border-border/90"
      style={{
        borderRadius: theme.radius.lg,
        boxShadow: `${theme.shadow.card}, 0 12px 40px rgba(15, 15, 15, 0.06)`,
        background: theme.colors.surface,
      }}
    >
      {/* Hero */}
      <header
        style={{
          padding: "20px 20px 18px",
          background: `linear-gradient(180deg, ${theme.colors.background} 0%, ${theme.colors.surface} 100%)`,
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        <p
          style={{
            margin: "0 0 6px",
            fontSize: theme.font.size.xs,
            fontWeight: theme.font.weight.medium,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: theme.colors.textMuted,
            fontFamily: theme.font.family,
          }}
        >
          Role research
        </p>
        <h2
          style={{
            margin: 0,
            fontSize: theme.font.size.xl,
            fontWeight: theme.font.weight.bold,
            letterSpacing: "-0.02em",
            color: theme.colors.text,
            fontFamily: theme.font.family,
            lineHeight: theme.font.lineHeight.tight,
          }}
        >
          {company}
        </h2>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: theme.font.size.md,
            fontWeight: theme.font.weight.medium,
            color: theme.colors.textSecondary,
            fontFamily: theme.font.family,
            lineHeight: theme.font.lineHeight.base,
            maxWidth: "100%",
          }}
        >
          {jobTitle}
        </p>
      </header>

      <CardContent
        className="p-0"
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          background: theme.colors.surface,
        }}
      >
        <InsightSection icon={<Building2 size={14} strokeWidth={2} />} title="Company overview">
          <p style={bodyText}>{data.companyOverview}</p>
        </InsightSection>

        <InsightSection icon={<Target size={14} strokeWidth={2} />} title="Role expectations">
          <p style={bodyText}>{data.roleExpectations}</p>
        </InsightSection>

        <InsightSection icon={<Users size={14} strokeWidth={2} />} title="Culture signals">
          <p style={bodyText}>{data.cultureSignals}</p>
        </InsightSection>

        <InsightSection
          icon={<AlertTriangle size={14} strokeWidth={2} />}
          title="Red flags"
          accent="danger"
        >
          <div
            style={{
              borderRadius: theme.radius.sm,
              padding: "12px 14px",
              background: theme.colors.dangerDim,
              border: `1px solid ${theme.colors.dangerBorder}`,
            }}
          >
            <p
              style={{
                ...bodyText,
                color: theme.colors.danger,
                fontWeight: theme.font.weight.medium,
              }}
            >
              {data.potentialRedFlags}
            </p>
          </div>
        </InsightSection>

        <InsightSection
          icon={<MessageCircleQuestion size={14} strokeWidth={2} />}
          title="Questions to ask"
          accent="success"
        >
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {data.questionsToAsk.map((q, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: "24px",
                    height: "24px",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: theme.font.size.xs,
                    fontWeight: theme.font.weight.semibold,
                    fontFamily: theme.font.family,
                    background: theme.colors.surfaceElevated,
                    border: `1px solid ${theme.colors.border}`,
                    color: theme.colors.textSecondary,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ ...bodyText, paddingTop: "2px" }}>{q}</span>
              </li>
            ))}
          </ul>
        </InsightSection>

        <InsightSection icon={<TrendingUp size={14} strokeWidth={2} />} title="How to position yourself">
          <p style={{ ...bodyText, marginBottom: 0 }}>{data.positioningTips}</p>
        </InsightSection>
      </CardContent>
    </Card>
  );
}
