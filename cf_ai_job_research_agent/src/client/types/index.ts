// All color values reference CSS variables defined in src/client/index.css.
// Light theme: white background, black text, strong shadow depth.
export const theme = {
  colors: {
    background:      "var(--color-background)",   // #ffffff
    surface:         "var(--color-surface)",        // #fafafa
    surfaceElevated: "var(--color-surface-elevated)", // #f0f0f0
    surfaceHover:    "var(--color-surface-hover)",  // #ebebeb
    border:          "var(--color-border)",         // #e2e2e2
    text:            "var(--color-text)",           // #0f0f0f
    textSecondary:   "var(--color-text-secondary)", // #555555
    textMuted:       "var(--color-text-muted)",     // #aaaaaa
    danger:          "var(--color-danger)",         // #dc2626
    dangerDim:       "var(--color-danger-dim)",
    dangerBorder:    "var(--color-danger-border)",
    success:         "var(--color-success)",        // #16a34a
    white:           "#ffffff",
  },
  font: {
    family: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    size: {
      xs:  "11px",
      sm:  "12px",
      base:"13px",
      md:  "14px",
      lg:  "16px",
      xl:  "20px",
      xxl: "24px",
    },
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeight: { tight: 1.3, base: 1.5, relaxed: 1.7 },
  },
  radius: { sm: "6px", md: "10px", lg: "14px" },
  spacing: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", xxl: "32px" },
  transition: "all 0.15s ease",
  shadow: {
    card:    "var(--shadow-card)",
    panel:   "var(--shadow-panel)",
    modal:   "var(--shadow-modal)",
    focus:   "var(--shadow-focus)",
    sidebar: "var(--shadow-sidebar)",
    topbar:  "var(--shadow-topbar)",
    inputbar:"var(--shadow-inputbar)",
  },
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
  resumeText?: string;
  resumeFileName?: string;
  /** Short label for the conversation list (set by the agent, not raw user text). */
  sidebarTitle?: string;
  /** Once true, sidebarTitle is not overwritten by job saves or re-generated each turn. */
  sidebarTitleFinalized?: boolean;
  /**
   * Full document content stored in DO state to bypass message-level truncation.
   * Updated every time a document is generated or revised.
   */
  lastGeneratedDocument?: DocumentMeta | null;
}

export interface DocumentMeta {
  title: string;
  content: string;
  documentType: string;
}

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
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
