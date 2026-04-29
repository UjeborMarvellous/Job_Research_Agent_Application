# CF AI Job Research Agent

An AI-powered job application research assistant built on Cloudflare's edge platform. Users paste a job description into a chat interface and the agent returns structured analysis covering company background, role expectations, culture signals, red flags, interview questions, and positioning tips — all persisted across sessions using Durable Objects with SQLite.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Features](#features)
- [Project Structure](#project-structure)
- [API & Agent Routes](#api--agent-routes)
- [External Integrations](#external-integrations)
- [State & Persistence](#state--persistence)
- [CI/CD Pipelines](#cicd-pipelines)
- [Local Development](#local-development)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)
- [What Is Not Yet Built](#what-is-not-yet-built)

---

## Overview

This project is a production Cloudflare Workers application that combines:

- A **Durable Object** (class `JobResearchAgent`) acting as a stateful AI agent
- A **React 19** single-page frontend with a rich-text document editor
- **Three web search APIs** (JSearch, Serper, Brave) for live job and company research
- **Cloudflare Workers AI** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) for all LLM calls
- **Streaming UI** via the Agents SDK WebSocket, showing real-time agent steps as spinner rows

Each browser session maps to one Durable Object instance, which stores the full conversation history, all saved job analyses, the user's uploaded resume, and all generated documents (cover letters, emails, CV tips) as immutable versioned snapshots.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Cloudflare Workers | Latest |
| Agent SDK | Cloudflare Agents SDK | 0.9.0 |
| LLM | Llama 3.3 70B (Workers AI) | Native |
| Persistence | Durable Objects + SQLite | Native |
| Frontend | React | 19.2.4 |
| Build Tool | Vite | 8.0.3 |
| CSS | Tailwind CSS | 4.2.2 |
| UI Components | Chakra UI, Radix UI | 3.34.0 / 2.x |
| Rich Text Editor | TipTap / ProseMirror | 3.22.1 |
| Icons | lucide-react | 0.511.0 |
| AI SDK | Vercel AI SDK | 6.0.142 |
| Schema Validation | Zod | 4.3.6 |
| Document Export | jsPDF, docx, html2canvas | 4.2.1 / 9.6.1 / 1.4.1 |
| Animations | Framer Motion | 12.38.0 |
| Linting / Formatting | oxlint / oxfmt | 1.58.0 / 0.43.0 |
| Package Manager | pnpm | 9 |
| Node | Node.js | 22 |
| TypeScript | TypeScript | 6.0.2 |
| CLI / Deploy | Wrangler | 4.79.0 |

---

## Architecture

### Communication Model

All client–server communication is bidirectional **streaming over WebSocket**, established automatically by the Agents SDK. There are no traditional REST endpoints. The client sends chat messages; the server streams back structured UI message parts (text, tool invocations, tool results, agent step rows).

### Single Durable Object Per Session

Each browser session gets its own `JobResearchAgent` Durable Object instance, keyed by a UUID stored in `localStorage`. This object holds:

- Full chat history
- All saved job analyses (up to 100)
- The user's uploaded resume
- All generated documents and their immutable version snapshots

### Intent Classification Pipeline

Every incoming message is processed through a two-stage router:

1. **Heuristic pre-check** — Short or generic messages are classified cheaply without calling the LLM
2. **LLM classification** — Longer messages are routed by the model to one of six intents:

| Intent | Trigger |
|---|---|
| `analyze-job` | User pasted a job description |
| `view-history` | User asked to see saved research |
| `view-saved-entry` | User selected a sidebar entry |
| `generate-document` | Generate cover letter / email / CV tips |
| `update-document` | Revise or personalize an existing document |
| `chat` | General conversation, advice, questions |

### Immutable Document Versioning

Generated documents are stored as SHA-256 content-hashed snapshots in Durable Object state. Each snapshot is also indexed by the tool call ID that created it. Old document versions remain accessible even after the message list is compacted.

---

## Features

### Chat & Research

- Paste any job description and receive a structured analysis card with 6 sections
- Analysis sections: Company Overview, Role Expectations, Culture Signals, Red Flags, Questions to Ask, Positioning Tips
- Real-time streaming with visible agent step rows (spinners → checkmarks)
- Up to 100 saved analyses per session, browsable in the sidebar

### Document Generation

- **Cover Letters** — Personalized to the job description and the user's resume
- **Emails** — Outreach and follow-up emails
- **CV Tips** — Targeted improvement suggestions per role
- All documents open in the in-app TipTap rich-text editor
- Export to **PDF**, **DOCX**, or plain **TXT**

### Resume Handling

- Upload `.pdf`, `.docx`, or `.txt` resume from the input bar
- Resume is parsed client-side (`pdfjs` for PDF, `mammoth` for DOCX) and stored in Durable Object state
- Used automatically for document personalization without re-uploading each session

### Research History

- All job analyses persist in Durable Object SQLite storage
- Sidebar shows all past analyses for the current session
- `localStorage` syncs the conversation list across page refreshes

### Multi-Conversation

- Each session is an independent Durable Object instance
- Users can open multiple sessions; the sidebar shows all past conversations
- Conversations are keyed by UUID, never collide

### Mobile UI

- Sidebar collapses to a drawer overlay on mobile
- Document editor opens as a bottom sheet on mobile
- Responsive layout driven by a `useMediaQuery` hook

---

## Project Structure

```
cf_ai_job_research_agent/
├── src/
│   ├── server.ts                      # Worker entry point (routes via Agents SDK)
│   ├── agent/
│   │   ├── JobResearchAgent.ts        # Core Durable Object — 1,989 lines
│   │   ├── agentSteps.ts              # Synthetic tool parts for UI progress rows
│   │   └── webSearch.ts               # JSearch / Serper / Brave integrations
│   ├── client/
│   │   ├── main.tsx                   # React entry + Chakra provider
│   │   ├── App.tsx                    # Root layout (Sidebar / Chat / Editor)
│   │   ├── index.css                  # Global CSS + theme variables
│   │   ├── components/
│   │   │   ├── Sidebar.tsx            # Conversation list, new chat, collapse
│   │   │   ├── ChatWindow.tsx         # Message list + top bar + welcome screen
│   │   │   ├── MessageBubble.tsx      # Per-message renderer
│   │   │   ├── ResearchCard.tsx       # Structured analysis output card
│   │   │   ├── InputBar.tsx           # Textarea + resume upload + send
│   │   │   ├── TypingIndicator.tsx    # 3-dot streaming animation
│   │   │   ├── DocumentEditor.tsx     # TipTap editor + export toolbar
│   │   │   ├── AgentStepRow.tsx       # Spinner / check progress row
│   │   │   ├── aceternity/            # BackgroundBeams, ShimmerText effects
│   │   │   └── ui/                    # Radix-based Button, Card, etc.
│   │   ├── hooks/
│   │   │   ├── useJobAgent.ts         # useAgent + useAgentChat + session logic
│   │   │   └── useMediaQuery.ts       # Responsive breakpoint hook
│   │   ├── types/
│   │   │   └── index.ts               # Theme constants + TypeScript interfaces
│   │   └── utils/
│   │       ├── documentVersionId.ts   # SHA-256 snapshot IDs
│   │       ├── exportDocument.ts      # PDF / DOCX / TXT export
│   │       ├── parseResumeFile.ts     # Client-side resume parsing
│   │       └── userMessageComposerText.ts  # Message formatting
│   └── cloudflare-env.d.ts            # Environment type definitions
├── .github/workflows/
│   ├── deploy-production.yml          # main branch → production deploy
│   ├── deploy-staging.yml             # Staging branch → staging environment
│   └── sanity-check.yml               # TypeScript + lint check on PRs
├── wrangler.jsonc                     # Cloudflare bindings + environments
├── vite.config.ts                     # Vite + Agents SDK + Tailwind + React
├── tsconfig.json                      # TypeScript config (ES2021 target)
├── package.json                       # Scripts + dependencies
└── index.html                         # SPA entry (dark theme)
```

---

## API & Agent Routes

There are no traditional REST API routes. All communication flows through the Agents SDK WebSocket. The worker entry (`src/server.ts`) passes every request to `routeAgentRequest(request, env)`. A `404` is returned if no agent route matches.

### Message Meta-Tags

The client embeds structured metadata into chat messages using bracket tags that the agent parses before LLM processing:

| Tag | Purpose |
|---|---|
| `[editor-session:...]` | Current document editor session ID |
| `[editor-content:...]` | Current document text (for update requests) |
| `[view-entry:...]` | ID of sidebar research entry to display |
| `[resume-upload:...]` | Parsed resume text to store in DO state |

---

## External Integrations

### Cloudflare Workers AI

- **Model**: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- Used for intent classification, job analysis (structured JSON via `generateObject`), document generation, and conversational replies
- No external API key required — runs natively on Cloudflare edge

**Output token limits** (prevent LLM truncation):

| Task | Max Tokens |
|---|---|
| Job analysis JSON | 8,192 |
| Cover letters / emails | 2,048 |
| CV tips | 3,072 |
| General chat | 4,096 |

### JSearch (RapidAPI)

- Primary source for live job listings
- Queries across LinkedIn, Indeed, Glassdoor, and 500+ job boards
- Returns salary range, location, employment type, and posting date

### Serper.dev

- Fallback for Google Jobs results when JSearch is unavailable
- Real-time search results with structured job data

### Brave Search API

- Used for deep company and role research
- Surfaces culture signals, Glassdoor reviews, news, and company background
- Supports multi-query orchestration for comprehensive research results

**Search routing logic:**

| Query Type | Primary | Fallback |
|---|---|---|
| Job-finding queries | JSearch | Serper |
| Company / culture research | Brave Search | — |
| No recognizable query | Skipped | — |

---

## State & Persistence

### Durable Object State Shape

```typescript
{
  researches: ResearchEntry[];
  resumeText?: string;
  resumeFileName?: string;
  sidebarTitle?: string;
  sidebarTitleFinalized?: boolean;
  awaitingPersonalizedCoverLetter?: boolean;
  lastGeneratedDocument?: DocumentMeta | null;
  documentVersionMap?: Record<string, DocumentSnapshot>;
  documentVersionByToolCallId?: Record<string, string>;
}
```

### localStorage Keys (Client)

| Key | Contents |
|---|---|
| `jra_conversations` | Array of `ConversationMeta` (id, title, createdAt, updatedAt) |
| `jra_active_session` | UUID of the current active session |

---

## CI/CD Pipelines

All pipelines run on **Ubuntu 24.04**, Node 22, pnpm 9.

### Sanity Check — PRs and pushes to `main`

1. `pnpm install --frozen-lockfile`
2. `pnpm run check` (TypeScript + oxlint)
3. Timeout: 5 minutes

### Deploy Staging — push to `Staging` branch

1. Install → check → build → `wrangler deploy --env staging`
2. Worker name: `cf-ai-job-research-agent-staging`
3. Timeout: 15 minutes
4. Secrets required: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

### Deploy Production — push to `main` branch

1. Install → check → build → `wrangler deploy`
2. Worker name: `cf-ai-job-research-agent`
3. Same secrets and timeout as staging

---

## Local Development

```bash
# Install dependencies
pnpm install

# Authenticate with Cloudflare
pnpm wrangler login

# Start local dev server
pnpm dev
# Available at http://localhost:8787
```

---

## Deployment

```bash
# Type check + lint
pnpm check

# Build frontend + worker
pnpm build

# Deploy to production
pnpm deploy
```

Pushes to the `Staging` and `main` branches trigger automatic deploys via GitHub Actions.

---

## Environment Variables

Local secrets go in `.dev.vars` (never commit to source control). Three API keys are required for web search:

| Variable | Used For |
|---|---|
| `BRAVE_API_KEY` | Brave Search — company and role research |
| `JSEARCH_API_KEY` | JSearch via RapidAPI — live job listings |
| `SERPER_API_KEY` | Serper.dev — Google Jobs fallback |

In production, store these as Cloudflare Worker secrets:

```bash
pnpm exec wrangler secret put BRAVE_API_KEY
pnpm exec wrangler secret put JSEARCH_API_KEY
pnpm exec wrangler secret put SERPER_API_KEY
```

---

## What Is Not Yet Built

| Feature | Notes |
|---|---|
| Live RAG system | Requires Vectorize binding, BGE embedding model, D1 metadata store, semantic search pipeline |
| Authentication / user accounts | Sessions are anonymous and device-local |
| Analytics / observability | No logging pipeline beyond Cloudflare's built-in observability |
| Unit and E2E tests | No test suite exists yet |
| ATS scanner | Applicant Tracking System keyword analysis |
| Mock interview mode | AI-driven practice Q&A |
| Salary negotiation assistant | Guided negotiation coaching |
| Culture scores | Aggregated scoring from Glassdoor and review sources |
| R2 / KV storage | Not used — Durable Object SQLite handles all persistence |
| D1 database | Not configured — planned for the RAG metadata store |
