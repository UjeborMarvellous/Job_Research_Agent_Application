# Project Understanding — cf_ai_job_research_agent

> This document captures my full understanding of the spec before any work begins.
> Review every section. If anything is wrong, correct me before we proceed.

---

## What We Are Building

A **production-quality Cloudflare AI application** for a Cloudflare internship submission.  
It is a **Job Application Research Assistant** — the user pastes a job description into a chat interface, and an AI agent returns structured research: company overview, role expectations, culture signals, red flags, interview questions, and positioning tips.  
All research is **saved automatically** and **persists across page refreshes** using Durable Objects + SQLite.

---

## Constraints That Are Non-Negotiable

| Rule | Detail |
|---|---|
| Package manager | `pnpm` only — no npm, no yarn, no `package-lock.json`, no `yarn.lock` |
| Template | Must bootstrap from `cloudflare/agents-starter` — no hand-wiring Vite |
| TypeScript | Strict mode, zero `any` except message parts |
| tsconfig | Only 2 changes: `"target": "ES2021"` and do NOT add `experimentalDecorators` |
| Colors | Theme object imported everywhere — zero hardcoded color strings in components |
| Icons | `lucide-react` only — no emojis anywhere |
| Build | `pnpm build` must pass zero TypeScript errors |
| Tools | All 3 agent tools defined as closures inside `onChatMessage` — no `.bind()` hacks |
| Structured output | `generateObject` (not free-form JSON) used inside `analyzeJobPosting` |
| Session | localStorage session ID passed as `name` to `useAgent` |
| InputBar | Must be a `<textarea>`, not `<input>` |
| Auto-scroll | Via `useRef` + `useEffect` — not manual DOM manipulation |

---

## Bootstrap Order (Sequence Matters)

1. Run `pnpm create cloudflare@latest cf_ai_job_research_agent --template cloudflare/agents-starter` — do NOT deploy when prompted
2. `cd cf_ai_job_research_agent`
3. `pnpm add @cloudflare/ai-chat lucide-react workers-ai-provider zod`
4. `pnpm add -D @types/react @types/react-dom`
5. Update `wrangler.jsonc` (only the specified fields)
6. Run `pnpm wrangler types` — this generates `worker-configuration.d.ts`
7. Fix any TypeScript errors from the generated types
8. **Delete** the template's `src/` contents entirely
9. Build the new `src/` structure from scratch

---

## tsconfig Changes (Exactly 2)

- `"target": "ES2021"` → prevents TC39 decorator SyntaxError in Vite
- Do **NOT** add `"experimentalDecorators": true` → this would break the Agents SDK

Everything else in tsconfig stays untouched.

---

## wrangler.jsonc — Only These Fields Updated/Added

```
"name": "cf-ai-job-research-agent"
"main": "src/server.ts"
"compatibility_date": "2026-04-02"
"ai": { "binding": "AI" }
"assets": { "directory": "public", "binding": "ASSETS", "not_found_handling": "single-page-application" }
"durable_objects": { bindings: [{ "name": "JobResearchAgent", "class_name": "JobResearchAgent" }] }
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["JobResearchAgent"] }]
```

Everything else in the template's `wrangler.jsonc` stays.

---

## Full File Structure

```
cf_ai_job_research_agent/
├── src/
│   ├── server.ts                        ← Worker entry + exports JobResearchAgent + default fetch handler
│   ├── agent/
│   │   └── JobResearchAgent.ts          ← AIChatAgent class with all 3 tools
│   └── client/
│       ├── main.tsx                     ← ReactDOM.createRoot entry
│       ├── App.tsx                      ← Root layout: Sidebar + ChatWindow in flex row
│       ├── components/
│       │   ├── Sidebar.tsx              ← Research history list, 260px wide
│       │   ├── ChatWindow.tsx           ← Messages area + top bar + welcome state
│       │   ├── MessageBubble.tsx        ← Per-message renderer, handles user/assistant/tool parts
│       │   ├── ResearchCard.tsx         ← Structured output card with 6 sections
│       │   ├── InputBar.tsx             ← Textarea + send button with spinner
│       │   └── TypingIndicator.tsx      ← 3 orange pulsing dots
│       ├── hooks/
│       │   └── useJobAgent.ts           ← useAgent + useAgentChat + localStorage session ID
│       └── types/
│           └── index.ts                 ← theme const + all interfaces
├── public/
│   └── index.html                       ← Template file, only title + <style> block changed
├── wrangler.jsonc
├── vite.config.ts                       ← DO NOT TOUCH
├── tsconfig.json                        ← Only 2 changes
├── package.json
├── worker-configuration.d.ts            ← Auto-generated, never edit
├── README.md
└── PROMPTS.md
```

