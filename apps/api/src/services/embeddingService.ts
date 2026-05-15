let _pipe: any = null;
let _ready = false;
let _error: string | null = null;

async function getPipe(): Promise<any> {
    if (_pipe) return _pipe;
    if (_error) throw new Error(_error);
    try {
        const { pipeline } = await import('@xenova/transformers');
        _pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        _ready = true;
        return _pipe;
    } catch (e: any) {
        const msg = e?.message || String(e);
        _error = `Embedding model unavailable: ${msg}. Ensure glibc is available (use node:20-slim, not alpine).`;
        throw new Error(_error);
    }
}

export async function embedText(text: string): Promise<number[]> {
    const p = await getPipe();
    const result = await p(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
    const p = await getPipe();
    const results: number[][] = [];
    for (const text of texts) {
        const result = await p(text, { pooling: 'mean', normalize: true });
        results.push(Array.from(result.data));
    }
    return results;
}

export async function isEmbedderReady(): Promise<boolean> {
    try {
        await getPipe();
        return true;
    } catch {
        return false;
    }
}
