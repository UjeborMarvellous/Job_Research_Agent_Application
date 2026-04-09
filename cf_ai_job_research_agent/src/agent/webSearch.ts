import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

export type WebSearchHit = { title: string; url: string; description: string };

const webSearchDecisionSchema = z.object({
  needsSearch: z.boolean(),
  query: z.string().max(220).optional(),
});

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
    "These URLs are from a live search. Include the relevant ones as full https:// links in your reply so the user can open them. Do not change hostnames or paths; do not add links that are not listed below.",
    "",
    ...blocks,
  ].join("\n");
}

export async function decideWebSearchQuery(
  model: LanguageModel,
  userMessage: string,
  abortSignal: AbortSignal | undefined,
  maxOutputTokens: number,
): Promise<{ needsSearch: boolean; query: string | undefined }> {
  const text = userMessage.trim();
  if (!text) return { needsSearch: false, query: undefined };

  try {
    const { object } = await generateObject({
      model,
      maxOutputTokens,
      schema: webSearchDecisionSchema,
      system: `You route requests for a job-market research assistant.
Set needsSearch to true when a live web lookup would materially help: user wants links or URLs, official company/careers/apply pages, job boards, verifying a website, Glassdoor/LinkedIn company pages, or current facts not in the chat.
Set needsSearch to false when the answer can use only the conversation: pasted job text, resume tips, greetings, listing saved research, or generic interview advice without needing external pages.
When needsSearch is true, set query to one short, high-signal web search query (keywords, not a long sentence).`,
      prompt: text.slice(0, 4000),
      abortSignal,
    });

    const needsSearch = object.needsSearch;
    let query = object.query?.trim();
    if (needsSearch && !query) {
      query = text.slice(0, 200).replace(/\s+/g, " ").trim();
    }
    return { needsSearch, query: query || undefined };
  } catch (e) {
    console.error("[decideWebSearchQuery]", e);
    return { needsSearch: false, query: undefined };
  }
}
