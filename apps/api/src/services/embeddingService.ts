import { pipeline } from '@xenova/transformers';

type FeatureExtractionPipeline = any;
let _pipe: FeatureExtractionPipeline | null = null;

async function getPipe(): Promise<FeatureExtractionPipeline> {
    if (!_pipe) {
        _pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    return _pipe;
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
