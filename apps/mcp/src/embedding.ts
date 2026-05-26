const EMBED_BASE_URL = process.env.HETZNER_EMBED_URL || "http://116.202.9.89:11434";
const EMBED_MODEL = process.env.EMBED_MODEL || "nomic-embed-text";
const EMBED_TIMEOUT_MS = 8000;

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const input = String(text || "").trim();
  if (!input) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

    const response = await fetch(`${EMBED_BASE_URL}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: input }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[mcp/embedding] HTTP ${response.status} from Ollama`);
      return null;
    }

    const data = await response.json() as { embedding?: number[] };
    if (!Array.isArray(data.embedding) || !data.embedding.length) {
      console.warn("[mcp/embedding] Empty or missing embedding in response");
      return null;
    }

    return data.embedding;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[mcp/embedding] Embedding request timed out");
    } else {
      console.warn("[mcp/embedding] Failed to generate embedding:", error);
    }
    return null;
  }
}
