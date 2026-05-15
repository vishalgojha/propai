const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "nomic-embed-text";

export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      prompt: text,
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama embedding failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json() as { embedding: number[] };
  return data.embedding;
}
