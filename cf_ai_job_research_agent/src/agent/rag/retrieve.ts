import { embedSingle } from "./embed";

const TOP_K = 5;
const MIN_SCORE = 0.65;

export interface RetrievedChunk {
  content: string;
  sourceType: string;
  company: string;
  jobTitle: string;
  score: number;
}

export async function retrieveContext(
  ai: Ai,
  vectorize: VectorizeIndex,
  db: D1Database,
  sessionId: string,
  query: string
): Promise<RetrievedChunk[]> {
  const queryVector = await embedSingle(ai, query);

  const results = await vectorize.query(queryVector, {
    topK: TOP_K,
    filter: { sessionId },
    returnMetadata: "all",
  });

  const above = results.matches.filter((m) => m.score >= MIN_SCORE);
  if (above.length === 0) return [];

  const ids = above.map((m) => `'${m.id}'`).join(",");
  const rows = await db
    .prepare(`SELECT id, content, source_type, company, job_title FROM document_chunks WHERE id IN (${ids})`)
    .all<{ id: string; content: string; source_type: string; company: string; job_title: string }>();

  const scoreMap = new Map(above.map((m) => [m.id, m.score]));

  return (rows.results ?? [])
    .map((r) => ({
      content: r.content,
      sourceType: r.source_type,
      company: r.company,
      jobTitle: r.job_title,
      score: scoreMap.get(r.id) ?? 0,
    }))
    .sort((a, b) => b.score - a.score);
}

export function formatContextBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";

  const lines = chunks.map((c) => {
    const label =
      c.sourceType === "job_description"
        ? `Job Description${c.company ? ` — ${c.company}` : ""}${c.jobTitle ? `, ${c.jobTitle}` : ""}`
        : c.sourceType === "resume"
          ? "Resume"
          : c.sourceType === "web_search"
            ? "Web Search"
            : `Company Info${c.company ? ` — ${c.company}` : ""}`;
    const pct = Math.round(c.score * 100);
    return `[Source: ${label} | Relevance: ${pct}%]\n"${c.content}"`;
  });

  return `KNOWLEDGE BASE CONTEXT:\n${lines.join("\n\n")}\n\nCite source types when relevant. Do not invent facts not present above.`;
}
