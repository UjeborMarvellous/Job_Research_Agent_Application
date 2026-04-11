import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

export type WebSearchHit = { title: string; url: string; description: string };

const webSearchDecisionSchema = z.object({
  needsSearch: z.boolean(),
  /**
   * Primary search query — always set when needsSearch is true.
   * For deep-research requests a second, complementary query is returned in query2.
   */
  query: z.string().max(220).optional(),
  /**
   * Optional second query for deep-research signals (company culture, news, interviews).
   * Only populated when the request clearly asks for thorough research.
   */
  query2: z.string().max(220).optional(),
});

/**
 * True when the user's message contains signals that call for deeper, multi-angle research
 * rather than a single lookup (e.g. "research the company", "tell me more about them",
 * "deep dive", "find out everything about").
 */
function looksLikeDeepResearchRequest(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(?:deep\s*(?:dive|research)|research\s+(?:the\s+)?(?:company|role|employer)|tell me (?:more|everything) about|find out (?:more|everything)|thorough(?:ly)?|comprehensive(?:ly)?)\b/.test(t)
  );
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
      "No results were returned for this query. Say that briefly and do not invent URLs.",
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

export async function decideWebSearchQuery(
  model: LanguageModel,
  userMessage: string,
  abortSignal: AbortSignal | undefined,
  maxOutputTokens: number,
): Promise<{ needsSearch: boolean; query: string | undefined; query2: string | undefined }> {
  const text = userMessage.trim();
  if (!text) return { needsSearch: false, query: undefined, query2: undefined };

  // If the message clearly asks for deep research, build a second complementary query
  // without an extra LLM call — just augment the primary query with culture/news signals.
  const isDeep = looksLikeDeepResearchRequest(text);

  try {
    const { object } = await generateObject({
      model,
      maxOutputTokens,
      schema: webSearchDecisionSchema,
      system: `You route requests for a job-market research assistant.
Set needsSearch to true when a live web lookup would materially help: user wants links or URLs, official company/careers/apply pages, job boards, verifying a website, Glassdoor/LinkedIn company pages, or current facts not in the chat.
Set needsSearch to false when the answer can use only the conversation: pasted job text, resume tips, greetings, listing saved research, or generic interview advice without needing external pages.
When needsSearch is true, set query to one short, high-signal web search query (keywords, not a long sentence).
When the request is clearly asking for thorough company or role research (deep dive, research the company, find out everything), also set query2 to a complementary search that targets culture, news, or interview signals for the same company/role.`,
      prompt: text.slice(0, 4000),
      abortSignal,
    });

    const needsSearch = object.needsSearch;
    let query = object.query?.trim();
    let query2 = object.query2?.trim() || undefined;

    if (needsSearch && !query) {
      query = text.slice(0, 200).replace(/\s+/g, " ").trim();
    }

    // If heuristic detected deep research but LLM did not produce query2, build one cheaply
    if (needsSearch && isDeep && !query2 && query) {
      // Append culture/interview signal to create a complementary query
      query2 = `${query.replace(/\s+site:\S+/g, "")} culture interview employee review`;
    }

    return { needsSearch, query: query || undefined, query2: query2 || undefined };
  } catch (e) {
    console.error("[decideWebSearchQuery]", e);
    return { needsSearch: false, query: undefined, query2: undefined };
  }
}
