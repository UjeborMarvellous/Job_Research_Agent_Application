// baai embedding model for text vectorization, used in RAG retrieval and other vector search tasks
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

export async function embedText(ai: Ai, texts: string[]): Promise<number[][]> {
  const response = await ai.run(EMBEDDING_MODEL, { text: texts });
  return (response as { data: number[][] }).data;
}

export async function embedSingle(ai: Ai, text: string): Promise<number[]> {
  const vectors = await embedText(ai, [text]);
  return vectors[0];
}
