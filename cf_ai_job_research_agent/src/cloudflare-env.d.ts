declare namespace Cloudflare {
  interface Env {
    /** Brave Search API key — set with: wrangler secret put BRAVE_SEARCH_API_KEY */
    BRAVE_SEARCH_API_KEY?: string;
    /** JSearch (RapidAPI) key — set with: wrangler secret put JSEARCH_API_KEY */
    JSEARCH_API_KEY?: string;
    /** Serper.dev API key — set with: wrangler secret put SERPER_API_KEY */
    SERPER_API_KEY?: string;
  }
}