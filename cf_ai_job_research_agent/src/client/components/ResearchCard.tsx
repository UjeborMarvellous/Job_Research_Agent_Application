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
  /** Tighter typography and padding on narrow viewports */
  compact?: boolean;
}

interface InsightSectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  accent?: "default" | "danger" | "success";
  compact?: boolean;
}

function InsightSection({ icon, title, children, accent = "default", compact }: InsightSectionProps) {
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
          gap: compact ? "8px" : "10px",
          padding: compact ? "8px 10px" : "10px 14px",
          background: theme.colors.surface,
          borderBottom: `1px solid ${theme.colors.border}`,
          minWidth: 0,
        }}
      >
        <span
          aria-hidden
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: compact ? "24px" : "28px",
            height: compact ? "24px" : "28px",
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
            minWidth: 0,
            fontSize: compact ? theme.font.size.xs : theme.font.size.sm,
            fontWeight: theme.font.weight.semibold,
            letterSpacing: "0.02em",
            color: theme.colors.text,
            fontFamily: theme.font.family,
            display: "flex",
            alignItems: "center",
            gap: compact ? "6px" : "8px",
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
          <span style={{ minWidth: 0, flex: 1, overflowWrap: "break-word" }}>{title}</span>
        </h3>
      </div>
      <div style={{ padding: compact ? "10px 12px 12px" : "14px 16px 16px" }}>{children}</div>
    </section>
  );
}

const bodyText: CSSProperties = {
  fontSize: theme.font.size.md,
  color: theme.colors.textSecondary,
  lineHeight: String(theme.font.lineHeight.relaxed),
  fontFamily: theme.font.family,
  margin: 0,
  overflowWrap: "break-word",
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

export default function ResearchCard({ data, company, jobTitle, compact }: ResearchCardProps) {
  if (isDataEmpty(data)) {
    return (
      <Card className="mount-anim mt-2 w-full min-w-0 max-w-[82%] overflow-hidden border-border/80 shadow-[0_4px_24px_rgba(15,15,15,0.06)]">
        <CardContent className={compact ? "p-3 pt-3" : "p-5 pt-5"}>
          <div style={{ display: "flex", alignItems: "center", gap: compact ? "8px" : "10px" }}>
            <div
              style={{
                width: compact ? "32px" : "36px",
                height: compact ? "32px" : "36px",
                borderRadius: theme.radius.md,
                background: theme.colors.dangerDim,
                border: `1px solid ${theme.colors.dangerBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={compact ? 14 : 16} color={theme.colors.danger} strokeWidth={2} />
            </div>
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: compact ? theme.font.size.sm : theme.font.size.md,
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
                  fontSize: compact ? theme.font.size.xs : theme.font.size.sm,
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

  const iconSize = compact ? 12 : 14;
  const sectionBody: CSSProperties = compact
    ? { ...bodyText, fontSize: theme.font.size.sm }
    : bodyText;

  return (
    <Card
      className="mount-anim my-2 w-full min-w-0 max-w-[82%] overflow-hidden border-border/90"
      style={{
        borderRadius: theme.radius.lg,
        boxShadow: `${theme.shadow.card}, 0 12px 40px rgba(15, 15, 15, 0.06)`,
        background: theme.colors.surface,
      }}
    >
      {/* Hero */}
      <header
        style={{
          padding: compact ? "12px 12px 10px" : "20px 20px 18px",
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
            fontSize: compact ? theme.font.size.lg : theme.font.size.xl,
            fontWeight: theme.font.weight.bold,
            letterSpacing: "-0.02em",
            color: theme.colors.text,
            fontFamily: theme.font.family,
            lineHeight: theme.font.lineHeight.tight,
            overflowWrap: "break-word",
          }}
        >
          {company}
        </h2>
        <p
          style={{
            margin: compact ? "6px 0 0" : "8px 0 0",
            fontSize: compact ? theme.font.size.sm : theme.font.size.md,
            fontWeight: theme.font.weight.medium,
            color: theme.colors.textSecondary,
            fontFamily: theme.font.family,
            lineHeight: theme.font.lineHeight.base,
            maxWidth: "100%",
            overflowWrap: "break-word",
          }}
        >
          {jobTitle}
        </p>
      </header>

      <CardContent
        className="p-0"
        style={{
          padding: compact ? "10px" : "16px",
          display: "flex",
          flexDirection: "column",
          gap: compact ? "8px" : "12px",
          background: theme.colors.surface,
        }}
      >
        <InsightSection icon={<Building2 size={iconSize} strokeWidth={2} />} title="Company overview" compact={compact}>
          <p style={sectionBody}>{data.companyOverview}</p>
        </InsightSection>

        <InsightSection icon={<Target size={iconSize} strokeWidth={2} />} title="Role expectations" compact={compact}>
          <p style={sectionBody}>{data.roleExpectations}</p>
        </InsightSection>

        <InsightSection icon={<Users size={iconSize} strokeWidth={2} />} title="Culture signals" compact={compact}>
          <p style={sectionBody}>{data.cultureSignals}</p>
        </InsightSection>

        <InsightSection
          icon={<AlertTriangle size={iconSize} strokeWidth={2} />}
          title="Red flags"
          accent="danger"
          compact={compact}
        >
          <div
            style={{
              borderRadius: theme.radius.sm,
              padding: compact ? "8px 10px" : "12px 14px",
              background: theme.colors.dangerDim,
              border: `1px solid ${theme.colors.dangerBorder}`,
            }}
          >
            <p
              style={{
                ...sectionBody,
                color: theme.colors.danger,
                fontWeight: theme.font.weight.medium,
              }}
            >
              {data.potentialRedFlags}
            </p>
          </div>
        </InsightSection>

        <InsightSection
          icon={<MessageCircleQuestion size={iconSize} strokeWidth={2} />}
          title="Questions to ask"
          accent="success"
          compact={compact}
        >
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: compact ? "8px" : "10px",
            }}
          >
            {data.questionsToAsk.map((q, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  gap: compact ? "8px" : "12px",
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: compact ? "22px" : "24px",
                    height: compact ? "22px" : "24px",
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
                <span
                  style={{
                    ...sectionBody,
                    paddingTop: "2px",
                    minWidth: 0,
                    overflowWrap: "break-word",
                  }}
                >
                  {q}
                </span>
              </li>
            ))}
          </ul>
        </InsightSection>

        <InsightSection icon={<TrendingUp size={iconSize} strokeWidth={2} />} title="How to position yourself" compact={compact}>
          <p style={{ ...sectionBody, marginBottom: 0 }}>{data.positioningTips}</p>
        </InsightSection>
      </CardContent>
    </Card>
  );
}
