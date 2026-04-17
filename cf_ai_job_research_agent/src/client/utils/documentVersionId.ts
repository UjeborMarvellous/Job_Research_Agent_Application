/**
 * Deterministic id for a document snapshot (SHA-256 of UTF-8 content).
 * Identical content yields the same id so redundant versions collapse.
 */
export async function computeDocumentVersionId(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `doc_${hex}`;
}
