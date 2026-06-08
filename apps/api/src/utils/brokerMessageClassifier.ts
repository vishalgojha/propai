export type BrokerMessageIntent = 'listing' | 'requirement' | 'ignore' | 'unknown';

export type BrokerMessageClassification = {
    intent: BrokerMessageIntent;
    hasPrice: boolean;
    shouldParse: boolean;
    confidence: 'high' | 'medium' | 'low';
    normalizedText: string;
    reasons: string[];
};

const REQUIREMENT_PATTERNS = [
    /\brequirement\b/i,
    /\brequired\b/i,
    /\blooking for\b/i,
    /\bneed(?:ed)?\b/i,
    /\bwanted\b/i,
    /\bclient (?:wants|needs|required|requirement)\b/i,
    /\bbuyer (?:wants|needs|required|requirement)\b/i,
    /\btenant (?:wants|needs|required|requirement)\b/i,
    /\bonly direct listings please\b/i,
    /\btoken ready\b/i,
];

const LISTING_PATTERNS = [
    /\bavailable\b/i,
    /\bfor sale\b/i,
    /\bfor rent\b/i,
    /\bon rent\b/i,
    /\blease\b/i,
    /\boutright\b/i,
    /\bpre[- ]?leased\b/i,
    /\bpossession\b/i,
    /\binspection\b/i,
    /\bkeys? (?:available|with us)\b/i,
];

const PROPERTY_PATTERNS = [
    /\b\d+\s*bhk\b/i,
    /\b1\s*rk\b/i,
    /\boffice\b/i,
    /\boffice space\b/i,
    /\bshowroom\b/i,
    /\bshop\b/i,
    /\bcommercial\b/i,
    /\bresidential\b/i,
    /\bflat\b/i,
    /\bapartment\b/i,
    /\brow house\b/i,
    /\bbungalow\b/i,
    /\bplot\b/i,
    /\bwarehouse\b/i,
    /\bcarpet\b/i,
    /\bbua\b/i,
    /\bsq\.?\s*ft\b/i,
    /\bsqufit\b/i,
];

const PRICE_PATTERNS = [
    /(?:^|[\s:])(?:rs\.?|inr|rate|quote|asking|budget|rent|deposit)\s*[:\-]?\s*[0-9.,]+/i,
    /(?:^|[\s:])[0-9]+(?:\.[0-9]+)?\s*(?:cr|crore|crores|l|lac|lacs|lakh|lakhs)\b/i,
    /(?:^|[\s:])₹\s*[0-9.,]+/i,
    /(?:^|[\s:])[0-9]+(?:\.[0-9]+)?\s*(?:k|lac|lakh|cr)\s*(?:nego|negotiable)?\b/i,
    /\b(?:budget|rent|deposit)\s*[:\-]?\s*(?:₹\s*)?[0-9.,]+/i,
];

const IGNORE_PATTERNS = [
    /^messages and calls are end-to-end encrypted/i,
    /joined from the community/i,
    /created group/i,
    /^<media omitted>$/i,
    /turned off disappearing messages/i,
    /^you were added$/i,
];

const LOW_SIGNAL_BROKER_PATTERNS = [
    /\+\s*1\s*broker\b/i,
    /\bplus\s*1(?:\s*broker)?\b/i,
    /\bwith me\b/i,
    /\bindirect inventory\b/i,
    /\bvia broker\b/i,
    /\bthrough broker\b/i,
    /\bbroker relay\b/i,
    /\bshared by broker\b/i,
];

export function normalizeBrokerMessageText(text: string): string {
    return String(text || '')
        .replace(/\u202f/g, ' ')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function classifyBrokerMessage(text: string): BrokerMessageClassification {
    const normalizedText = normalizeBrokerMessageText(text);
    const lower = normalizedText.toLowerCase();
    const reasons: string[] = [];

    if (!normalizedText) {
        return {
            intent: 'ignore',
            hasPrice: false,
            shouldParse: false,
            confidence: 'high',
            normalizedText,
            reasons: ['empty_message'],
        };
    }

    if (IGNORE_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
        return {
            intent: 'ignore',
            hasPrice: false,
            shouldParse: false,
            confidence: 'high',
            normalizedText,
            reasons: ['system_or_media_noise'],
        };
    }

    const hasRequirementCue = REQUIREMENT_PATTERNS.some((pattern) => pattern.test(normalizedText));
    const hasListingCue = LISTING_PATTERNS.some((pattern) => pattern.test(normalizedText));
    const hasPropertyCue = PROPERTY_PATTERNS.some((pattern) => pattern.test(normalizedText));
    const hasPrice = PRICE_PATTERNS.some((pattern) => pattern.test(normalizedText));
    const hasLowSignalBrokerCue = LOW_SIGNAL_BROKER_PATTERNS.some((pattern) => pattern.test(normalizedText));

    if (hasRequirementCue) reasons.push('requirement_cue');
    if (hasListingCue) reasons.push('listing_cue');
    if (hasPropertyCue) reasons.push('property_cue');
    if (hasPrice) reasons.push('price_cue');
    if (hasLowSignalBrokerCue) reasons.push('broker_relay_cue');

    if (hasRequirementCue && !hasListingCue) {
        return {
            intent: 'requirement',
            hasPrice,
            shouldParse: true,
            confidence: hasLowSignalBrokerCue ? 'low' : hasPropertyCue || hasPrice ? 'high' : 'medium',
            normalizedText,
            reasons,
        };
    }

    if (hasListingCue && (hasPropertyCue || hasPrice)) {
        return {
            intent: 'listing',
            hasPrice,
            shouldParse: hasPrice,
            confidence: hasLowSignalBrokerCue ? 'low' : hasPrice ? 'high' : 'medium',
            normalizedText,
            reasons: hasPrice ? reasons : [...reasons, 'listing_missing_price'],
        };
    }

    if (hasPropertyCue && hasPrice) {
        return {
            intent: 'listing',
            hasPrice: true,
            shouldParse: true,
            confidence: hasLowSignalBrokerCue ? 'low' : 'medium',
            normalizedText,
            reasons,
        };
    }

    if (/\b(?:good morning|good evening|happy birthday|happy anniversary|youtube|youtu\.be|arsenal|meme)\b/i.test(lower)) {
        return {
            intent: 'ignore',
            hasPrice: false,
            shouldParse: false,
            confidence: 'high',
            normalizedText,
            reasons: ['non_property_chatter'],
        };
    }

    return {
        intent: 'unknown',
        hasPrice,
        shouldParse: false,
        confidence: hasLowSignalBrokerCue || hasPropertyCue || hasPrice ? 'low' : 'medium',
        normalizedText,
        reasons: reasons.length ? reasons : ['no_strong_cues'],
    };
}
