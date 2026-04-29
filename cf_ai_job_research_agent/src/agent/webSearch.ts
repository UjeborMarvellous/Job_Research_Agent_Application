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
  location?: LocationHint,
): Promise<WebSearchHit[]> {
  const key = apiKey?.trim();
  const q = query.trim();
  if (!key || !q) return [];

  const url = new URL("https://jsearch.p.rapidapi.com/search");
  // Append location to query so JSearch filters by geography
  const fullQuery = location ? `${q} ${location.text}` : q;
  url.searchParams.set("query", fullQuery);
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
  location?: LocationHint,
): Promise<WebSearchHit[]> {
  const key = apiKey?.trim();
  const q = query.trim();
  if (!key || !q) return [];

  const body: Record<string, unknown> = { q, num: 10 };
  // gl (Google locale) narrows results to the user's country
  if (location?.countryCode) body.gl = location.countryCode;

  try {
    const res = await fetch("https://google.serper.dev/jobs", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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

// ─── Location extraction ──────────────────────────────────────────────────────

export type LocationHint = {
  text: string;        // e.g. "Lagos, Nigeria" — free-text param for JSearch
  countryCode: string; // e.g. "ng" — gl param for Serper
};

// Ordered longest-first so "United Arab Emirates" matches before "Emirates"
const COUNTRY_MAP: Array<[string, string, string]> = [
  ["united arab emirates", "ae", "United Arab Emirates"],
  ["united states of america", "us", "United States"],
  ["united states", "us", "United States"],
  ["united kingdom", "gb", "United Kingdom"],
  ["south africa", "za", "South Africa"],
  ["south korea", "kr", "South Korea"],
  ["new zealand", "nz", "New Zealand"],
  ["saudi arabia", "sa", "Saudi Arabia"],
  ["ivory coast", "ci", "Ivory Coast"],
  ["czech republic", "cz", "Czech Republic"],
  ["costa rica", "cr", "Costa Rica"],
  ["el salvador", "sv", "El Salvador"],
  ["netherlands", "nl", "Netherlands"],
  ["switzerland", "ch", "Switzerland"],
  ["philippines", "ph", "Philippines"],
  ["bangladesh", "bd", "Bangladesh"],
  ["argentina", "ar", "Argentina"],
  ["indonesia", "id", "Indonesia"],
  ["australia", "au", "Australia"],
  ["singapore", "sg", "Singapore"],
  ["colombia", "co", "Colombia"],
  ["malaysia", "my", "Malaysia"],
  ["pakistan", "pk", "Pakistan"],
  ["portugal", "pt", "Portugal"],
  ["thailand", "th", "Thailand"],
  ["ethiopia", "et", "Ethiopia"],
  ["tanzania", "tz", "Tanzania"],
  ["cameroon", "cm", "Cameroon"],
  ["zimbabwe", "zw", "Zimbabwe"],
  ["slovakia", "sk", "Slovakia"],
  ["bulgaria", "bg", "Bulgaria"],
  ["lithuania", "lt", "Lithuania"],
  ["slovenia", "si", "Slovenia"],
  ["germany", "de", "Germany"],
  ["denmark", "dk", "Denmark"],
  ["belgium", "be", "Belgium"],
  ["austria", "at", "Austria"],
  ["finland", "fi", "Finland"],
  ["ukraine", "ua", "Ukraine"],
  ["romania", "ro", "Romania"],
  ["vietnam", "vn", "Vietnam"],
  ["turkey", "tr", "Turkey"],
  ["sweden", "se", "Sweden"],
  ["israel", "il", "Israel"],
  ["france", "fr", "France"],
  ["brazil", "br", "Brazil"],
  ["mexico", "mx", "Mexico"],
  ["canada", "ca", "Canada"],
  ["poland", "pl", "Poland"],
  ["norway", "no", "Norway"],
  ["ireland", "ie", "Ireland"],
  ["czechia", "cz", "Czech Republic"],
  ["croatia", "hr", "Croatia"],
  ["hungary", "hu", "Hungary"],
  ["morocco", "ma", "Morocco"],
  ["tunisia", "tn", "Tunisia"],
  ["algeria", "dz", "Algeria"],
  ["ecuador", "ec", "Ecuador"],
  ["uruguay", "uy", "Uruguay"],
  ["bolivia", "bo", "Bolivia"],
  ["estonia", "ee", "Estonia"],
  ["latvia", "lv", "Latvia"],
  ["rwanda", "rw", "Rwanda"],
  ["senegal", "sn", "Senegal"],
  ["zambia", "zm", "Zambia"],
  ["uganda", "ug", "Uganda"],
  ["taiwan", "tw", "Taiwan"],
  ["jordan", "jo", "Jordan"],
  ["kuwait", "kw", "Kuwait"],
  ["qatar", "qa", "Qatar"],
  ["chile", "cl", "Chile"],
  ["ghana", "gh", "Ghana"],
  ["kenya", "ke", "Kenya"],
  ["egypt", "eg", "Egypt"],
  ["india", "in", "India"],
  ["japan", "jp", "Japan"],
  ["spain", "es", "Spain"],
  ["italy", "it", "Italy"],
  ["china", "cn", "China"],
  ["peru", "pe", "Peru"],
  ["oman", "om", "Oman"],
  ["iraq", "iq", "Iraq"],
  // Short abbreviations — case-insensitive but \b-bounded (no "us" — too many false positives)
  ["nigeria", "ng", "Nigeria"],
  ["usa", "us", "United States"],
  ["uae", "ae", "United Arab Emirates"],
];

type CityEntry = { countryCode: string; display: string };
const CITY_MAP: Array<[string, CityEntry]> = [
  // Longest entries first to ensure greedy matching (e.g. "New York City" before "New York")
  ["new york city",     { countryCode: "us", display: "New York, USA" }],
  ["san francisco",     { countryCode: "us", display: "San Francisco, USA" }],
  ["los angeles",       { countryCode: "us", display: "Los Angeles, USA" }],
  ["washington dc",     { countryCode: "us", display: "Washington DC, USA" }],
  ["washington, dc",    { countryCode: "us", display: "Washington DC, USA" }],
  ["ho chi minh city",  { countryCode: "vn", display: "Ho Chi Minh City, Vietnam" }],
  ["ho chi minh",       { countryCode: "vn", display: "Ho Chi Minh City, Vietnam" }],
  ["buenos aires",      { countryCode: "ar", display: "Buenos Aires, Argentina" }],
  ["rio de janeiro",    { countryCode: "br", display: "Rio de Janeiro, Brazil" }],
  ["mexico city",       { countryCode: "mx", display: "Mexico City, Mexico" }],
  ["kuala lumpur",      { countryCode: "my", display: "Kuala Lumpur, Malaysia" }],
  ["addis ababa",       { countryCode: "et", display: "Addis Ababa, Ethiopia" }],
  ["dar es salaam",     { countryCode: "tz", display: "Dar es Salaam, Tanzania" }],
  ["kuwait city",       { countryCode: "kw", display: "Kuwait City, Kuwait" }],
  ["new delhi",         { countryCode: "in", display: "New Delhi, India" }],
  ["cape town",         { countryCode: "za", display: "Cape Town, South Africa" }],
  ["tel aviv",          { countryCode: "il", display: "Tel Aviv, Israel" }],
  ["abu dhabi",         { countryCode: "ae", display: "Abu Dhabi, UAE" }],
  ["hong kong",         { countryCode: "hk", display: "Hong Kong" }],
  ["new york",          { countryCode: "us", display: "New York, USA" }],
  ["são paulo",         { countryCode: "br", display: "São Paulo, Brazil" }],
  ["sao paulo",         { countryCode: "br", display: "São Paulo, Brazil" }],
  ["johannesburg",      { countryCode: "za", display: "Johannesburg, South Africa" }],
  ["guadalajara",       { countryCode: "mx", display: "Guadalajara, Mexico" }],
  ["bogotá",            { countryCode: "co", display: "Bogotá, Colombia" }],
  ["bogota",            { countryCode: "co", display: "Bogotá, Colombia" }],
  ["bengaluru",         { countryCode: "in", display: "Bangalore, India" }],
  ["bangalore",         { countryCode: "in", display: "Bangalore, India" }],
  ["casablanca",        { countryCode: "ma", display: "Casablanca, Morocco" }],
  ["stockholm",         { countryCode: "se", display: "Stockholm, Sweden" }],
  ["copenhagen",        { countryCode: "dk", display: "Copenhagen, Denmark" }],
  ["amsterdam",         { countryCode: "nl", display: "Amsterdam, Netherlands" }],
  ["singapore",         { countryCode: "sg", display: "Singapore" }],
  ["bucharest",         { countryCode: "ro", display: "Bucharest, Romania" }],
  ["bratislava",        { countryCode: "sk", display: "Bratislava, Slovakia" }],
  ["hyderabad",         { countryCode: "in", display: "Hyderabad, India" }],
  ["guangzhou",         { countryCode: "cn", display: "Guangzhou, China" }],
  ["bangalore",         { countryCode: "in", display: "Bangalore, India" }],
  ["barcelona",         { countryCode: "es", display: "Barcelona, Spain" }],
  ["frankfurt",         { countryCode: "de", display: "Frankfurt, Germany" }],
  ["melbourne",         { countryCode: "au", display: "Melbourne, Australia" }],
  ["shenzhen",          { countryCode: "cn", display: "Shenzhen, China" }],
  ["montreal",          { countryCode: "ca", display: "Montreal, Canada" }],
  ["helsinki",          { countryCode: "fi", display: "Helsinki, Finland" }],
  ["brussels",          { countryCode: "be", display: "Brussels, Belgium" }],
  ["budapest",          { countryCode: "hu", display: "Budapest, Hungary" }],
  ["istanbul",          { countryCode: "tr", display: "Istanbul, Turkey" }],
  ["shanghai",          { countryCode: "cn", display: "Shanghai, China" }],
  ["toronto",           { countryCode: "ca", display: "Toronto, Canada" }],
  ["chicago",           { countryCode: "us", display: "Chicago, USA" }],
  ["hamburg",           { countryCode: "de", display: "Hamburg, Germany" }],
  ["cologne",           { countryCode: "de", display: "Cologne, Germany" }],
  ["nairobi",           { countryCode: "ke", display: "Nairobi, Kenya" }],
  ["kampala",           { countryCode: "ug", display: "Kampala, Uganda" }],
  ["kigali",            { countryCode: "rw", display: "Kigali, Rwanda" }],
  ["jakarta",           { countryCode: "id", display: "Jakarta, Indonesia" }],
  ["beijing",           { countryCode: "cn", display: "Beijing, China" }],
  ["seattle",           { countryCode: "us", display: "Seattle, USA" }],
  ["houston",           { countryCode: "us", display: "Houston, USA" }],
  ["atlanta",           { countryCode: "us", display: "Atlanta, USA" }],
  ["phoenix",           { countryCode: "us", display: "Phoenix, USA" }],
  ["detroit",           { countryCode: "us", display: "Detroit, USA" }],
  ["denver",            { countryCode: "us", display: "Denver, USA" }],
  ["boston",            { countryCode: "us", display: "Boston, USA" }],
  ["austin",            { countryCode: "us", display: "Austin, USA" }],
  ["dallas",            { countryCode: "us", display: "Dallas, USA" }],
  ["miami",             { countryCode: "us", display: "Miami, USA" }],
  ["taipei",            { countryCode: "tw", display: "Taipei, Taiwan" }],
  ["riyadh",            { countryCode: "sa", display: "Riyadh, Saudi Arabia" }],
  ["muscat",            { countryCode: "om", display: "Muscat, Oman" }],
  ["london",            { countryCode: "gb", display: "London, United Kingdom" }],
  ["berlin",            { countryCode: "de", display: "Berlin, Germany" }],
  ["munich",            { countryCode: "de", display: "Munich, Germany" }],
  ["zurich",            { countryCode: "ch", display: "Zurich, Switzerland" }],
  ["geneva",            { countryCode: "ch", display: "Geneva, Switzerland" }],
  ["vienna",            { countryCode: "at", display: "Vienna, Austria" }],
  ["lisbon",            { countryCode: "pt", display: "Lisbon, Portugal" }],
  ["madrid",            { countryCode: "es", display: "Madrid, Spain" }],
  ["prague",            { countryCode: "cz", display: "Prague, Czech Republic" }],
  ["warsaw",            { countryCode: "pl", display: "Warsaw, Poland" }],
  ["dublin",            { countryCode: "ie", display: "Dublin, Ireland" }],
  ["oslo",              { countryCode: "no", display: "Oslo, Norway" }],
  ["milan",             { countryCode: "it", display: "Milan, Italy" }],
  ["rome",              { countryCode: "it", display: "Rome, Italy" }],
  ["paris",             { countryCode: "fr", display: "Paris, France" }],
  ["kyiv",              { countryCode: "ua", display: "Kyiv, Ukraine" }],
  ["kiev",              { countryCode: "ua", display: "Kyiv, Ukraine" }],
  ["riga",              { countryCode: "lv", display: "Riga, Latvia" }],
  ["sofia",             { countryCode: "bg", display: "Sofia, Bulgaria" }],
  ["zagreb",            { countryCode: "hr", display: "Zagreb, Croatia" }],
  ["tallinn",           { countryCode: "ee", display: "Tallinn, Estonia" }],
  ["vilnius",           { countryCode: "lt", display: "Vilnius, Lithuania" }],
  ["amman",             { countryCode: "jo", display: "Amman, Jordan" }],
  ["doha",              { countryCode: "qa", display: "Doha, Qatar" }],
  ["dubai",             { countryCode: "ae", display: "Dubai, UAE" }],
  ["cairo",             { countryCode: "eg", display: "Cairo, Egypt" }],
  ["accra",             { countryCode: "gh", display: "Accra, Ghana" }],
  ["lagos",             { countryCode: "ng", display: "Lagos, Nigeria" }],
  ["abuja",             { countryCode: "ng", display: "Abuja, Nigeria" }],
  ["dakar",             { countryCode: "sn", display: "Dakar, Senegal" }],
  ["durban",            { countryCode: "za", display: "Durban, South Africa" }],
  ["sydney",            { countryCode: "au", display: "Sydney, Australia" }],
  ["brisbane",          { countryCode: "au", display: "Brisbane, Australia" }],
  ["perth",             { countryCode: "au", display: "Perth, Australia" }],
  ["auckland",          { countryCode: "nz", display: "Auckland, New Zealand" }],
  ["mumbai",            { countryCode: "in", display: "Mumbai, India" }],
  ["delhi",             { countryCode: "in", display: "Delhi, India" }],
  ["chennai",           { countryCode: "in", display: "Chennai, India" }],
  ["kolkata",           { countryCode: "in", display: "Kolkata, India" }],
  ["pune",              { countryCode: "in", display: "Pune, India" }],
  ["manila",            { countryCode: "ph", display: "Manila, Philippines" }],
  ["bangkok",           { countryCode: "th", display: "Bangkok, Thailand" }],
  ["hanoi",             { countryCode: "vn", display: "Hanoi, Vietnam" }],
  ["seoul",             { countryCode: "kr", display: "Seoul, South Korea" }],
  ["osaka",             { countryCode: "jp", display: "Osaka, Japan" }],
  ["tokyo",             { countryCode: "jp", display: "Tokyo, Japan" }],
  ["karachi",           { countryCode: "pk", display: "Karachi, Pakistan" }],
  ["lahore",            { countryCode: "pk", display: "Lahore, Pakistan" }],
  ["dhaka",             { countryCode: "bd", display: "Dhaka, Bangladesh" }],
  ["ankara",            { countryCode: "tr", display: "Ankara, Turkey" }],
  ["vancouver",         { countryCode: "ca", display: "Vancouver, Canada" }],
  ["calgary",           { countryCode: "ca", display: "Calgary, Canada" }],
  ["santiago",          { countryCode: "cl", display: "Santiago, Chile" }],
  ["lima",              { countryCode: "pe", display: "Lima, Peru" }],
  ["manchester",        { countryCode: "gb", display: "Manchester, United Kingdom" }],
  ["edinburgh",         { countryCode: "gb", display: "Edinburgh, United Kingdom" }],
  ["birmingham",        { countryCode: "gb", display: "Birmingham, United Kingdom" }],
  // Short uppercase-only aliases handled separately below
];

/**
 * Scans the user's typed query for an explicit location mention (city or country).
 * GDPR-safe: reads only the text the user deliberately typed, never stored.
 * Returns null when no location is detected.
 */
export function extractLocationFromQuery(text: string): LocationHint | null {
  // Short uppercase-only abbreviations — checked against original text to avoid
  // matching "us" in "tell us" or "show us".
  const upperAliases: Array<[RegExp, string, string]> = [
    [/\bUS\b/, "us", "United States"],
    [/\bUK\b/, "gb", "United Kingdom"],
    [/\bNZ\b/, "nz", "New Zealand"],
    [/\bNYC\b/, "us", "New York, USA"],
    [/\bSF\b/, "us", "San Francisco, USA"],
    [/\bLA\b(?!\s*\w)/, "us", "Los Angeles, USA"], // "LA" but not "LATAM"
  ];
  for (const [pattern, code, display] of upperAliases) {
    if (pattern.test(text)) return { text: display, countryCode: code };
  }

  const lower = text.toLowerCase();

  // City map is already ordered longest-first for greedy matching
  for (const [city, entry] of CITY_MAP) {
    const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(lower)) {
      return { text: entry.display, countryCode: entry.countryCode };
    }
  }

  // Country map is ordered longest-first
  for (const [name, code, display] of COUNTRY_MAP) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(lower)) {
      return { text: display, countryCode: code };
    }
  }

  return null;
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
 *
 * Location precedence: explicit mention in query > defaultLocation (from IP tag) > none
 */
export async function runSearch(
  userMessage: string,
  env: { JSEARCH_API_KEY?: string; SERPER_API_KEY?: string; BRAVE_SEARCH_API_KEY?: string },
  signal?: AbortSignal,
  defaultLocation?: LocationHint,
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

  // Explicit location in query beats IP-derived default
  const location = extractLocationFromQuery(text) ?? defaultLocation;

  if (isJobQuery) {
    // Primary: JSearch
    const jKey = env.JSEARCH_API_KEY?.trim();
    if (jKey) {
      const hits = await jSearchJobSearch(query, jKey, signal, location);
      if (hits.length > 0) {
        return { block: formatJobSearchContext(hits, "jsearch"), type: "jobs" };
      }
    }

    // Fallback: Serper.dev
    const sKey = env.SERPER_API_KEY?.trim();
    if (sKey) {
      const hits = await serperJobSearch(query, sKey, signal, location);
      if (hits.length > 0) {
        return { block: formatJobSearchContext(hits, "serper"), type: "jobs" };
      }
    }

    return { block: "", type: "none" };
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
