/**
 * embeddingService.ts
 * Generates vector embeddings via nomic-embed-text running on Hetzner/Ollama.
 * Endpoint: http://116.202.9.89:11434 (set via HETZNER_EMBED_URL env var)
 * Model: nomic-embed-text (768 dimensions)
 */

const EMBED_BASE_URL = process.env.HETZNER_EMBED_URL || 'http://116.202.9.89:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';
const EMBED_TIMEOUT_MS = 8000;

export type EmbeddingVector = number[];

/**
 * Generate a 768-dimension embedding for a given text string.
 * Returns null on failure — never throws, so callers can treat it as non-blocking.
 */
export async function generateEmbedding(text: string): Promise<EmbeddingVector | null> {
    const input = text.trim();
    if (!input) return null;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

        const response = await fetch(`${EMBED_BASE_URL}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: EMBED_MODEL, prompt: input }),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
            console.warn(`[embeddingService] HTTP ${response.status} from Ollama`);
            return null;
        }

        const data = await response.json() as { embedding?: number[] };
        if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
            console.warn('[embeddingService] Empty or missing embedding in response');
            return null;
        }

        return data.embedding;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.warn('[embeddingService] Embedding request timed out');
        } else {
            console.warn('[embeddingService] Failed to generate embedding:', error);
        }
        return null;
    }
}

/**
 * Build the semantic fingerprint text for a stream item.
 * Mirrors the fingerprintFor() logic in canonicalizationService.
 * This is what gets embedded — keep it consistent with that function.
 */
export function buildFingerprintText(fields: {
    record_type?: string | null;
    deal_type?: string | null;
    asset_class?: string | null;
    property_category?: string | null;
    building_name?: string | null;
    micro_location?: string | null;
    locality?: string | null;
    city?: string | null;
    bhk?: string | null;
    price_label?: string | null;
    area_sqft?: number | null;
    furnishing?: string | null;
    property_use?: string | null;
}): string {
    return [
        fields.record_type,
        fields.deal_type,
        fields.asset_class,
        fields.property_category,
        fields.building_name,
        fields.micro_location,
        fields.locality,
        fields.city,
        fields.bhk,
        fields.price_label,
        fields.area_sqft,
        fields.furnishing,
        fields.property_use,
    ]
        .map((p) => String(p || '').trim().toLowerCase())
        .filter(Boolean)
        .join(' | ');
}

/**
 * Generate embedding for a stream item and return the vector.
 * Pass the same fields used in canonicalizationService.fingerprintFor().
 */
export async function embedStreamItem(fields: Parameters<typeof buildFingerprintText>[0]): Promise<EmbeddingVector | null> {
    const fingerprint = buildFingerprintText(fields);
    if (!fingerprint) return null;
    return generateEmbedding(fingerprint);
}

/**
 * Health check — returns true if Ollama is reachable and the model is loaded.
 */
export async function checkEmbeddingHealth(): Promise<{ ok: boolean; model: string; url: string; error?: string }> {
    try {
        const response = await fetch(`${EMBED_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
        if (!response.ok) {
            return { ok: false, model: EMBED_MODEL, url: EMBED_BASE_URL, error: `HTTP ${response.status}` };
        }
        const data = await response.json() as { models?: Array<{ name: string }> };
        const loaded = (data.models || []).some((m) => m.name.startsWith(EMBED_MODEL));
        return {
            ok: loaded,
            model: EMBED_MODEL,
            url: EMBED_BASE_URL,
            error: loaded ? undefined : `Model ${EMBED_MODEL} not found in Ollama`,
        };
    } catch (error) {
        return {
            ok: false,
            model: EMBED_MODEL,
            url: EMBED_BASE_URL,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
