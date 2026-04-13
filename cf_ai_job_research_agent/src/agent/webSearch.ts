import type { LanguageModel } from "ai";

export type WebSearchHit = { title: string; url: string; description: string };

/**
 * True when the user's message contains signals that call for deeper, multi-angle research
 * rather than a single lookup (e.g. "research the company", "tell me more about them",
 * "deep dive", "find out everything about").
 */
function looksLikeDeepResearchRequest(text: string): boolean {
  return /\b(?:deep\s*(?:dive|research)|research\s+(?:the\s+)?(?:company|role|employer)|tell me (?:more|everything) about|find out (?:more|everything)|thorough(?:ly)?|comprehensive(?:ly)?)\b/i.test(text);
}

/**
 * Extracts a concise, high-signal search query from the user's raw message.
 * Looks for company names, job titles, and tech keywords before falling back
 * to the trimmed raw text.
 */
function buildQueryFromMessage(text: string): string {
  // Company name: capitalised words following "at", "for", "about", "research"
  const company = text.match(
    /\b(?:at|for|about|research(?:ing)?)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/,
  )?.[1];

  // Explicit job title
  const title = text.match(
    /\b(software engineer|frontend|backend|full.?stack|data scientist|ml engineer|ai engineer|product manager|devops|cloud engineer|react developer|node developer|python developer|web developer)\b/i,
  )?.[0];

  // Tech stack keyword
  const tech = text.match(
    /\b(react|next\.?js|node\.?js|typescript|python|javascript|aws|gcp|azure|docker|kubernetes|llm|machine learning)\b/i,
  )?.[0];

  const remote = /\bremote\b/i.test(text) ? "remote" : "";
  const parts = [company, title ?? tech, remote].filter(Boolean);

  if (parts.length > 0) return parts.join(" ").trim().slice(0, 200);

  // Fallback: strip filler words and use what remains
  return text
    .replace(/\b(?:please|can you|could you|i need|i want|help me|get me|show me|tell me)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/**
 * Brave Web Search API — requires BRAVE_SEARCH_API_KEY (wrangler secret).
 * https://api.search.brave.com/res/v1/web/search
 */
export async function braveWebSearch(
  query: string,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<WebSearchHit[]> {
  const key = apiKey?.trim();
  const q = query.trim();
  if (!key || !q) return [];

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", q);
  url.searchParams.set("count", "8");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": key,
    },
    signal,
  });

  if (!res.ok) {
    console.error("[braveWebSearch] HTTP", res.status, await res.text().catch(() => ""));
    return [];
  }

  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };

  const raw = data.web?.results ?? [];
  return raw
    .filter((r) => typeof r.url === "string" && /^https?:\/\//i.test(r.url))
    .map((r) => ({
      title: (r.title ?? "Untitled").slice(0, 200),
      url: r.url as string,
      description: (r.description ?? "").replace(/\s+/g, " ").trim().slice(0, 280),
    }));
}

/**
 * Run up to 2 Brave queries in parallel, merge results, and deduplicate by URL.
 * Falls back gracefully if the second query is absent.
 */
export async function braveWebSearchMulti(
  queries: [string] | [string, string],
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<WebSearchHit[]> {
  const results = await Promise.all(
    queries.map((q) => braveWebSearch(q, apiKey, signal)),
  );
  const seen = new Set<string>();
  const merged: WebSearchHit[] = [];
  for (const batch of results) {
    for (const hit of batch) {
      if (!seen.has(hit.url)) {
        seen.add(hit.url);
        merged.push(hit);
      }
    }
  }
  return merged;
}

export function formatWebSearchContext(hits: WebSearchHit[]): string {
  if (hits.length === 0) {
    return [
      "## Web search",
      "No results were returned for this query. Tell the user no live search results are available right now. Do NOT invent job listings, company names, or URLs. Direct them to search on LinkedIn (linkedin.com/jobs), Indeed (indeed.com), or Glassdoor (glassdoor.com) directly.",
    ].join("\n");
  }

  const blocks = hits.map((h, i) => {
    const desc = h.description ? `\n   ${h.description}` : "";
    return `${i + 1}. ${h.title}\n   ${h.url}${desc}`;
  });

  return [
    "## Web search results",
    "These URLs are from a live search. Include the relevant ones as full https:// links in your reply so the user can open them. Copy each URL character-for-character exactly as listed — do not shorten, paraphrase, reformat, or modify any part of any URL including query strings. Do not add links that are not listed below.",
    "",
    ...blocks,
  ].join("\n");
}

/**
 * Decides whether to run a Brave web search and builds the query —
 * using ONLY heuristics (zero LLM calls, zero neuron cost).
 *
 * The `model`, `abortSignal`, and `maxOutputTokens` parameters are kept
 * for API compatibility but are intentionally unused.
 */
export function decideWebSearchQuery(
  _model: LanguageModel,
  userMessage: string,
  _abortSignal: AbortSignal | undefined,
  _maxOutputTokens: number,
): Promise<{ needsSearch: boolean; query: string | undefined; query2: string | undefined }> {
  const text = userMessage.trim();
  if (!text) return Promise.resolve({ needsSearch: false, query: undefined, query2: undefined });

  const needsSearch =
    // Job finding
    /\b(?:find|get|show|give|suggest|recommend|search\s+for)\b.{0,40}\b(?:job|jobs|role|roles|position|positions|opening|openings|work|opportunit)/i.test(text) ||
    /\bjobs?\b.{0,30}\b(?:match|suit|fit|for me|my skills?|my level|my background)\b/i.test(text) ||
    // Company / employer research
    /\b(?:glassdoor|linkedin|indeed|crunchbase|levels\.fyi|blind)\b/i.test(text) ||
    /\b(?:company|employer|startup|firm)\b.{0,30}\b(?:news|review|rating|culture|salary|funding|valuation)\b/i.test(text) ||
    // Links, apply pages, careers
    /\b(?:link|url|website|apply|careers?\s+page|job\s+board|apply\s+(?:for|to))\b/i.test(text) ||
    // Salary / compensation data
    /\b(?:salary|compensation|pay|hourly|annual|market\s+rate|pay\s+range)\b/i.test(text) ||
    // Remote / hybrid jobs
    /\b(?:remote|hybrid|on.?site)\s+(?:job|work|role|position|opportunit)\b/i.test(text) ||
    // Recent / current info signals
    /\b(?:latest|current|recent|2024|2025)\b.{0,20}\b(?:job|hire|hiring|role|opening)\b/i.test(text) ||
    // Explicit search intent
    /\b(?:search|look up|find out|look for|where can i|how do i find)\b/i.test(text);

  if (!needsSearch) {
    return Promise.resolve({ needsSearch: false, query: undefined, query2: undefined });
  }

  const query = buildQueryFromMessage(text);
  const isDeep = looksLikeDeepResearchRequest(text);
  const query2 = isDeep
    ? `${query.replace(/\s+site:\S+/g, "")} culture interview employee review`
    : undefined;

  return Promise.resolve({ needsSearch: true, query, query2 });
}
