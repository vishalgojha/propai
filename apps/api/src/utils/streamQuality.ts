import crypto from 'crypto';

export type StreamCompletenessInput = {
    locality?: string | null;
    bhk?: string | number | null;
    sqft?: number | null;
    priceNumeric?: number | null;
    brokerContactValid?: boolean;
};

export function buildStreamContentHash(rawText?: string | null, sourcePhone?: string | null) {
    return crypto
        .createHash('md5')
        .update(`${String(rawText || '').trim()}::${String(sourcePhone || '').trim()}`)
        .digest('hex');
}

export function computeStreamCompleteness(input: StreamCompletenessInput) {
    const locality = String(input.locality || '').trim();
    const hasLocality = Boolean(locality) && !/^unknown$/i.test(locality);
    const hasBhk = Boolean(String(input.bhk || '').trim()) && String(input.bhk || '').trim() !== 'N/A';
    const hasSqft = typeof input.sqft === 'number' && Number.isFinite(input.sqft) && input.sqft > 0;
    const hasPrice = typeof input.priceNumeric === 'number' && Number.isFinite(input.priceNumeric) && input.priceNumeric > 0;
    const brokerContactValid = input.brokerContactValid !== false;

    const completenessScore = [
        hasLocality,
        hasBhk,
        hasSqft,
        hasPrice,
        brokerContactValid,
    ].reduce((score, isPresent) => score + (isPresent ? 1 : 0), 0);

    return {
        completeness_score: completenessScore,
        is_complete: hasLocality && hasBhk && hasPrice && brokerContactValid && completenessScore >= 4,
    };
}
