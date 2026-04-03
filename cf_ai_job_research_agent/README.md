# cf_ai_job_research_agent

An AI-powered job application research assistant built on Cloudflare's Agents SDK.

## What It Does

Paste any job description into the chat and the agent immediately produces structured research using Llama 3.3: company background, role expectations, culture signals, red flags, tailored interview questions, and positioning advice. Every research is saved automatically to a Durable Object so your history survives page refreshes. Click any entry in the sidebar to recall it.

## Architecture

| Component | Role |
|---|---|
| Workers AI — Llama 3.3 70B | LLM inference, no API key required |
| Agents SDK / AIChatAgent | WebSocket chat, streaming, message persistence |
| Durable Objects + SQLite | Per-session research history, survives reloads |
| Cloudflare Workers | HTTP routing and static asset serving |

## Prerequisites

- Node.js 18+
- pnpm: `npm install -g pnpm`
- Cloudflare account (free tier works)

## Run Locally

```bash
pnpm install
npx wrangler login       # Opens browser to authorize your Cloudflare account
npx wrangler types       # Generates TypeScript bindings
pnpm dev                 # Starts local dev server at http://localhost:8787
```

## Deploy

```bash
pnpm build
npx wrangler deploy
```

Terminal outputs your live URL when complete.

## Try These Prompts

- Paste any job description and press Enter
- "What are the biggest red flags in this role?"
- "Show me my research history"
- Refresh the page — your history persists

## Stack

- **LLM:** Llama 3.3 70B Instruct via Cloudflare Workers AI
- **Memory:** Durable Object SQLite, session-persistent via localStorage ID
- **Icons:** lucide-react
- **Frontend:** React + Vite via Cloudflare Vite plugin
- **Streaming:** WebSocket via Agents SDK
