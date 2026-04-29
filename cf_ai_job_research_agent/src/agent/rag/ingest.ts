import { chunkText } from "./chunk";
import { embedText } from "./embed";

export type SourceType = "job_description" | "resume" | "web_search" | "company_info";

export interface IngestOptions {
  ai: Ai;
  vectorize: VectorizeIndex;
  db: D1Database;
  sessionId: string;
  sourceType: SourceType;
  content: string;
  title?: string;
  url?: string;
  company?: string;
  jobTitle?: string;
}

export async function ingestDocument(opts: IngestOptions): Promise<string> {
  const { ai, vectorize, db, sessionId, sourceType, content, title, url, company, jobTitle } = opts;

  const chunks = chunkText(content);
  if (chunks.length === 0) return "";

  const parentDocId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      "INSERT INTO documents (id, session_id, source_type, title, url, created_at, chunk_count) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(parentDocId, sessionId, sourceType, title ?? null, url ?? null, now, chunks.length)
    .run();

  const embeddings = await embedText(ai, chunks);

  const chunkRows: { id: string; content: string; index: number }[] = [];
  const vectors: VectorizeVector[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkId = crypto.randomUUID();
    chunkRows.push({ id: chunkId, content: chunks[i], index: i });
    vectors.push({
      id: chunkId,
      values: embeddings[i],
      metadata: { sessionId, sourceType, parentDocId, company: company ?? "", jobTitle: jobTitle ?? "" },
    });
  }

  const insertChunk = db.prepare(
    "INSERT INTO document_chunks (id, session_id, source_type, company, job_title, content, chunk_index, parent_doc_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );

  await db.batch(
    chunkRows.map((r) =>
      insertChunk.bind(
        r.id,
        sessionId,
        sourceType,
        company ?? null,
        jobTitle ?? null,
        r.content,
        r.index,
        parentDocId,
        now
      )
    )
  );

  await vectorize.upsert(vectors);

  return parentDocId;
}
