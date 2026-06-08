const EMBED_MODEL = process.env.DOUBLEWORD_EMBEDDING_MODEL || 'Qwen/Qwen3-Embedding-8B';
const EMBED_DIMENSIONS = Number(process.env.DOUBLEWORD_EMBEDDING_DIMENSIONS || '768');
const EMBED_TIMEOUT_MS = 8000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const DOUBLEWORD_BASE_URL = (process.env.DOUBLEWORD_BASE_URL || 'https://api.doubleword.ai/v1').replace(/\/+$/, '');
let rateLimitedUntil = 0;

export type EmbeddingVector = number[];

function getDoublewordApiKeys(): string[] {
    return [process.env.DOUBLEWORD_EMBEDDING_API_KEY, process.env.DOUBLEWORD_API_KEY]
        .filter(Boolean)
        .flatMap((value) => String(value).split(/[\n,;]+/))
        .map((value) => value.trim())
        .filter(Boolean);
}

/**
 * Generate a 768-dimension embedding for a given text string.
 * Returns null on failure — never throws, so callers can treat it as non-blocking.
 */
export async function generateEmbedding(text: string): Promise<EmbeddingVector | null> {
    const input = text.trim();
    if (!input) return null;

    const apiKeys = getDoublewordApiKeys();
    if (!apiKeys.length) {
        console.warn('[embeddingService] DOUBLEWORD_EMBEDDING_API_KEY or DOUBLEWORD_API_KEY is not configured');
        return null;
    }
    if (Date.now() < rateLimitedUntil) {
        console.warn('[embeddingService] Doubleword embedding requests are paused after rate limiting');
        return null;
    }

    let sawRateLimit = false;
    for (const apiKey of apiKeys) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

            const response = await fetch(`${DOUBLEWORD_BASE_URL}/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: EMBED_MODEL,
                    input,
                    dimensions: EMBED_DIMENSIONS,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const detail = await response.text().catch(() => '');
                console.warn(`[embeddingService] Doubleword embedding HTTP ${response.status}: ${detail.slice(0, 240)}`);
                if (response.status === 429) {
                    sawRateLimit = true;
                    continue;
                }
                return null;
            }

            const data = await response.json() as { data?: Array<{ embedding?: number[] }> };
            const embedding = data.data?.[0]?.embedding;
            if (!Array.isArray(embedding) || embedding.length === 0) {
                console.warn('[embeddingService] Empty or missing embedding in response');
                return null;
            }
            if (embedding.length !== EMBED_DIMENSIONS) {
                console.warn(`[embeddingService] Expected ${EMBED_DIMENSIONS} dimensions, received ${embedding.length}`);
                return null;
            }

            return embedding;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.warn('[embeddingService] Embedding request timed out');
            } else {
                console.warn('[embeddingService] Failed to generate embedding:', error);
            }
            return null;
        }
    }
    if (sawRateLimit) rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    return null;
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
 * Health check — returns true if Doubleword embeddings are configured.
 * Do not call the embedding API here; health probes should not consume quota.
 */
export async function checkEmbeddingHealth(): Promise<{ ok: boolean; model: string; dimensions: number; error?: string }> {
    if (!getDoublewordApiKeys().length) {
        return { ok: false, model: EMBED_MODEL, dimensions: EMBED_DIMENSIONS, error: 'DOUBLEWORD_EMBEDDING_API_KEY or DOUBLEWORD_API_KEY is not configured' };
    }
    return { ok: true, model: EMBED_MODEL, dimensions: EMBED_DIMENSIONS };
}