---

## Architecture — How the Pieces Connect

```
Browser (React + Vite)
  └── useJobAgent.ts
        ├── useAgent({ agent: "JobResearchAgent", name: sessionId })
        │     └── connects via WebSocket to the Durable Object instance
        └── useAgentChat({ agent, onStateUpdate })
              └── streams messages, receives state updates

Cloudflare Worker (src/server.ts)
  └── routeAgentRequest → routes WebSocket upgrades to the correct DO instance
        └── JobResearchAgent (Durable Object)
              ├── extends AIChatAgent<Env, AgentState>
              ├── initialState: { researches: [] }
              ├── onChatMessage → streams LLM response via Workers AI
              └── 3 tools (closures):
                    ├── analyzeJobPosting → generateObject → returns JobAnalysis
                    ├── saveResearch → this.setState (persists to DO SQLite)
                    └── getResearchHistory → reads this.state
```

---

## The 3 Agent Tools — What Each Does

### 1. `analyzeJobPosting`
- **Input:** `jobTitle`, `company`, `jobDescription`
- **What it does:** Makes a second LLM call using `generateObject` with a Zod schema — guaranteed typed output, no JSON parsing failures
- **Returns:** `JobAnalysis` object (6 fields)
- **Error handling:** try/catch → returns fallback `JobAnalysis` with "Analysis unavailable" strings

### 2. `saveResearch`
- **Input:** `company`, `jobTitle`, `summary`
- **What it does:** Creates a `ResearchEntry` with `crypto.randomUUID()` + ISO timestamp, calls `this.setState` to persist to Durable Object SQLite
- **Returns:** `{ success: true, id }` or `{ success: false, error }`
- **Error handling:** try/catch → returns `{ success: false }`

### 3. `getResearchHistory`
- **Input:** none (empty Zod object)
- **What it does:** Reads `this.state.researches` from the Durable Object
- **Returns:** `{ researches: ResearchEntry[], count: number }`
- **Error handling:** try/catch → returns empty array

---

## Agent Behavior (System Prompt Intent)

1. User pastes a job description
2. Agent **immediately** calls `analyzeJobPosting` — no text written before the tool call
3. After analysis completes, agent calls `saveResearch` with a one-sentence summary
4. After all tools complete, agent writes a brief 2-3 sentence commentary on the single most important finding
5. When user asks for history → agent calls `getResearchHistory`
6. `maxSteps: 5` to allow multi-tool chains

---

## Session Persistence — How It Works

- On first load: `crypto.randomUUID()` is generated and stored in `localStorage` under key `"jra_session_id"`
- On every reload: the same ID is retrieved
- This ID is passed as `name` to `useAgent` → the same Durable Object instance is used every time
- Research history in the DO SQLite survives page refreshes, tab closes, and browser restarts

---

## UI Layout

