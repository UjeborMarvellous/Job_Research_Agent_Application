import type { LanguageModel } from "ai";

export type WebSearchHit = { title: string; url: string; description: string };

// ─── Query classification ─────────────────────────────────────────────────────

/**
 * True when the user's message looks like a job-finding request
 * (needs live listings) rather than company/role research.
 */
function looksLikeJobFindingQuery(text: string): boolean {
  return (
    /\b(?:find|get|show|give|suggest|recommend|search\s+for)\b.{0,40}\b(?:job|jobs|role|roles|position|positions|opening|openings|opportunit)/i.test(text) ||
    /\bjobs?\b.{0,30}\b(?:match|suit|fit|for me|my skills?|my level|my background)\b/i.test(text) ||
    /\b(?:what|which|any)\s+jobs?\b/i.test(text) ||
    /\bjobs?\s+(?:that\s+)?(?:match|suit|fit)\b/i.test(text) ||
    /\b(?:help me find|looking for\s+(?:a\s+)?job|need\s+(?:a\s+)?job|want\s+(?:a\s+)?job)\b/i.test(text) ||
    /\b(?:remote|hybrid|on.?site)\s+(?:job|work|role|position|opportunit)\b/i.test(text) ||
    /\b(?:hiring|openings?|vacancies|vacancies)\b/i.test(text) ||
    /\b(?:latest|current|recent|2024|2025|2026)\b.{0,20}\b(?:job|hire|hiring|role|opening)\b/i.test(text)
  );
}

function looksLikeDeepResearchRequest(text: string): boolean {
  return /\b(?:deep\s*(?:dive|research)|research\s+(?:the\s+)?(?:company|role|employer)|tell me (?:more|everything) about|find out (?:more|everything)|thorough(?:ly)?|comprehensive(?:ly)?)\b/i.test(text);
}

