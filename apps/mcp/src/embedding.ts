const EMBED_MODEL = process.env.GOOGLE_EMBEDDING_MODEL || "gemini-embedding-001";
const EMBED_DIMENSIONS = 768;
const EMBED_TIMEOUT_MS = 8000;
const GOOGLE_EMBEDDING_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

function getGoogleApiKey(): string {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const input = String(text || "").trim();
  if (!input) {
    return null;
  }

  const apiKey = getGoogleApiKey();
  if (!apiKey) {
    console.warn("[mcp/embedding] GOOGLE_API_KEY or GEMINI_API_KEY is not configured");
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

    const response = await fetch(`${GOOGLE_EMBEDDING_ENDPOINT}/${EMBED_MODEL}:embedContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        content: { parts: [{ text: input }] },
        task_type: "RETRIEVAL_QUERY",
        output_dimensionality: EMBED_DIMENSIONS,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[mcp/embedding] Google embedding HTTP ${response.status}: ${detail.slice(0, 240)}`);
      return null;
    }

    const data = await response.json() as { embedding?: { values?: number[] } };
    const embedding = data.embedding?.values;
    if (!Array.isArray(embedding) || !embedding.length) {
      console.warn("[mcp/embedding] Empty or missing embedding in response");
      return null;
    }
    if (embedding.length !== EMBED_DIMENSIONS) {
      console.warn(`[mcp/embedding] Expected ${EMBED_DIMENSIONS} dimensions, received ${embedding.length}`);
      return null;
    }

    return embedding;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[mcp/embedding] Embedding request timed out");
    } else {
      console.warn("[mcp/embedding] Failed to generate embedding:", error);
    }
    return null;
  }
}
