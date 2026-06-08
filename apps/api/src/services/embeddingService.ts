const EMBED_MODEL = process.env.GOOGLE_EMBEDDING_MODEL || 'gemini-embedding-001';
const EMBED_DIMENSIONS = 768;
const EMBED_TIMEOUT_MS = 8000;
const GOOGLE_EMBEDDING_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

type GoogleEmbeddingTask =
    | 'RETRIEVAL_QUERY'
    | 'RETRIEVAL_DOCUMENT'
    | 'SEMANTIC_SIMILARITY'
    | 'CLASSIFICATION'
    | 'CLUSTERING'
    | 'QUESTION_ANSWERING'
    | 'FACT_VERIFICATION'
    | 'CODE_RETRIEVAL_QUERY';

export type EmbeddingVector = number[];

function getGoogleApiKey(): string {
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

/**
 * Generate a 768-dimension embedding for a given text string.
 * Returns null on failure — never throws, so callers can treat it as non-blocking.
 */
export async function generateEmbedding(
    text: string,
    taskType: GoogleEmbeddingTask = 'RETRIEVAL_QUERY',
): Promise<EmbeddingVector | null> {
    const input = text.trim();
    if (!input) return null;

    const apiKey = getGoogleApiKey();
    if (!apiKey) {
        console.warn('[embeddingService] GOOGLE_API_KEY or GEMINI_API_KEY is not configured');
        return null;
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

        const response = await fetch(`${GOOGLE_EMBEDDING_ENDPOINT}/${EMBED_MODEL}:embedContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
                content: { parts: [{ text: input }] },
                taskType,
                outputDimensionality: EMBED_DIMENSIONS,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            console.warn(`[embeddingService] Google embedding HTTP ${response.status}: ${detail.slice(0, 240)}`);
            return null;
        }

        const data = await response.json() as { embedding?: { values?: number[] } };
        const embedding = data.embedding?.values;
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
    return generateEmbedding(fingerprint, 'RETRIEVAL_DOCUMENT');
}

/**
 * Health check — returns true if Google embeddings are configured and reachable.
 */
export async function checkEmbeddingHealth(): Promise<{ ok: boolean; model: string; dimensions: number; error?: string }> {
    if (!getGoogleApiKey()) {
        return { ok: false, model: EMBED_MODEL, dimensions: EMBED_DIMENSIONS, error: 'GOOGLE_API_KEY or GEMINI_API_KEY is not configured' };
    }

    try {
        const embedding = await generateEmbedding('health', 'SEMANTIC_SIMILARITY');
        return {
            ok: Boolean(embedding),
            model: EMBED_MODEL,
            dimensions: EMBED_DIMENSIONS,
            error: embedding ? undefined : 'Google embedding probe failed',
        };
    } catch (error) {
        return {
            ok: false,
            model: EMBED_MODEL,
            dimensions: EMBED_DIMENSIONS,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
