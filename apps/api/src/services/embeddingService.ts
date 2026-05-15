const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';
const OLLAMA_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

export async function embedText(text: string): Promise<number[]> {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: OLLAMA_MODEL, prompt: text }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Ollama embed failed (${res.status}): ${body}`);
    }
    const data = await res.json() as { embedding: number[] };
    return data.embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
        results.push(await embedText(text));
    }
    return results;
}

export async function isEmbedderReady(): Promise<boolean> {
    try {
        const res = await fetch(`${OLLAMA_URL}/api/tags`);
        return res.ok;
    } catch {
        return false;
    }
}