```
┌─────────────────────────────────────────────────────────┐
│ [Sidebar 260px]          │ [ChatWindow flex-1]           │
│                          │                               │
│  Header: "Research       │  Top bar: "Job Research       │
│  History" + count badge  │  Agent" | "Powered by CF AI"  │
│                          │                               │
│  ─────────────────────   │  [Welcome state OR messages]  │
│                          │                               │
│  [Entry 1 - newest]      │  [MessageBubble]              │
│    Company name          │  [MessageBubble]              │
│    Job title             │  [ResearchCard]               │
│    "2h ago"              │  [TypingIndicator]            │
│                          │                               │
│  [Entry 2]               │  ─────────────────────────── │
│  [Entry 3]               │  [InputBar - textarea]        │
│  ...                     │                               │
└─────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Key Responsibility |
|---|---|
| `Sidebar` | Reversed history list, relative timestamps, hover chevron, empty state |
| `ChatWindow` | Top bar, welcome state with 3 feature chips, auto-scroll, hosts InputBar |
| `MessageBubble` | User bubbles right-aligned, assistant parts left-aligned, renders ResearchCard on tool output, Loader2 spinner on tool running state |
| `ResearchCard` | 6 SectionBlocks, danger variant for Red Flags, guard clause for missing data |
| `InputBar` | Auto-resize textarea, focus ring on container (not textarea), send button with Loader2 when streaming |
| `TypingIndicator` | 3 orange dots, keyframe pulse animation, staggered delays |

---

## The 6 Required Error Handling Locations

1. `analyzeJobPosting execute` → try/catch, returns fallback `JobAnalysis`
2. `saveResearch execute` → try/catch, returns `{ success: false }`
3. `getResearchHistory execute` → try/catch, returns empty array
4. `MessageBubble` → try/catch around all part rendering
5. `ResearchCard` → guard clause at top for missing/empty/fallback data
6. `InputBar` → guard: do not call `onSend` if value is empty or `disabled`

---

## The Theme Object — Why It Matters

The `theme` object in `src/client/types/index.ts` is the **single source of truth** for all visual styling. Every component imports it. Zero hardcoded color strings (no `"#F48120"`, no `"rgba(...)"`) are allowed anywhere in component files. This is enforced as a non-negotiable rule.

---

## Models Used

| Use Case | Model |
|---|---|
| Main chat streaming | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| Structured analysis (`generateObject`) | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |

Both via `workers-ai-provider` → `createWorkersAI({ binding: this.env.AI })`.  
No external API keys needed — runs entirely on Cloudflare Workers AI.

---

## What Does NOT Exist in This Project

- No database other than Durable Object SQLite
- No authentication
- No external API calls
- No markdown rendering library (just `whitespace-pre-wrap`)
- No CSS files or CSS modules (all inline styles using theme)
- No Tailwind (despite the template — inline styles only)
- No global state management (React context or Redux)
- No React Router

---

## Potential Gotchas I've Noted

1. **`experimentalDecorators` must NOT be added** — it breaks the Agents SDK. The spec is explicit.
2. **`vite.config.ts` must not be touched** — the template wires Vite + Wrangler correctly already.
3. **`generateObject` must be imported separately** from `"ai"` — it is not on `streamText`.
4. **`useAgentChat` comes from `"@cloudflare/ai-chat/react"`** not from `"agents/react"`.
5. **`useAgent` comes from `"agents/react"`** not from `"@cloudflare/ai-chat"`.
6. **Tool definitions are closures** — `this` is naturally in scope. No `.bind()` needed.
7. **`message.parts` structure** — the `ai-sdk` UIMessage type uses `.parts` not `.content` for assistant messages. MessageBubble must map over parts correctly.
8. **Loader2 spin animation** — must be a `<style>` keyframe tag injected in InputBar. Not a CSS file.
9. **Sidebar order** — `[...researches].reverse()` — never mutate state directly.
10. **`wrangler types` must be run** after every wrangler.jsonc change — otherwise `Env` types will be stale.

---

## Files That Must Not Be Created

- No `.css` files
- No separate utility files
- No extra helper modules beyond what the spec lists
- `SectionBlock` is defined inline inside `ResearchCard.tsx` — not its own file

---

## Delivery Checklist (From Spec)

- [ ] Created from cloudflare/agents-starter template
- [ ] pnpm only, no package-lock.json
- [ ] tsconfig: target ES2021, no experimentalDecorators
- [ ] wrangler types run, worker-configuration.d.ts exists
- [ ] wrangler.jsonc: assets binding, DO binding, migration v1
- [ ] src/server.ts: exports JobResearchAgent + default fetch handler
- [ ] JobResearchAgent: extends AIChatAgent<Env, AgentState>
- [ ] initialState set on agent class
- [ ] All 3 tools as closures inside onChatMessage
- [ ] analyzeJobPosting: uses generateObject with Zod schema + try/catch
- [ ] saveResearch: uses this.setState + try/catch
- [ ] getResearchHistory: reads this.state + try/catch
- [ ] useJobAgent: localStorage session ID passed as name to useAgent
- [ ] App.tsx: 260px sidebar + flex-1 chat window
- [ ] Sidebar: reversed order, relative time, hover chevron, empty state
- [ ] ChatWindow: top bar, welcome state, chips, auto-scroll, InputBar
- [ ] MessageBubble: try/catch, correct alignment, tool state handling
- [ ] ResearchCard: guard clause, 6 sections, danger variant on Red Flags
- [ ] InputBar: textarea, auto-resize, focus ring on container, spinner
- [ ] TypingIndicator: orange pulsing dots via keyframe
- [ ] All 6 error handling locations implemented
- [ ] theme imported everywhere, zero hardcoded color strings
- [ ] lucide-react used for all icons, no emojis anywhere
- [ ] README: architecture table, pnpm commands, example prompts
- [ ] PROMPTS.md: both prompts, decisions, full prompt pasted
- [ ] pnpm build: zero errors
- [ ] Folder named cf_ai_job_research_agent

---

## Confirmed Answers

1. `Hello.md` — nothing relevant, ignore it.
2. **Start completely fresh** — the template has NOT been run yet. Bootstrap step 1 is the true starting point.
3. **Working directory:** `c:\Users\ujebo\Desktop\CloudFlare_Project\cf_ai_job_research_agent\`
4. **Await explicit go-ahead** before any work begins.

---

*Ready and waiting. No work will begin until you give the go-ahead.*
