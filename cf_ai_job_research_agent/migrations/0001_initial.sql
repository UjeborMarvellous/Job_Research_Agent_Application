CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL,
  source_type  TEXT NOT NULL,
  title        TEXT,
  url          TEXT,
  created_at   TEXT NOT NULL,
  chunk_count  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  source_type   TEXT NOT NULL,
  company       TEXT,
  job_title     TEXT,
  content       TEXT NOT NULL,
  chunk_index   INTEGER NOT NULL,
  parent_doc_id TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_session ON document_chunks(session_id);
CREATE INDEX IF NOT EXISTS idx_chunks_parent  ON document_chunks(parent_doc_id);
CREATE INDEX IF NOT EXISTS idx_docs_session   ON documents(session_id);