function buildQueryFromMessage(text: string): string {
  const company = text.match(
    /\b(?:at|for|about|research(?:ing)?)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/,
  )?.[1];

  const title = text.match(
    /\b(software engineer|frontend|backend|full.?stack|data scientist|ml engineer|ai engineer|product manager|devops|cloud engineer|react developer|node developer|python developer|web developer)\b/i,
  )?.[0];

  const tech = text.match(
    /\b(react|next\.?js|node\.?js|typescript|python|javascript|aws|gcp|azure|docker|kubernetes|llm|machine learning)\b/i,
  )?.[0];

  const remote = /\bremote\b/i.test(text) ? "remote" : "";
  const parts = [company, title ?? tech, remote].filter(Boolean);

  if (parts.length > 0) return parts.join(" ").trim().slice(0, 200);

  return text
    .replace(/\b(?:please|can you|could you|i need|i want|help me|get me|show me|tell me)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

// ─── JSearch (RapidAPI) — live worldwide job listings ─────────────────────────

type JSearchJob = {
  job_title?: string;
  employer_name?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_description?: string;
  job_apply_link?: string;
  job_posted_at_datetime_utc?: string;
  job_employment_type?: string;
  job_is_remote?: boolean;
  job_min_salary?: number;
  job_max_salary?: number;
  job_salary_currency?: string;
};

export async function jSearchJobSearch(
  query: string,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<WebSearchHit[]> {
  const key = apiKey?.trim();
  const q = query.trim();
  if (!key || !q) return [];

  const url = new URL("https://jsearch.p.rapidapi.com/search");
  url.searchParams.set("query", q);
  url.searchParams.set("num_pages", "1");
  url.searchParams.set("date_posted", "week");
  url.searchParams.set("remote_jobs_only", /\bremote\b/i.test(q) ? "true" : "false");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
      },
      signal,
    });

    if (!res.ok) {
      console.error("[jSearchJobSearch] HTTP", res.status, await res.text().catch(() => ""));
      return [];
    }

    const data = (await res.json()) as { data?: JSearchJob[] };
    const jobs = data.data ?? [];

    return jobs.slice(0, 10).map((job) => {
      const location = [job.job_city, job.job_state, job.job_country]
        .filter(Boolean)
        .join(", ");
      const remote = job.job_is_remote ? " · Remote" : "";
      const type = job.job_employment_type ? ` · ${job.job_employment_type}` : "";
      const salary =
        job.job_min_salary && job.job_max_salary
          ? ` · ${job.job_salary_currency ?? "$"}${Math.round(job.job_min_salary / 1000)}k–${Math.round(job.job_max_salary / 1000)}k`
          : "";
      const posted = job.job_posted_at_datetime_utc
        ? ` · Posted ${new Date(job.job_posted_at_datetime_utc).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
        : "";

      return {
        title: `${job.job_title ?? "Job"} at ${job.employer_name ?? "Company"}`,
        url: job.job_apply_link ?? "",
        description: `${location}${remote}${type}${salary}${posted}. ${(job.job_description ?? "").slice(0, 220).replace(/\s+/g, " ")}`.trim(),
      };
    }).filter((h) => h.url);
  } catch (err) {
    console.error("[jSearchJobSearch] fetch error:", err);
    return [];
  }
}

// ─── Serper.dev — Google Jobs (worldwide, real-time fallback) ─────────────────

type SerperJobResult = {
  title?: string;
  companyName?: string;
  location?: string;
  via?: string;
  description?: string;
  jobHighlights?: Array<{ title?: string; items?: string[] }>;
  applyOptions?: Array<{ title?: string; link?: string }>;
  detectedExtensions?: {
    postedAt?: string;
    scheduleType?: string;
    salary?: string;
  };
};

export async function serperJobSearch(
  query: string,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<WebSearchHit[]> {
  const key = apiKey?.trim();
  const q = query.trim();
  if (!key || !q) return [];

  try {
    const res = await fetch("https://google.serper.dev/jobs", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q, num: 10 }),
      signal,
    });

    if (!res.ok) {
      console.error("[serperJobSearch] HTTP", res.status, await res.text().catch(() => ""));
      return [];
    }

    const data = (await res.json()) as { jobs?: SerperJobResult[] };
    const jobs = data.jobs ?? [];

    return jobs.slice(0, 10).map((job) => {
      const ext = job.detectedExtensions ?? {};
      const meta = [job.location, ext.scheduleType, ext.postedAt, ext.salary]
        .filter(Boolean)
        .join(" · ");
      const via = job.via ? ` via ${job.via}` : "";
      const applyLink = job.applyOptions?.[0]?.link ?? "";

      return {
        title: `${job.title ?? "Job"} at ${job.companyName ?? "Company"}${via}`,
        url: applyLink,
        description: `${meta}. ${(job.description ?? "").slice(0, 220).replace(/\s+/g, " ")}`.trim(),
      };
    }).filter((h) => h.url);
  } catch (err) {
    console.error("[serperJobSearch] fetch error:", err);
    return [];
  }
}

// ─── Brave Web Search — company / role research ───────────────────────────────

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

// ─── Output formatters ────────────────────────────────────────────────────────

export function formatJobSearchContext(hits: WebSearchHit[], source: "jsearch" | "serper"): string {
  if (hits.length === 0) {
    return [
      "## Live job search",
      "No live job listings were returned for this query. Do NOT invent job listings or URLs. Direct the user to search on LinkedIn (linkedin.com/jobs), Indeed (indeed.com), or Glassdoor (glassdoor.com) directly.",
    ].join("\n");
  }

  const sourceLabel = source === "jsearch" ? "JSearch (LinkedIn, Indeed, Glassdoor & 500+ boards)" : "Google Jobs (Serper)";
  const blocks = hits.map((h, i) => {
    const desc = h.description ? `\n   ${h.description}` : "";
    return `${i + 1}. ${h.title}\n   Apply: ${h.url}${desc}`;
  });

  return [
    `## Live job listings — sourced from ${sourceLabel}`,
    "These are real, active job postings retrieved right now. Present each one with its title, company, and apply link. Copy every URL exactly as listed — do not shorten, modify, or guess any URL.",
    "",
    ...blocks,
  ].join("\n");
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

// ─── Main search decision + routing ──────────────────────────────────────────

/** Appended to search-grounding rule. */
const _GROUNDED_URL_RULE =
  "Never invent or guess URLs. You may include full https:// links only when they appear in the user's message, in web search results provided in this prompt, or in structured data (saved research, tool outputs) you were given.";

export type SearchResult = {
  block: string;
  type: "jobs" | "research" | "none";
};

/**
 * Decides which API to use, runs the search, and returns a formatted context block.
 * Routing:
 *   - Job-finding queries → JSearch (primary) → Serper.dev (fallback)
 *   - Company / role research → Brave
 *   - No signal → skip
 */
export async function runSearch(
  userMessage: string,
  env: { JSEARCH_API_KEY?: string; SERPER_API_KEY?: string; BRAVE_SEARCH_API_KEY?: string },
  signal?: AbortSignal,
): Promise<SearchResult> {
  const text = userMessage.trim();
  if (!text) return { block: "", type: "none" };

  const isJobQuery = looksLikeJobFindingQuery(text);

  const needsAnySearch =
    isJobQuery ||
    /\b(?:glassdoor|linkedin|indeed|crunchbase|levels\.fyi|blind)\b/i.test(text) ||
    /\b(?:company|employer|startup|firm)\b.{0,30}\b(?:news|review|rating|culture|salary|funding)\b/i.test(text) ||
    /\b(?:link|url|website|apply|careers?\s+page)\b/i.test(text) ||
    /\b(?:salary|compensation|pay|market\s+rate)\b/i.test(text) ||
    /\b(?:search|look up|find out|where can i|how do i find)\b/i.test(text);

  if (!needsAnySearch) return { block: "", type: "none" };

  const query = buildQueryFromMessage(text);
  if (!query) return { block: "", type: "none" };

  if (isJobQuery) {
    // Primary: JSearch
    const jKey = env.JSEARCH_API_KEY?.trim();
    if (jKey) {
      const hits = await jSearchJobSearch(query, jKey, signal);
      if (hits.length > 0) {
        return { block: formatJobSearchContext(hits, "jsearch"), type: "jobs" };
      }
    }

    // Fallback: Serper.dev
    const sKey = env.SERPER_API_KEY?.trim();
    if (sKey) {
      const hits = await serperJobSearch(query, sKey, signal);
      if (hits.length > 0) {
        return { block: formatJobSearchContext(hits, "serper"), type: "jobs" };
      }
    }

    return {
      block: "## Live job search\nNo live job listings were returned. Direct the user to LinkedIn (linkedin.com/jobs), Indeed (indeed.com), or Glassdoor (glassdoor.com).",
      type: "none",
    };
  }

  // Company / role research: Brave
  const bKey = env.BRAVE_SEARCH_API_KEY?.trim();
  if (!bKey) return { block: "", type: "none" };

  const isDeep = looksLikeDeepResearchRequest(text);
  const query2 = isDeep
    ? `${query.replace(/\s+site:\S+/g, "")} culture interview employee review`
    : undefined;

  const queries: [string] | [string, string] = query2 ? [query, query2] : [query];
  const hits = await braveWebSearchMulti(queries, bKey, signal);
  return { block: formatWebSearchContext(hits), type: "research" };
}

/**
 * Legacy: kept for backward compatibility with any existing call sites.
 * New code should use runSearch() directly.
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
    looksLikeJobFindingQuery(text) ||
    /\b(?:glassdoor|linkedin|indeed|crunchbase|levels\.fyi|blind)\b/i.test(text) ||
    /\b(?:company|employer|startup|firm)\b.{0,30}\b(?:news|review|rating|culture|salary|funding|valuation)\b/i.test(text) ||
    /\b(?:link|url|website|apply|careers?\s+page|job\s+board|apply\s+(?:for|to))\b/i.test(text) ||
    /\b(?:salary|compensation|pay|hourly|annual|market\s+rate|pay\s+range)\b/i.test(text) ||
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
