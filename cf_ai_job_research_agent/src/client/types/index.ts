export const theme = {
  colors: {
    background: "#0a0a0a",
    surface: "#111111",
    surfaceElevated: "#181818",
    surfaceHover: "#1f1f1f",
    border: "#1e1e1e",
    borderFocus: "#F48120",
    orange: "#F48120",
    orangeDim: "rgba(244, 129, 32, 0.12)",
    orangeBorder: "rgba(244, 129, 32, 0.2)",
    white: "#ffffff",
    orangeSubtle: "rgba(244, 129, 32, 0.06)",
    text: "#efefef",
    textSecondary: "#999999",
    textMuted: "#4a4a4a",
    danger: "#ef4444",
    dangerDim: "rgba(239, 68, 68, 0.08)",
    dangerBorder: "rgba(239, 68, 68, 0.25)",
  },
  font: {
    family: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    size: {
      xs: "11px",
      sm: "12px",
      base: "13px",
      md: "14px",
      lg: "16px",
      xl: "20px",
      xxl: "24px",
    },
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeight: { tight: 1.3, base: 1.5, relaxed: 1.7 },
  },
  radius: { sm: "5px", md: "8px", lg: "12px" },
  spacing: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", xxl: "32px" },
  transition: "all 0.15s ease",
} as const;

export interface JobAnalysis {
  companyOverview: string;
  roleExpectations: string;
  cultureSignals: string;
  potentialRedFlags: string;
  questionsToAsk: string[];
  positioningTips: string;
}

export interface ResearchEntry {
  id: string;
  company: string;
  jobTitle: string;
  summary: string;
  timestamp: string;
  analysis: JobAnalysis;
}

export interface AgentState {
  researches: ResearchEntry[];
}

export interface UIMessagePart {
  type: string;
  text?: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
}

export interface UIMessage {
  id: string;
  role: string;
  parts: UIMessagePart[];
}
