import { createSupabaseAnonClient, supabase, supabaseAdmin } from '../config/supabase';
import { parsePrice, splitMultiListing } from '@propai/price-parser';
import { aiService } from './aiService';
import { canonicalizationService } from './canonicalizationService';
import { igrQueryService, type IgrTransactionPreview } from './igrQueryService';
import { extractIndianCity, extractIndianLocality, parseIndianLocation } from '../utils/locationParser';
import { normaliseIndianPhone } from '../utils/phoneUtils';
import { buildStreamContentHash, computeStreamCompleteness } from '../utils/streamQuality';
import { getWorkspaceSettingsRecord } from './workspaceSettingsService';
import { emailNotificationService } from './emailNotificationService';
import { cleanNumber } from '../utils/number';


type ChannelType = 'listing' | 'requirement' | 'mixed';
type StreamType = 'Rent' | 'Sale' | 'Requirement' | 'Pre-leased' | 'Lease';
type StreamConfidenceBand = 'low' | 'medium' | 'high';
type StreamTimeBand = '1h' | '4h' | '1d' | '7d';
type StreamFreshnessBand = '1h' | '6h';

export type StreamListFilters = {
    search?: string | null;
    types?: StreamType[];
    category?: 'residential' | 'commercial' | null;
    locality?: string | null;
    bhk?: string | null;
    minConfidence?: number | null;
    confidenceBands?: StreamConfidenceBand[];
    timeBands?: StreamTimeBand[];
    freshnessBands?: StreamFreshnessBand[];
    source?: string | null;
    brokerOnly?: boolean;
};

type ChannelRow = {
    id: string;
    tenant_id: string;
    name: string;
    slug: string;
    channel_type: ChannelType;
    localities: string[];
    keywords_include: string[];
    keywords_exclude: string[];
    deal_types: string[];
    record_types: string[];
    bhk_values: string[];
    asset_classes: string[];
    budget_min: number | null;
    budget_max: number | null;
    confidence_min: number;
    pinned: boolean;
    is_active: boolean;
    created_at: string;
    updated_at: string;
};

export type PersonalChannelRecord = {
    id: string;
    name: string;
    slug: string;
    channelType: ChannelType;
    localities: string[];
    keywords: string[];
    keywordsExclude: string[];
    dealTypes: string[];
    recordTypes: string[];
    bhkValues: string[];
    assetClasses: string[];
    budgetMin: number | null;
    budgetMax: number | null;
    confidenceMin: number;
    pinned: boolean;
    createdAt: string;
    updatedAt: string;
    unreadCount: number;
    itemCount: number;
};

export type StreamItemRecord = {
    id: string;
    type: StreamType;
    title?: string;
    location: string;
    buildingName?: string | null;
    microLocation?: string | null;
    city?: string;
    price: string;
    priceNumeric?: number | null;
    bhk: string;
    propertyCategory?: 'residential' | 'commercial';
    areaSqft?: number | null;
    furnishing?: string | null;
    floorNumber?: string | null;
    totalFloors?: string | null;
    propertyUse?: string | null;
    posted: string;
    rawText?: string;
    source: string;
    sourcePhone?: string | null;
    brokerName?: string | null;
    brokerCompany?: string | null;
    waLink?: string | null;
    isNetworkItem?: boolean;
    confidence: number;
    description: string;
    createdAt: string;
    recordType: string;
    dealType: string;
    assetClass: string;
    parseNotes?: string | null;
    isCorrected?: boolean;
    isRead?: boolean;
    igrTransactions?: IgrTransactionPreview[];
};

export type InboxMatchRecord = {
    id: string;
    sourceItem: StreamItemRecord;
    matchedItem: StreamItemRecord;
    matchScore: number;
    matchReasons: string[];
    isRead: boolean;
    createdAt: string;
};

export type CreateChannelInput = {
    name?: string;
    channelType?: ChannelType;
    localities?: string[];
    keywords?: string[];
    keywordsExclude?: string[];
    dealTypes?: string[];
    recordTypes?: string[];
    bhkValues?: string[];
    assetClasses?: string[];
    budgetMin?: number | null;
    budgetMax?: number | null;
    confidenceMin?: number | null;
    pinned?: boolean;
    createdBy?: string | null;
};

const normalize = (value: string) => {
    const lower = String(value || '').toLowerCase();
    let result = '';
    for (const c of lower) {
        if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
            result += c;
        } else {
            if (result.length > 0 && !result.endsWith(' ')) {
                result += ' ';
            }
        }
    }
    return result.trim();
};

function escapePostgrestPattern(value: string) {
    return String(value || '').replace(/,/g, ' ').replace(/[%_]/g, (match) => `\\${match}`);
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function parseSearchBhk(value?: string | null) {
    const match = String(value || '').match(/\b([1-9])\s*(?:\+)?\s*(?:bhk|bed|beds|bedroom|br)\b/i);
    return match?.[1] ? `${match[1]} BHK` : null;
}

function searchMentionsPreLeased(value?: string | null) {
    return /\bpre\s*-?\s*leased\b|\bpreleased\b/i.test(String(value || ''));
}

function searchMentionsRequirement(value?: string | null) {
    return /\b(requirement|requirements|wanted|need|buyer|tenant)\b/i.test(String(value || ''));
}

function searchMentionsRent(value?: string | null) {
    return /\b(rent|rental)\b/i.test(String(value || ''));
}

function searchMentionsLease(value?: string | null) {
    return /\b(lease|l&l)\b/i.test(String(value || ''));
}

function searchMentionsSale(value?: string | null) {
    return /\b(sale|sell|resale|outright|buy)\b/i.test(String(value || ''));
}

function getLargestTimeWindow(
    timeBands?: StreamTimeBand[] | null,
    freshnessBands?: StreamFreshnessBand[] | null,
) {
    const selected = [
        ...(timeBands || []),
        ...(freshnessBands || []),
    ];
    const hours = selected.map((band) => {
        if (band === '1h') return 1;
        if (band === '4h') return 4;
        if (band === '6h') return 6;
        if (band === '1d') return 24;
        if (band === '7d') return 24 * 7;
        return 0;
    }).filter((value) => value > 0);

    if (hours.length === 0) {
        return null;
    }

    return new Date(Date.now() - Math.max(...hours) * 60 * 60 * 1000).toISOString();
}

function getConfidenceRange(filters?: StreamListFilters | null) {
    const bands = filters?.confidenceBands || [];
    let min = typeof filters?.minConfidence === 'number' && Number.isFinite(filters.minConfidence)
        ? filters.minConfidence
        : null;
    let max: number | null = null;

    if (bands.length > 0) {
        const ranges = bands.map((band) => {
            if (band === 'high') return { min: 70, max: 100 };
            if (band === 'medium') return { min: 40, max: 69.999 };
            return { min: 0, max: 39.999 };
        });
        min = Math.min(...ranges.map((range) => range.min), min ?? 100);
        max = Math.max(...ranges.map((range) => range.max));
    }

    return { min, max };
}

function buildSearchParts(filters?: StreamListFilters | null) {
    const rawSearch = String(filters?.search || '').trim();
    const parsedLocation = rawSearch ? parseIndianLocation(rawSearch) : null;
    const explicitBhk = String(filters?.bhk || '').trim();
    const searchBhk = parseSearchBhk(rawSearch);
    const searchTypes: StreamType[] = [];

    if (searchMentionsPreLeased(rawSearch)) searchTypes.push('Pre-leased');
    else if (searchMentionsRequirement(rawSearch)) searchTypes.push('Requirement');
    else if (searchMentionsLease(rawSearch)) searchTypes.push('Lease');
    else if (searchMentionsRent(rawSearch)) searchTypes.push('Rent');
    else if (searchMentionsSale(rawSearch)) searchTypes.push('Sale');

    const cleanedSearch = rawSearch
        .replace(/\b[1-9]\s*(?:\+)?\s*(?:bhk|bed|beds|bedroom|br)\b/ig, ' ')
        .replace(/\bpre\s*-?\s*leased\b|\bpreleased\b/ig, ' ')
        .replace(/\b(requirement|requirements|wanted|need|buyer|tenant|rent|rental|lease|l&l|sale|sell|resale|outright|buy)\b/ig, ' ')
        .replace(parsedLocation?.matchedAlias ? new RegExp(parsedLocation.matchedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig') : /$a/, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return {
        rawSearch,
        fullTextSearch: cleanedSearch || rawSearch,
        locality: String(filters?.locality || parsedLocation?.locality || '').trim(),
        bhk: explicitBhk || searchBhk || '',
        inferredTypes: searchTypes,
    };
}

const titleCase = (value: string) => {
    return value.split(' ').map(word => {
        if (word.length === 0) return word;
        return word[0].toUpperCase() + word.slice(1);
    }).join(' ');
};

function isMissingIngestionStatusError(message?: string | null) {
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('ingestion_status') && (
        normalized.includes('does not exist') ||
        normalized.includes('schema cache') ||
        normalized.includes('column')
    );
}

const escapeRegExp = (value: string) => {
    // Since we're removing regex usage, this function is no longer needed for regex
    // But keeping it for compatibility - just return the value as-is
    return value;
};

const slugify = (value: string) => {
    const normalized = normalize(value);
    const withDashes = normalized.split(' ').filter(Boolean).join('-');
    // Trim leading and trailing dashes
    let result = withDashes;
    while (result.startsWith('-')) result = result.slice(1);
    while (result.endsWith('-')) result = result.slice(0, -1);
    return result || 'channel';
};

const uniqueNormalized = (items: Array<string | null | undefined>) =>
    Array.from(new Set(items.map((item) => normalize(String(item || ''))).filter(Boolean)));

const coerceJsonArray = (value: unknown) =>
    Array.isArray(value)
        ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];

const normalizePhoneForWa = (value?: string | null) => {
    const digits = String(value || '').replace(/\D/g, '');
    return digits || null;
};

const generateWaLink = (item: any, brokerName: string | null, brokerPhone: string | null): string | null => {
    const phone = normalizePhoneForWa(brokerPhone);
    if (!phone) {
        return null;
    }

    const bhk = String(item.bhk || '').trim() || 'a property';
    const locality = String(item.locality || item.parsed_payload?.locality || '').trim() || 'the target locality';
    const building = String(
        item.parsed_payload?.building ||
        item.parsed_payload?.buildingName ||
        item.parsed_payload?.projectName ||
        ''
    ).trim();
    const assetType = String(
        item.parsed_payload?.propertyUse ||
        item.property_use ||
        item.asset_class ||
        item.property_category ||
        item.bhk ||
        'property'
    ).trim();
    const price = String(item.price_label || item.parsed_payload?.price || item.parsed_payload?.budget || '').trim() || 'the discussed budget';
    const greeting = `Hi ${brokerName || 'there'}, found you on propai live. `;
    const isRequirement = String(item.record_type || item.type || '').trim().toLowerCase() === 'requirement';
    const text = isRequirement
        ? `${greeting}Regarding your requirement for ${assetType} in ${locality}${price ? ` around ₹${price}` : ''}, I may have something relevant.`
        : `${greeting}Regarding your listing for ${bhk || assetType}${building ? ` at ${building}` : ''} in ${locality}${price ? ` at ₹${price}` : ''}, is it still available?`;

    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
};

function isMissingSchemaEntityError(message?: string | null) {
    const normalized = String(message || '').toLowerCase();
    return (
        normalized.includes(`could not find the table 'public.whatsapp_groups'`) ||
        normalized.includes('schema cache') ||
        normalized.includes('does not exist')
    );
}

function isInboxItemsSchemaError(error: { code?: string | null; message?: string | null } | string | null | undefined) {
    const code = typeof error === 'string' ? '' : String(error?.code || '').trim();
    const message = typeof error === 'string' ? error : String(error?.message || '');
    const normalized = message.toLowerCase();

    return code === '42P01'
        || code === '42P10'
        || (normalized.includes('inbox_items') && (
            normalized.includes('does not exist')
            || normalized.includes('schema cache')
            || normalized.includes('no unique or exclusion constraint matching the on conflict specification')
        ))
        || normalized.includes('there is no unique or exclusion constraint matching the on conflict specification');
}

const formatPostedTime = (value?: string | null) => {
    if (!value) return 'Just now';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Just now';

    const diffMs = Date.now() - parsed.getTime();
    const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d ago`;
};

const extractPhoneNumber = (value?: string | null) => {
    return normaliseIndianPhone(value);
};

const extractContactPhoneFromBody = (text: string) => {
    // Look for phone-like tokens and normalise only valid Indian mobiles.
    const words = text.split(/\s+/); // Simple split, not using regex patterns
    let lastPhone: string | null = null;

    for (const word of words) {
        const normalized = normaliseIndianPhone(word);
        if (normalized) {
            lastPhone = normalized;
            continue;
        }

        const digits = word.split('').filter((c) => c >= '0' && c <= '9').join('');
        if (digits.length === 10) {
            const candidate = normaliseIndianPhone(digits);
            if (candidate) {
                lastPhone = candidate;
            }
        }
    }

    return lastPhone;
};

const extractContactNameFromBody = (text: string) => {
    const lines = text
        .split('\n')
        .map((line) => line.replace('\r', ''))
        .map((line) => line.trim())
        .filter(Boolean);

    for (const line of lines.reverse()) {
        // Remove markdown formatting characters
        const cleaned = line.split('*').join(' ').split('_').join(' ').split('`').join(' ').split('~').join(' ').split(' ').filter(Boolean).join(' ').trim();
        if (!cleaned) {
            continue;
        }
        
        // Check if line contains 10 consecutive digits
        let has10Digits = false;
        let consecutiveDigits = 0;
        for (const c of cleaned) {
            if (c >= '0' && c <= '9') {
                consecutiveDigits++;
                if (consecutiveDigits >= 10) {
                    has10Digits = true;
                    break;
                }
            } else {
                consecutiveDigits = 0;
            }
        }
        if (!has10Digits) {
            continue;
        }

        // Try to extract name followed by phone number
        // Look for pattern: Name followed by phone number
        const words = cleaned.split(' ').filter(Boolean);
        for (let i = 0; i < words.length; i++) {
            // Check if this word could be a name (starts with letter)
            const word = words[i];
            if (word.length < 2) continue;
            const firstChar = word[0];
            if (!((firstChar >= 'A' && firstChar <= 'Z') || (firstChar >= 'a' && firstChar <= 'z'))) {
                continue;
            }
            
            // Check if there's a phone number after this name
            // Look for phone number in remaining words
            const remainingText = words.slice(i).join(' ');
            // Extract digits from remaining text
            const digits = remainingText.split('').filter(c => c >= '0' && c <= '9').join('');
            if (digits.length >= 10) {
                const last10 = digits.slice(-10);
                if (last10[0] >= '6' && last10[0] <= '9') {
                    // Found name followed by phone
                    const candidate = word;
                    // Check if candidate is not a keyword
                    const lowerCandidate = candidate.toLowerCase();
                    if (!['available', 'rental', 'sale', 'requirement', 'contact'].includes(lowerCandidate)) {
                        return candidate;
                    }
                }
            }
        }
    }

    return null;
};

export const normalizeFurnishing = (value?: string | null) => {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return null;
    if (text.includes('semi')) return 'semi-furnished';
    if (text.includes('unfurnished')) return 'unfurnished';
    if (text.includes('fully') || text === 'furnished') return 'fully-furnished';
    return null;
};

const extractAreaSqft = (text: string) => {
    const match = text.match(/(\d{2,5}(?:\.\d+)?)\s*(sqft|sq ft|carpet|builtup|built-up)\b/i);
    return match ? Number(match[1]) : null;
};

export const extractFloorNumber = (text: string) => {
    const match = text.match(/\b(\d{1,2}(?:st|nd|rd|th)?|\w+)\s*floor\b/i);
    return match?.[1] ? String(match[1]).trim() : null;
};

export const extractTotalFloors = (text: string) => {
    const match = text.match(/\b(?:out of|\/)\s*(\d{1,2})\s*floors?\b/i) || text.match(/\b(\d{1,2})\s*storey\b/i);
    return match?.[1] ? String(match[1]).trim() : null;
};

export const extractPropertyUse = (text: string) => {
    if (/showroom/i.test(text)) return 'showroom';
    if (/office/i.test(text)) return 'office';
    if (/shop|retail/i.test(text)) return 'retail';
    if (/warehouse|godown/i.test(text)) return 'warehouse';
    if (/industrial/i.test(text)) return 'industrial';
    if (/residential/i.test(text)) return 'residential';
    return null;
};

const inferType = (text: string): StreamType => {
    const normalized = text.toLowerCase();
    
    if (normalized.includes('pre leased') || normalized.includes('pre-leased') || 
        normalized.includes('yield') || normalized.includes('tenant in place')) {
        return 'Pre-leased';
    }
    
    const listingIndicators = [
        'floor', 'furnished', 'furnishing', 'condition', 'building ',
        'sqft', 'sq ft', 'carpet area', 'super area', 'built-up', 'possession',
        'balcony', 'parking', 'amenities', ' facing', 'road', 'wing', 'tower',
        'apartment', 'phase', 'project', 'society', 'complex', 'heights',
    ];
    const hasListingFeatures = listingIndicators.some(w => normalized.includes(w));
    
    const explicitRequirement = [
        'looking for', 'wanted', 'need ', 'require', 'searching',
        'client needs', 'buyer needs', 'tenant needs', 'requirement for',
        'client wants', 'tenant wants', 'buyer wants', 'requirement:',
        'looking to buy', 'looking to rent', 'urgently require',
    ];
    const isExplicitRequirement = explicitRequirement.some(w => normalized.includes(w));
    
    if (hasListingFeatures && !isExplicitRequirement) {
        if (normalized.includes('rent') || normalized.includes('lease') || 
            normalized.includes('leave and license') || normalized.includes('leave & license') ||
            normalized.includes('l&l') || normalized.includes(' ll') || normalized.endsWith(' ll')) {
            return 'Rent';
        }
        return 'Sale';
    }
    
    if (isExplicitRequirement) {
        return 'Requirement';
    }
    
    if (normalized.includes('rent') || normalized.includes('lease') || 
        normalized.includes('leave and license') || normalized.includes('leave & license') ||
        normalized.includes('l&l') || normalized.includes(' ll') || normalized.endsWith(' ll')) {
        return 'Rent';
    }
    
    return 'Sale';
};

const extractPrice = (text: string) => {
    // Find price patterns without regex
    const lower = text.toLowerCase();
    const words = text.split(/\s+/);
    
    // Price indicators
    const priceIndicators = ['rs', 'inr', '₹', 'cr', 'crore', 'l', 'lac', 'lakh', 'k'];
    
    for (let i = 0; i < words.length; i++) {
        const word = words[i].toLowerCase();
        
        // Check if word contains digits and a price unit
        let hasDigits = false;
        let hasUnit = false;
        let cleanWord = '';
        for (const c of word) {
            if (c >= '0' && c <= '9' || c === '.') {
                hasDigits = true;
                cleanWord += c;
            } else if (priceIndicators.includes(c)) {
                hasUnit = true;
            }
        }
        
        if (hasDigits && hasUnit) {
            return word;
        }
        
        // Check if current word is a number and next word is a unit
        if (hasDigits && i + 1 < words.length) {
            const nextWord = words[i + 1].toLowerCase();
            if (['cr', 'crore', 'l', 'lac', 'lakh', 'k'].includes(nextWord)) {
                return `${word} ${nextWord}`;
            }
        }
        
        // Check if previous word is a price indicator and current is a number
        if ((word === 'rs' || word === 'inr' || word === '₹') && i + 1 < words.length) {
            const nextWord = words[i + 1];
            if (nextWord.split('').some(c => c >= '0' && c <= '9')) {
                return `${word} ${nextWord}`;
            }
        }
    }
    
    return 'Unspecified';
};

const extractPriceNumeric = (text: string) => {
    // Find price patterns without regex
    const lower = text.toLowerCase();
    const words = text.split(/\s+/);
    
    for (let i = 0; i < words.length; i++) {
        const word = words[i].toLowerCase();
        
        // Check if word contains digits
        let hasDigits = false;
        let numericPart = '';
        for (const c of word) {
            if (c >= '0' && c <= '9' || c === '.') {
                hasDigits = true;
                numericPart += c;
            }
        }
        
        if (!hasDigits) continue;
        
        const amount = Number(numericPart);
        if (Number.isNaN(amount)) continue;
        
        // Check for unit in same word
        if (word.includes('cr') || word.includes('crore')) return amount * 10000000;
        if (word.includes('l') && (word.includes('lac') || word.includes('lakh'))) return amount * 100000;
        if (word === 'k' || word.includes('k')) return amount * 1000;
        
        // Check next word for unit
        if (i + 1 < words.length) {
            const nextWord = words[i + 1].toLowerCase();
            if (nextWord === 'cr' || nextWord === 'crore') return amount * 10000000;
            if (nextWord === 'l' || nextWord === 'lac' || nextWord === 'lakh') return amount * 100000;
            if (nextWord === 'k') return amount * 1000;
        }
    }
    
    return null;
};

// Removed PRICE_TOKEN_PATTERN regex - using string methods instead

export const extractPriceInfo = (text: string, dealTypeHint?: string) => {
    const chosen = parsePrice(text, dealTypeHint);
    return {
        label: chosen.label || 'Unspecified',
        numeric: chosen.numeric,
    };
};

const extractBhk = (text: string) => {
    // Extract BHK patterns without regex
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
        const word = words[i].toLowerCase();
        // Check for inline pattern like "2BHK", "3bhk", "1.5BHK"
        const inlineMatch = word.match(/^(\d+(?:\.\d+)?)(BHK|bhk)$/);
        if (inlineMatch) {
            return `${inlineMatch[1]} ${inlineMatch[2].toUpperCase()}`;
        }
        if (word.endsWith('bhk')) {
            // Check if there's a number before it
            if (i > 0) {
                const prev = words[i - 1];
                // Check if prev is a number (including decimal)
                let isNumber = true;
                for (const c of prev) {
                    if (!(c >= '0' && c <= '9') && c !== '.') {
                        isNumber = false;
                        break;
                    }
                }
                if (isNumber && prev.length > 0) {
                    let pattern = prev.toUpperCase();
                    // Check for + before the number
                    if (i > 1 && words[i - 2] === '+') {
                        pattern = '+' + pattern;
                    }
                    pattern = (pattern + ' ' + word.toUpperCase()).split(' ').filter(Boolean).join(' ');
                    return pattern;
                }
            }
        }
    }
    return 'N/A';
};

const extractBuildingName = (text: string) => {
    const lower = text.toLowerCase();
    
    // Check for "building name:", "bldg:", "building:", "project:" patterns
    const buildingKeywords = ['building name', 'building  name', 'bldg', 'building', 'project'];
    
    for (const keyword of buildingKeywords) {
        const idx = lower.indexOf(keyword);
        if (idx >= 0) {
            // Extract text after the keyword
            let start = idx + keyword.length;
            // Skip colon, dash, or space
            while (start < text.length && (text[start] === ':' || text[start] === '-' || text[start] === ' ')) {
                start++;
            }
            // Extract until end of line or common stop words
            let result = '';
            for (let i = start; i < text.length; i++) {
                if (text[i] === '\n' || text[i] === '\r') break;
                result += text[i];
            }
            result = result.trim();
            // Remove trailing keywords like "available", "for rent", etc.
            const stopWords = ['available', 'for rent', 'for sale', 'property details'];
            for (const stop of stopWords) {
                const stopIdx = result.toLowerCase().indexOf(stop);
                if (stopIdx >= 0) {
                    result = result.slice(0, stopIdx).trim();
                }
            }
            if (result.length >= 2) {
                return titleCase(result);
            }
        }
    }
    
    // Check for "in <name> tower/apartment/building" pattern
    const inIdx = lower.indexOf(' in ');
    if (inIdx >= 0) {
        const afterIn = text.slice(inIdx + 4).trim();
        const buildingTypes = ['tower', 'apartment', 'apartments', 'residency', 'residence', 'heights', 'height', 'enclave', 'plaza', 'bldg', 'building'];
        for (const type of buildingTypes) {
            const typeIdx = afterIn.toLowerCase().indexOf(type);
            if (typeIdx > 0) {
                let name = afterIn.slice(0, typeIdx).trim();
                if (name.length >= 2) {
                    return titleCase(name);
                }
            }
        }
    }
    
    return null;
};

const extractMicroLocation = (text: string) => {
    const lower = text.toLowerCase();
    
    // Check for "location:" pattern
    const locationKeywords = ['location', 'loc', 'area'];
    for (const kw of locationKeywords) {
        const idx = lower.indexOf(kw);
        if (idx >= 0) {
            let start = idx + kw.length;
            // Skip colon, dash, space
            while (start < text.length && (text[start] === ':' || text[start] === '-' || text[start] === ' ')) {
                start++;
            }
            // Extract until end of line
            let result = '';
            for (let i = start; i < text.length; i++) {
                if (text[i] === '\n' || text[i] === '\r') break;
                result += text[i];
            }
            result = result.trim();
            // Remove trailing keywords
            const stopWords = ['property details', 'for rent', 'for sale', 'available'];
            for (const stop of stopWords) {
                const stopIdx = result.toLowerCase().indexOf(stop);
                if (stopIdx >= 0) {
                    result = result.slice(0, stopIdx).trim();
                }
            }
            if (result.length >= 2) {
                return titleCase(result);
            }
        }
    }
    
    // Check for "near/nr/opp/opposite/behind/off <location>" pattern
    const nearKeywords = ['near ', 'nr ', 'opp ', 'opposite ', 'behind ', 'off '];
    for (const kw of nearKeywords) {
        const idx = lower.indexOf(kw);
        if (idx >= 0) {
            let start = idx + kw.length;
            // Extract until end of line or common stop words
            let result = '';
            for (let i = start; i < text.length; i++) {
                if (text[i] === '\n' || text[i] === '\r') break;
                result += text[i];
            }
            result = result.trim();
            // Remove trailing keywords
            const stopWords = ['for ', 'rent', 'sale', 'available'];
            for (const stop of stopWords) {
                const stopIdx = result.toLowerCase().indexOf(stop);
                if (stopIdx >= 0) {
                    result = result.slice(0, stopIdx).trim();
                }
            }
            if (result.length >= 2) {
                return titleCase(result);
            }
        }
    }
    
    // Check for road patterns like "1st road, area"
    const roadPattern = /^\d{1,2}(?:st|nd|rd|th)\s+road/i;
    const lines = text.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (roadPattern.test(trimmed)) {
            return titleCase(trimmed);
        }
    }
    
    // Check for standalone road/lane/nagar patterns
    const roadTypes = ['road', 'rd', 'lane', 'link road', 'back road', 'nagar', 'ngr'];
    for (const line of lines) {
        const trimmed = line.trim();
        for (const roadType of roadTypes) {
            if (trimmed.toLowerCase().endsWith(roadType) || trimmed.toLowerCase().includes(' ' + roadType)) {
                if (trimmed.length >= 2) {
                    return titleCase(trimmed);
                }
            }
        }
    }
    
    return null;
};

const buildDisplayTitle = (buildingName: string | null, microLocation: string | null, locality: string | null) => {
    if (buildingName && microLocation) {
        return `${buildingName}, ${microLocation}`;
    }

    if (buildingName) {
        return `${buildingName}, ${locality}`;
    }

    if (microLocation && locality && microLocation.toLowerCase() !== locality.toLowerCase()) {
        return `${titleCase(microLocation)}, ${titleCase(locality)}`;
    }
    return locality ? titleCase(locality) : 'Property listing';
};

const extractDealType = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes('pre leased') || lower.includes('pre-leased')) return 'pre-leased';
    if (lower.includes('lease') || lower.includes('leave and license') || lower.includes('leave & license') ||
        lower.includes('l&l') || lower.includes(' ll') || lower.endsWith(' ll')) {
        return 'lease';
    }
    if (lower.includes('rent')) {
        return 'rent';
    }
    return 'sale';
};

const inferDealTypeFromPrice = (text: string, currentDealType: string | null | undefined, priceNumeric: number | null) => {
    const lower = String(text || '').toLowerCase();
    const explicitKeywords = [
        { keywords: ['pre leased', 'pre-leased'], dealType: 'pre-leased' as const },
        { keywords: ['leave and license', 'leave & license', 'l&l'], dealType: 'lease' as const },
        { keywords: ['lease', 'leased'], dealType: 'lease' as const },
        { keywords: ['rent', 'rental', 'monthly', 'per month'], dealType: 'rent' as const },
        { keywords: ['sale', 'selling', 'resale', 'outright'], dealType: 'sale' as const },
    ];

    for (const entry of explicitKeywords) {
        if (entry.keywords.some((keyword) => lower.includes(keyword))) {
            return entry.dealType;
        }
    }

    const baseDealType = String(currentDealType || '').trim().toLowerCase();
    if (priceNumeric == null || !Number.isFinite(priceNumeric) || priceNumeric <= 0) {
        return baseDealType || 'sale';
    }

    if (priceNumeric >= 5_000 && priceNumeric <= 1_000_000) {
        return 'rent';
    }

    if (priceNumeric > 20_000_000) {
        return 'sale';
    }

    if (baseDealType === 'rent' && priceNumeric < 1_000) {
        return 'sale';
    }

    if (baseDealType === 'sale' && priceNumeric >= 5_000 && priceNumeric <= 1_000_000) {
        return 'rent';
    }

    return baseDealType || (priceNumeric >= 5_000 && priceNumeric <= 1_000_000 ? 'rent' : 'sale');
};

const inferStreamTypeFromPrice = (text: string, currentStreamType: string | null | undefined, priceNumeric: number | null): StreamType => {
    const lower = String(text || '').toLowerCase();

    if (lower.includes('pre leased') || lower.includes('pre-leased')) return 'Pre-leased';
    if (lower.includes('requirement') || lower.includes('looking for') || lower.includes('wanted') || lower.includes('need ') || lower.includes('require')) {
        return 'Requirement';
    }
    if (lower.includes('lease') || lower.includes('leave and license') || lower.includes('leave & license') || lower.includes('l&l')) {
        return 'Lease';
    }
    if (lower.includes('rent') || lower.includes('monthly') || lower.includes('per month')) {
        return 'Rent';
    }
    if (lower.includes('sale') || lower.includes('selling') || lower.includes('resale') || lower.includes('outright')) {
        return 'Sale';
    }

    const baseStreamType = String(currentStreamType || '').trim();
    if (!priceNumeric || !Number.isFinite(priceNumeric) || priceNumeric <= 0) {
        return (baseStreamType as StreamType) || 'Sale';
    }

    if (priceNumeric >= 5_000 && priceNumeric <= 1_000_000) {
        return 'Rent';
    }

    if (priceNumeric > 20_000_000) {
        return 'Sale';
    }

    if (baseStreamType === 'Rent' && priceNumeric < 1_000) {
        return 'Sale';
    }

    if (baseStreamType === 'Sale' && priceNumeric >= 5_000 && priceNumeric <= 1_000_000) {
        return 'Rent';
    }

    return (baseStreamType as StreamType) || (priceNumeric >= 5_000 && priceNumeric <= 1_000_000 ? 'Rent' : 'Sale');
};

const extractAssetClass = (text: string) => {
    const lower = text.toLowerCase();
    const commercialWords = ['office', 'shop', 'showroom', 'warehouse', 'commercial', 'gaming', 'retail', 'restaurant', 'cafe', 'salon', 'clinic', 'entertainment zone', 'co-working', 'co working', 'coworking', 'pcmc'];
    if (commercialWords.some(w => lower.includes(w))) return 'commercial';
    if (lower.includes('pre leased') || lower.includes('pre-leased')) return 'commercial';
    return 'residential';
};

const SECTION_TYPE_KEYWORDS: Array<{ keywords: string[]; type: StreamType }> = [
    { keywords: ['pre leased', 'pre-leased'], type: 'Pre-leased' },
    { keywords: ['requirement'], type: 'Requirement' },
    { keywords: ['lease', 'l&l', ' ll', 'll '], type: 'Lease' },
    { keywords: ['rent', 'rental'], type: 'Rent' },
    { keywords: ['sale', 'outright'], type: 'Sale' },
];

// Check if line starts with bullet characters
const isBulletLine = (line: string): boolean => {
    const trimmed = line.trimStart();
    if (trimmed.length === 0) return false;
    const firstChar = trimmed[0];
    const bulletChars = ['👉', '•', '▪', '►', '-', '–', '—', '→', '➜', '➤', '✅', '☑', '✔'];
    return bulletChars.some(b => trimmed.startsWith(b));
};

const sanitizeLine = (line: string) => {
    // Remove bullet characters from start
    let result = line;
    while (isBulletLine(result)) {
        const trimmed = result.trimStart();
        // Find and remove the bullet character
        const bulletChars = ['👉', '•', '▪', '►', '- ', '– ', '— ', '→ ', '➜ ', '➤ ', '✅ ', '☑ ', '✔ '];
        let found = false;
        for (const b of bulletChars) {
            if (trimmed.startsWith(b)) {
                result = trimmed.slice(b.length).trimStart();
                found = true;
                break;
            }
        }
        if (!found) break;
    }
    // Remove markdown formatting chars
    result = result.split('*').join('').split('_').join('').split('`').join('').split('~').join('');
    // Normalize whitespace
    return result.split(' ').filter(Boolean).join(' ').trim();
};

const detectSectionType = (line: string): StreamType | null => {
    const lower = line.toLowerCase();
    for (const entry of SECTION_TYPE_KEYWORDS) {
        if (entry.keywords.some(kw => lower.includes(kw))) {
            return entry.type;
        }
    }
    return null;
};

const looksLikeListingLine = (line: string) => {
    const lower = line.toLowerCase();
    const listingKeywords = ['available', 'requirement', 'wanted', 'need', 'spacious', 'outright', 
                            'shop required', '2bhk', '3bhk', '1bhk', '4bhk', 'rent', 'sale', 
                            'lease', 'pre leased', 'pre-leased', '@'];
    return listingKeywords.some(kw => lower.includes(kw));
};

const isLikelySectionHeader = (line: string) => {
    // Remove special characters and check length
    let cleaned = '';
    for (const c of line) {
        if (c !== '*' && c !== '_' && c !== '`' && c !== '~' && c !== ' ' && c !== ':' && c !== '.' && c !== '-') {
            cleaned += c;
        }
    }
    return cleaned.length <= 22;
};

const isLikelyLocationHeader = (line: string) => {
    if (extractPriceInfo(line).numeric || extractBhk(line) !== 'N/A') {
        return false;
    }

    if (looksLikeListingLine(line)) {
        return false;
    }

    const parsed = parseIndianLocation(line);
    return Boolean(parsed?.locality) && line.length <= 40;
};

const expandInlineBroadcastText = (rawText: string) => {
    // Expand inline bullet characters to new lines
    let result = rawText;
    
    // Replace common bullet characters with newline + bullet
    const bulletChars = ['â€¢', 'â–ª', 'â–º', 'âžœ', 'âž¤', 'âœ…', 'â˜‘', 'âœ”'];
    for (const bullet of bulletChars) {
        result = result.split(bullet).join('\nâ€¢ ');
    }
    
    // Add newlines before listing keywords if not already on new line
    const keywords = ['available', 'outright', 'spacious', 'requirement', 'wanted', 'need', 'required'];
    for (const kw of keywords) {
        const idx = result.toLowerCase().indexOf(kw);
        if (idx > 0 && result[idx - 1] !== '\n' && result[idx - 1] !== ' ') {
            // Check if we should add a newline before this keyword
            const before = result.slice(0, idx);
            if (!before.endsWith('\n')) {
                result = before + '\n' + result.slice(idx);
            }
        }
    }
    
    return result;
};

const splitMessageIntoSegments = (rawText: string) => {
    const lines = expandInlineBroadcastText(rawText)
        .split('\n')
        .map((line) => line.replace('\r', ''))
        .map((line) => line.trim())
        .filter(Boolean);

    const segments: Array<{ text: string; streamType: StreamType }> = [];
    const commonType = inferType(rawText);
    let currentType = commonType;
    let currentLines: string[] = [];
    let currentLocalityHint = '';

    const flush = () => {
        let text = currentLines.map(sanitizeLine).filter(Boolean).join('\n');
        if (text && currentLocalityHint) {
            const normalizedText = normalize(text);
            const normalizedLocality = normalize(currentLocalityHint);
            if (!normalizedText.includes(normalizedLocality)) {
                text = `${currentLocalityHint}\n${text}`;
            }
        }
        if (text) {
            const splitTexts = splitMultiListing(text);
            for (const splitText of splitTexts) {
                const normalizedText = splitText.trim();
                if (!normalizedText) {
                    continue;
                }
                const inferredType = inferType(normalizedText);
                segments.push({ text: normalizedText, streamType: inferredType || currentType });
            }
        }
        currentLines = [];
    };

    for (const line of lines) {
        const sectionType = detectSectionType(line);
        if (sectionType && isLikelySectionHeader(line)) {
            flush();
            currentType = sectionType;
            continue;
        }

        const bullet = isBulletLine(line);
        const cleaned = sanitizeLine(line);
        if (!cleaned) {
            continue;
        }

        if (isLikelyLocationHeader(cleaned)) {
            const parsed = parseIndianLocation(cleaned);
            if (parsed?.locality) {
                flush();
                currentLocalityHint = parsed.locality;
                continue;
            }
        }

        if (bullet && currentLines.length > 0) {
            flush();
        }

        if (!currentLines.length && !bullet && !looksLikeListingLine(cleaned)) {
            continue;
        }

        currentLines.push(cleaned);
    }

    flush();

    const uniqueSegments = segments.filter((segment) => {
        const cleaned = normalize(segment.text);
        return Boolean(cleaned) && cleaned.length > 6;
    });

    return uniqueSegments.length > 1 ? uniqueSegments : [{ text: rawText, streamType: commonType }];
};

const calculateConfidence = (text: string, item: { location: string | null; price: string | null; bhk: string | null; buildingName?: string | null; microLocation?: string | null }) => {
    let score = 48;
    if (item.location) score += 16;
    if (item.price) score += 14;
    if (item.bhk) score += 10;
    if (item.buildingName) score += 4;
    if (item.microLocation) score += 4;
    if (text.length > 80) score += 8;
    if (/\d/.test(text) && /sq\s*ft|carpet|possession|furnished|tenant|yield/i.test(text)) score += 6;
    return Math.min(96, score);
};

const normalizeSourceKey = (value?: string | null) =>
    String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const extractJsonPayload = (text: string) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
        throw new Error('AI returned an empty response');
    }

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return fenced?.[1]?.trim() || trimmed;
};

const parseJson = <T>(text: string, context: string): T => {
    try {
        return JSON.parse(extractJsonPayload(text)) as T;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown JSON parse error';
        throw new Error(`${context}: ${message}`);
    }
};

type ParsedStreamCandidate = {
    messageId: string;
    rawText: string;
    sourcePhone: string | null;
    sourceLabel: string | null;
    sourceGroupId: string | null;
    sourceGroupName: string | null;
    streamType: StreamType;
    recordType: string;
    locality: string | null;
    city: string | null;
    bhk: string | null;
    priceLabel: string | null;
    priceNumeric: number | null;
    dealType: string;
    assetClass: string;
    propertyCategory: 'residential' | 'commercial';
    areaSqft: number | null;
    furnishing: 'unfurnished' | 'semi-furnished' | 'fully-furnished' | null;
    floorNumber: string | null;
    totalFloors: string | null;
    propertyUse: string | null;
    confidenceScore: number;
    messageHash: string;
    brokerContactValid: boolean;
    completenessScore: number;
    isComplete: boolean;
    createdAt: string;
    parsedPayload: Record<string, unknown>;
};

type AIParsedStreamItem = {
    title?: string | null;
    streamType?: StreamType | 'Unknown' | null;
    recordType?: 'listing' | 'requirement' | null;
    dealType?: 'rent' | 'sale' | 'pre-leased' | 'unknown' | null;
    assetClass?: 'residential' | 'commercial' | 'plot' | 'unknown' | null;
    locality?: string | null;
    city?: string | null;
    bhk?: string | null;
    priceLabel?: string | null;
    priceNumeric?: number | null;
    price?: number | string | null;
    priceUnit?: string | null;
    buildingName?: string | null;
    microLocation?: string | null;
    propertyCategory?: 'residential' | 'commercial' | null;
    areaSqft?: number | null;
    furnishing?: 'unfurnished' | 'semi-furnished' | 'fully-furnished' | 'furnished' | null;
    floorNumber?: string | null;
    totalFloors?: string | null;
    propertyUse?: string | null;
    parseNotes?: string | null;
    confidence?: number | null;
    rawText?: string | null;
};

type RawInboundMessage = {
    id: string;
    session_label?: string | null;
    remote_jid?: string | null;
    sender?: string | null;
    text?: string | null;
    timestamp?: string | null;
    created_at?: string | null;
    source?: string | null;
    sourceGroupId?: string | null;
    sourceGroupName?: string | null;
    senderJid?: string | null;
};

type GroupIngestionContext = {
    groupJid: string;
    groupName: string | null;
    locality: string | null;
    city: string | null;
    category: string | null;
    tags: string[];
};

type MessageIngestionStatus =
    | 'insufficient_data'
    | 'accepted'
    | 'suppressed_low_effort'
    | 'suppressed_bulk_spam'
    | 'suppressed_unresolved_context';

type MessageQualityDecision = {
    status: MessageIngestionStatus;
    suppressionReason: string | null;
    qualityScore: number;
    metrics: {
        candidateCount: number;
        avgConfidence: number;
        lowEffortRate: number;
        unresolvedRate: number;
        actionableRate: number;
        lineCount: number;
        resolvedWithGroupCount: number;
        actionableCount: number;
    };
    resolutionContext: Record<string, unknown>;
};

type StreamCorrectionInput = {
    type?: StreamType;
    title?: string;
    location?: string;
    city?: string;
    price?: string;
    priceNumeric?: number | null;
    bhk?: string;
    rawText?: string;
    source?: string;
    sourcePhone?: string | null;
    recordType?: string;
    dealType?: string;
    assetClass?: string;
    confidence?: number;
    parseNotes?: string | null;
};

type InboxPairCandidate = {
    listing: any;
    requirement: any;
    score: number;
    reasons: string[];
    createdAt: string;
};

export class ChannelService {
    private readonly db = supabaseAdmin ?? supabase;
    private networkTenantIdsCache = new Map<string, { expiresAt: number; tenantIds: string[] }>();
    private igrEnrichmentCache = new Map<string, { expiresAt: number; transactions: IgrTransactionPreview[] }>();

    private async readAcceptedStreamItems(readClient: any, tenantIds: string[], options?: {
        streamIds?: string[];
        limit?: number;
        orderByCreatedAt?: boolean;
        sessionLabel?: string | null;
        filters?: StreamListFilters | null;
    }) {
        const searchParts = buildSearchParts(options?.filters);
        const typeFilters = uniqueNonEmpty([
            ...(options?.filters?.types || []),
            ...searchParts.inferredTypes,
        ]) as StreamType[];
        const createdAfter = getLargestTimeWindow(options?.filters?.timeBands, options?.filters?.freshnessBands);
        const confidenceRange = getConfidenceRange(options?.filters);

        const buildQuery = (acceptedOnly: boolean) => {
            let query = readClient
                .from('stream_items')
                .select('*')
                .in('tenant_id', tenantIds);

            if (acceptedOnly) {
                query = query.eq('ingestion_status', 'accepted');
            }

            if (options?.streamIds?.length) {
                query = query.in('id', options.streamIds);
            }

            if (options?.sessionLabel) {
                query = query.eq('session_label', options.sessionLabel);
            }

            if (typeFilters.length > 0) {
                query = query.in('type', typeFilters);
            }

            if (options?.filters?.category) {
                query = query.eq('property_category', options.filters.category);
            }

            if (searchParts.bhk) {
                if (searchParts.bhk === '4+ BHK') {
                    query = query.or('bhk.ilike.%4 BHK%,bhk.ilike.%4+ BHK%,bhk.ilike.%5 BHK%,bhk.ilike.%6 BHK%');
                } else {
                    const digit = searchParts.bhk.match(/\d/)?.[0] || searchParts.bhk;
                    query = query.ilike('bhk', `%${escapePostgrestPattern(digit)}%`);
                }
            }

            if (searchParts.locality) {
                const locality = escapePostgrestPattern(searchParts.locality);
                query = query.or(`locality.ilike.%${locality}%,raw_text.ilike.%${locality}%`);
            }

            if (searchParts.fullTextSearch && searchParts.fullTextSearch !== searchParts.locality) {
                const pattern = escapePostgrestPattern(searchParts.fullTextSearch);
                query = query.or([
                    `raw_text.ilike.%${pattern}%`,
                    `locality.ilike.%${pattern}%`,
                    `city.ilike.%${pattern}%`,
                    `price_label.ilike.%${pattern}%`,
                    `asset_class.ilike.%${pattern}%`,
                    `deal_type.ilike.%${pattern}%`,
                    `source_group_name.ilike.%${pattern}%`,
                ].join(','));
            }

            if (confidenceRange.min != null) {
                query = query.gte('confidence_score', confidenceRange.min);
            }

            if (confidenceRange.max != null && confidenceRange.max < 100) {
                query = query.lte('confidence_score', confidenceRange.max);
            }

            if (createdAfter) {
                query = query.gte('created_at', createdAfter);
            }

            if (options?.filters?.source && options.filters.source !== 'all') {
                const sourcePattern = escapePostgrestPattern(options.filters.source);
                query = query.or(`source_phone.ilike.%${sourcePattern}%,raw_text.ilike.%${sourcePattern}%`);
            }

            if (options?.filters?.brokerOnly) {
                query = query.or('raw_text.ilike.%broker%,raw_text.ilike.%broking%,raw_text.ilike.%agent%,raw_text.ilike.%agnt%');
            }

            // Quality filters — suppress city-level locality labels, mojibake rent prices, insane prices
            query = query.not('locality', 'in', '("Mumbai market","Mumbai","Navi Mumbai","Thane","Pune")');
            query = query.or('type.neq.Rent,price_numeric.lte.500000000,price_numeric.is.null');
            // Price sanity: exclude rent > 50L/mo, sale > 500Cr, rent < 5K/mo
            query = query.or('type.neq.Rent,price_numeric.lte.5000000,price_numeric.is.null');
            query = query.or('type.neq.Sale,price_numeric.lte.500000000,price_numeric.is.null');

            if (options?.orderByCreatedAt) {
                query = query.order('created_at', { ascending: false });
            }

            if (typeof options?.limit === 'number') {
                query = query.limit(options.limit);
            }

            return query;
        };

        // Search fallback: when structured search returns 0 results, retry with raw_text-only ILIKE
        const initialSearch = options?.filters?.search;
        const hadStructuredFilters = searchParts.bhk || searchParts.locality || searchParts.fullTextSearch || typeFilters.length > 0;

        let result = await buildQuery(true);
        if (result.error && isMissingIngestionStatusError(result.error.message)) {
            result = await buildQuery(false);
        }

        if (result.data && Array.isArray(result.data) && result.data.length === 0 && initialSearch && hadStructuredFilters) {
            const rawFallbackQ = this.buildQueryRawTextOnly(readClient, tenantIds, initialSearch, true, options?.limit);
            const rawFallback = await rawFallbackQ;
            if (rawFallback.error && isMissingIngestionStatusError(rawFallback.error.message)) {
                const rawFallbackQ2 = this.buildQueryRawTextOnly(readClient, tenantIds, initialSearch, false, options?.limit);
                const rawFallback2 = await rawFallbackQ2;
                if (!rawFallback2.error && rawFallback2.data && Array.isArray(rawFallback2.data) && rawFallback2.data.length > 0) {
                    result = rawFallback2;
                }
            } else if (!rawFallback.error && rawFallback.data && Array.isArray(rawFallback.data) && rawFallback.data.length > 0) {
                result = rawFallback;
            }
        }

        // Post-query junk filter: suppress records where bhk='N/A', area_sqft is 0/null, confidence < 0.3
        // Exempt commercial records (property_category = 'commercial') from junk filter
        if (result.data && Array.isArray(result.data)) {
            result.data = result.data.filter((row: any) => {
                const isCommercial = String(row.property_category || '').trim() === 'commercial' || String(row.asset_class || '').trim() === 'commercial';
                if (isCommercial) return true;
                const isJunk = String(row.bhk || '').trim() === 'N/A'
                    && (row.area_sqft == null || Number(row.area_sqft) === 0)
                    && (row.confidence_score == null || Number(row.confidence_score) < 0.3);
                return !isJunk;
            });
        }

        return result;
    }

    private async countAcceptedStreamItems(tenantIds: string[], options?: {
        createdAfter?: string;
        sessionGroupIds?: string[] | null;
        sessionLabel?: string | null;
    }) {
        const buildQuery = (acceptedOnly: boolean) => {
            let query = this.db
                .from('stream_items')
                .select('id', { count: 'exact', head: true })
                .in('tenant_id', tenantIds);

            if (acceptedOnly) {
                query = query.eq('ingestion_status', 'accepted');
            }

            if (options?.sessionGroupIds) {
                query = query.in('source_group_id', options.sessionGroupIds);
            }

            if (options?.sessionLabel) {
                query = query.eq('session_label', options.sessionLabel);
            }

            if (options?.createdAfter) {
                query = query.gte('created_at', options.createdAfter);
            }

            return query;
        };

        let result = await buildQuery(true);
        if (result.error && isMissingIngestionStatusError(result.error.message)) {
            result = await buildQuery(false);
        }

        return result;
    }

    private isGlobalStreamCandidate(_parsed: ParsedStreamCandidate, isAccepted = true) {
        return isAccepted;
    }

    private shouldPersistParsedCandidate(parsed: ParsedStreamCandidate) {
        return true;
    }

    private isPlaceholderLocation(value?: string | null) {
        const normalized = normalize(String(value || ''));
        return !normalized || normalized === 'location not parsed yet' || normalized === 'unknown';
    }

    private hasUsefulPrice(parsed: ParsedStreamCandidate) {
        if (typeof parsed.priceNumeric === 'number' && Number.isFinite(parsed.priceNumeric) && parsed.priceNumeric > 0) {
            return true;
        }

        const priceLabel = normalize(parsed.priceLabel || '');
        return Boolean(priceLabel) && priceLabel !== 'unspecified';
    }

    private hasMeaningfulTypology(parsed: ParsedStreamCandidate) {
        const bhk = normalize(parsed.bhk || '');
        return Boolean(parsed.propertyUse) || (Boolean(bhk) && bhk !== 'na' && bhk !== 'n a');
    }

    private hasStructuralAnchor(parsed: ParsedStreamCandidate) {
        const payload = (parsed.parsedPayload || {}) as Record<string, unknown>;
        return Boolean(
            payload.buildingName ||
            payload.microLocation ||
            parsed.areaSqft ||
            parsed.floorNumber ||
            parsed.totalFloors,
        );
    }

    private hasActionableCore(parsed: ParsedStreamCandidate) {
        return this.hasUsefulPrice(parsed) && (
            !this.isPlaceholderLocation(parsed.locality) ||
            this.hasMeaningfulTypology(parsed) ||
            this.hasStructuralAnchor(parsed)
        );
    }

    private scoreCandidateCompleteness(parsed: ParsedStreamCandidate) {
        let score = 0;
        if (!this.isPlaceholderLocation(parsed.locality)) score += 2;
        if (this.hasUsefulPrice(parsed)) score += 1;
        if (this.hasMeaningfulTypology(parsed)) score += 1;
        if (this.hasStructuralAnchor(parsed)) score += 1;
        if (Number(parsed.confidenceScore || 0) >= 65) score += 1;
        return score;
    }

    private async loadGroupIngestionContext(tenantId: string, groupJid?: string | null): Promise<GroupIngestionContext | null> {
        const normalizedGroupJid = String(groupJid || '').trim();
        if (!normalizedGroupJid) {
            return null;
        }

        const { data, error } = await this.db
            .from('whatsapp_groups')
            .select('group_jid, group_name, locality, city, category, tags')
            .eq('tenant_id', tenantId)
            .eq('group_jid', normalizedGroupJid)
            .maybeSingle();

        if (error) {
            if (!isMissingSchemaEntityError(error.message)) {
                console.error('[ChannelService] Failed to load group ingestion context', error);
            }
            return null;
        }

        if (!data) {
            return null;
        }

        return {
            groupJid: String(data.group_jid || normalizedGroupJid),
            groupName: data.group_name ? String(data.group_name) : null,
            locality: data.locality ? String(data.locality) : null,
            city: data.city ? String(data.city) : null,
            category: data.category ? String(data.category) : null,
            tags: Array.isArray(data.tags) ? data.tags.map((tag: unknown) => String(tag || '').trim()).filter(Boolean) : [],
        };
    }

    private applyGroupContextToCandidate(parsed: ParsedStreamCandidate, groupContext: GroupIngestionContext | null): ParsedStreamCandidate {
        if (!groupContext) {
            return parsed;
        }

        const payload = { ...(parsed.parsedPayload || {}) } as Record<string, unknown>;
        const nextLocality = this.isPlaceholderLocation(parsed.locality) && groupContext.locality
            ? groupContext.locality
            : parsed.locality;
        const nextCity = (!parsed.city || normalize(parsed.city) === 'unknown') && groupContext.city
            ? groupContext.city
            : parsed.city;
        const usedGroupContext = nextLocality !== parsed.locality || nextCity !== parsed.city;

        return {
            ...parsed,
            locality: nextLocality,
            city: nextCity,
            sourceGroupName: parsed.sourceGroupName || groupContext.groupName,
            parsedPayload: {
                ...payload,
                groupContext: {
                    groupJid: groupContext.groupJid,
                    groupName: groupContext.groupName,
                    locality: groupContext.locality,
                    city: groupContext.city,
                    category: groupContext.category,
                    tags: groupContext.tags,
                },
                groupContextApplied: usedGroupContext,
                groupContextResolvedLocality: usedGroupContext ? nextLocality : payload.groupContextResolvedLocality || null,
            },
        };
    }

    private evaluateMessageQuality(message: RawInboundMessage, candidates: ParsedStreamCandidate[], groupContext: GroupIngestionContext | null): MessageQualityDecision {
        // Auto-suppression rules for obviously low-quality messages
        const rawText = String(message.text || '').trim();
        
        // 1. Too short to be meaningful
        if (rawText.length < 20) {
            return {
                status: 'insufficient_data',
                suppressionReason: 'Message too short (<20 characters) to contain meaningful real estate information.',
                qualityScore: 0,
                metrics: {
                    candidateCount: 0,
                    avgConfidence: 0,
                    lowEffortRate: 0,
                    unresolvedRate: 0,
                    actionableRate: 0,
                    lineCount: rawText.split('\n').length,
                    resolvedWithGroupCount: 0,
                    actionableCount: 0,
                },
                resolutionContext: {
                    sourceGroupId: message.remote_jid || null,
                    sourceGroupName: groupContext?.groupName || null,
                    groupLocality: groupContext?.locality || null,
                    groupCity: groupContext?.city || null,
                    groupCategory: groupContext?.category || null,
                    groupTags: groupContext?.tags || [],
                },
            };
        }
        
        // 2. No real estate keywords found
        const lowerText = rawText.toLowerCase();
        const realEstateKeywords = [
            'bhk', 'bed', 'bedroom', 'bath', 'bathroom', 'flat', 'apartment', 
            'house', 'villa', 'plot', 'land', 'property', 'rent', 'sale', 
            'lease', 'available', 'ready', 'possession', 'sqft', 'square feet',
            'developer', 'builder', 'project', 'society', 'wing', 'tower', 
            'floor', 'flat no', 'flat no.', 'building', 'residency', 'residency',
            'ac', 'parking', 'lift', 'elevator', 'gym', 'pool', 'clubhouse',
            'security', 'maintenance', 'society', 'office', 'shop', 'showroom',
            'commercial', 'retail', 'warehouse', 'factory', 'industrial'
        ];
        
        const hasRealEstateKeyword = realEstateKeywords.some(keyword => lowerText.includes(keyword));
        if (!hasRealEstateKeyword) {
            return {
                status: 'insufficient_data',
                suppressionReason: 'Message contains no recognizable real estate keywords.',
                qualityScore: 0,
                metrics: {
                    candidateCount: 0,
                    avgConfidence: 0,
                    lowEffortRate: 0,
                    unresolvedRate: 0,
                    actionableRate: 0,
                    lineCount: rawText.split('\n').length,
                    resolvedWithGroupCount: 0,
                    actionableCount: 0,
                },
                resolutionContext: {
                    sourceGroupId: message.remote_jid || null,
                    sourceGroupName: groupContext?.groupName || null,
                    groupLocality: groupContext?.locality || null,
                    groupCity: groupContext?.city || null,
                    groupCategory: groupContext?.category || null,
                    groupTags: groupContext?.tags || [],
                },
            };
        }
        
        // Continue with original evaluation logic...
        const lines = rawText.split('\n').map((line) => line.trim()).filter(Boolean);
        const candidateCount = candidates.length;
        const avgConfidence = candidateCount > 0
            ? candidates.reduce((sum, candidate) => sum + Number(candidate.confidenceScore || 0), 0) / candidateCount
            : 0;

        let lowEffortCount = 0;
        let unresolvedCount = 0;
        let resolvedWithGroupCount = 0;
        let actionableCount = 0;

        for (const candidate of candidates) {
            const completeness = this.scoreCandidateCompleteness(candidate);
            const payload = (candidate.parsedPayload || {}) as Record<string, unknown>;
            if (completeness <= 2) {
                lowEffortCount += 1;
            }
            if (this.isPlaceholderLocation(candidate.locality)) {
                unresolvedCount += 1;
            }
            if (payload.groupContextApplied) {
                resolvedWithGroupCount += 1;
            }
            if (this.hasActionableCore(candidate)) {
                actionableCount += 1;
            }
        }

        const lowEffortRate = candidateCount > 0 ? lowEffortCount / candidateCount : 0;
        const unresolvedRate = candidateCount > 0 ? unresolvedCount / candidateCount : 0;
        const actionableRate = candidateCount > 0 ? actionableCount / candidateCount : 0;
        const qualityScore = Math.max(
            0,
            Math.round(avgConfidence - (lowEffortRate * 35) - (unresolvedRate * 30) + (resolvedWithGroupCount * 4) + (actionableRate * 18)),
        );

        let status: MessageIngestionStatus = 'accepted';
        let suppressionReason: string | null = null;

        if (candidateCount >= 15 && actionableRate < 0.3 && (lowEffortRate >= 0.4 || avgConfidence < 60 || unresolvedRate >= 0.3)) {
            status = 'suppressed_bulk_spam';
            suppressionReason = `Suppressed ${candidateCount}-item broker blast due to weak structure and low-actionability.`;
        } else if (candidateCount >= 10 && lowEffortRate >= 0.7 && actionableRate < 0.25) {
            status = 'suppressed_bulk_spam';
            suppressionReason = `Suppressed multi-listing broker blast because most extracted records are low-effort.`;
        } else if (!groupContext?.locality && candidateCount >= 5 && unresolvedRate >= 0.75 && actionableRate < 0.15) {
            status = 'suppressed_unresolved_context';
            suppressionReason = 'Suppressed message because locality context remained unresolved across most extracted records.';
        } else if (candidateCount >= 2 && lowEffortRate >= 0.85 && avgConfidence < 60 && actionableCount === 0) {
            status = 'suppressed_low_effort';
            suppressionReason = 'Suppressed message because most extracted records are too vague to be actionable.';
        } else if (candidateCount === 1 && lowEffortRate === 1 && avgConfidence < 40 && !this.hasActionableCore(candidates[0])) {
            status = 'suppressed_low_effort';
            suppressionReason = 'Suppressed single low-effort listing with insufficient actionable detail.';
        }

        return {
            status,
            suppressionReason,
            qualityScore,
            metrics: {
                candidateCount,
                avgConfidence: Math.round(avgConfidence * 10) / 10,
                lowEffortRate: Math.round(lowEffortRate * 100) / 100,
                unresolvedRate: Math.round(unresolvedRate * 100) / 100,
                actionableRate: Math.round(actionableRate * 100) / 100,
                lineCount: lines.length,
                resolvedWithGroupCount,
                actionableCount,
            },
            resolutionContext: {
                sourceGroupId: message.remote_jid || null,
                sourceGroupName: groupContext?.groupName || null,
                groupLocality: groupContext?.locality || null,
                groupCity: groupContext?.city || null,
                groupCategory: groupContext?.category || null,
                groupTags: groupContext?.tags || [],
            },
        };
    }
    async createChannel(tenantId: string, input: CreateChannelInput): Promise<PersonalChannelRecord> {
        const localities = uniqueNormalized(input.localities || []);
        const keywords = uniqueNormalized(input.keywords || []);
        const keywordsExclude = uniqueNormalized(input.keywordsExclude || []);
        const dealTypes = uniqueNormalized(input.dealTypes || []);
        const recordTypes = uniqueNormalized(input.recordTypes || []);
        const bhkValues = uniqueNormalized(input.bhkValues || []);
        const assetClasses = uniqueNormalized(input.assetClasses || []);
        const channelType = input.channelType || this.inferChannelType(recordTypes);
        const name = String(input.name || '').trim() || this.deriveChannelName(localities, keywords, channelType);
        const slug = await this.generateUniqueSlug(tenantId, name);
        const now = new Date().toISOString();

        const { data, error } = await this.db
            .from('broker_channels')
            .insert({
                tenant_id: tenantId,
                created_by: input.createdBy || tenantId,
                name,
                slug,
                channel_type: channelType,
                localities,
                keywords_include: keywords,
                keywords_exclude: keywordsExclude,
                deal_types: dealTypes,
                record_types: recordTypes,
                bhk_values: bhkValues,
                asset_classes: assetClasses,
                budget_min: input.budgetMin ?? null,
                budget_max: input.budgetMax ?? null,
                confidence_min: input.confidenceMin ?? 0,
                pinned: input.pinned ?? true,
                is_active: true,
                created_at: now,
                updated_at: now,
            })
            .select('*')
            .single();

        if (error || !data) {
            throw new Error(error?.message || 'Failed to create channel');
        }

        await this.ensureStreamBackfilled(tenantId);
        await this.backfillChannelMatches(tenantId, data.id);

        const created = await this.getChannelById(tenantId, data.id);
        if (!created) {
            throw new Error('Channel created but could not be reloaded');
        }

        return created;
    }

    async listChannels(tenantId: string): Promise<PersonalChannelRecord[]> {
        void this.ensureStreamBackfilled(tenantId);

        const { data, error } = await this.db
            .from('broker_channels')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .order('pinned', { ascending: false })
            .order('updated_at', { ascending: false });

        if (error) {
            if (isMissingSchemaEntityError(error.message)) {
                return [];
            }
            throw new Error(error.message);
        }

        const rows = (data || []) as ChannelRow[];
        if (rows.length === 0) {
            return [];
        }

        const counts = await this.getChannelCounts(rows.map((row) => row.id));
        return rows.map((row) => this.mapChannelRow(row, counts.get(row.id)));
    }

    async getChannelById(tenantId: string, channelId: string): Promise<PersonalChannelRecord | null> {
        const { data, error } = await this.db
            .from('broker_channels')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('id', channelId)
            .eq('is_active', true)
            .maybeSingle();

        if (error) {
            if (isMissingSchemaEntityError(error.message)) {
                return null;
            }
            throw new Error(error.message);
        }

        if (!data) {
            return null;
        }

        const counts = await this.getChannelCounts([channelId]);
        return this.mapChannelRow(data as ChannelRow, counts.get(channelId));
    }

private backfillInitiatedScopes = new Map<string, number>();
private dailyBriefingSentKeys = new Set<string>();

    private getBackfillScopeKey(tenantId: string, sessionLabel?: string | null) {
        return `${tenantId}::${sessionLabel || 'all'}`;
    }

    private async getNetworkTenantIds(tenantId: string, networkMode: boolean) {
        if (!networkMode) {
            return [tenantId];
        }

        const cacheKey = `network::all-brokers`;
        const cached = this.networkTenantIdsCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.tenantIds;
        }

        const { data, error } = await this.db
            .from('profiles')
            .select('id')
            .in('app_role', ['broker']);

        if (error) {
            throw new Error(error.message);
        }

        const tenantIds = Array.from(new Set([
            tenantId,
            ...((data || []).map((row: any) => String(row.id || '')).filter(Boolean)),
        ]));

        this.networkTenantIdsCache.set(cacheKey, {
            tenantIds,
            expiresAt: Date.now() + (60 * 1000),
        });

        return tenantIds;
    }

    async listStreamItems(
        tenantId: string,
        accessToken?: string | null,
        channelId?: string | null,
        sessionLabel?: string | null,
        networkMode = false,
        limit = 100,
        email?: string | null,
        filters?: StreamListFilters | null,
    ): Promise<StreamItemRecord[]> {
         // FIX 3: Auto-sync period — re-trigger backfill if enough time has elapsed
         const backfillScopeKey = this.getBackfillScopeKey(tenantId, sessionLabel);
         const lastBackfill = this.backfillInitiatedScopes.get(backfillScopeKey);
         let shouldBackfill = false;
         if (!lastBackfill) {
             shouldBackfill = true;
         } else {
             try {
                 const settingsRecord = await getWorkspaceSettingsRecord(tenantId);
                 const period = settingsRecord.settings.autoSyncPeriod || 'Auto';
                 let intervalMs = 24 * 60 * 60 * 1000;
                 if (period === 'Hourly') intervalMs = 60 * 60 * 1000;
                 else if (period === 'Daily') intervalMs = 24 * 60 * 60 * 1000;
                 else if (period === 'Weekly') intervalMs = 7 * 24 * 60 * 60 * 1000;
                 else if (period === 'Auto') intervalMs = 6 * 60 * 60 * 1000;
                 shouldBackfill = (Date.now() - lastBackfill) > intervalMs;
             } catch {
                 shouldBackfill = (Date.now() - lastBackfill) > 24 * 60 * 60 * 1000;
             }
         }
         if (shouldBackfill) {
             this.backfillInitiatedScopes.set(backfillScopeKey, Date.now());
             void this.ensureStreamBackfilled(tenantId, sessionLabel);
         }

         // FIX 1: Daily market briefing — fire-and-forget on first load of day
         const today = new Date().toISOString().slice(0, 10);
         const briefingKey = `${tenantId}::${today}`;
         if (!this.dailyBriefingSentKeys.has(briefingKey)) {
             this.dailyBriefingSentKeys.add(briefingKey);
             void this.maybeSendDailyBriefing(tenantId, email);
         }

         const readClient = accessToken ? createSupabaseAnonClient(accessToken) : this.db;
         const accessibleTenantIds = await this.getNetworkTenantIds(tenantId, networkMode);

        if (channelId) {
            const { data: links, error: linksError } = await this.db
                .from('channel_items')
                .select('stream_item_id, is_read, created_at')
                .eq('tenant_id', tenantId)
                .eq('channel_id', channelId)
                .order('created_at', { ascending: false });

            if (linksError) {
                throw new Error(linksError.message);
            }

            if (!links || links.length === 0) {
                return [];
            }

            if (!Array.isArray(links)) return [];

            const streamIds = links.map((link: any) => link.stream_item_id);
            const { data: items, error: itemsError } = await this.readAcceptedStreamItems(readClient, accessibleTenantIds, {
                streamIds,
                filters,
            });

            if (itemsError) {
                throw new Error(itemsError.message);
            }

            const linkMap = new Map<string, any>(links.map((link: any) => [link.stream_item_id, link]));
            const filteredItems = await this.filterItemsBySession(tenantId, (items || []), sessionLabel, networkMode);
            const mapped = Array.isArray(filteredItems)
                ? filteredItems.map((item: any) => this.mapStreamItem(item, tenantId, linkMap.get(item.id)?.is_read))
                : [];
            return this.enrichWithIgrTransactions(this.enrichSourcePhones(
                this.rankStreamItems(mapped)
            ));
        }

        const effectiveLimit = Math.max(20, Math.min(500, limit));
        let data: any[] | null = null;
        let error: any = null;

        if (!networkMode && sessionLabel) {
            const scopedResult = await this.readAcceptedStreamItems(readClient, accessibleTenantIds, {
                limit: effectiveLimit,
                orderByCreatedAt: true,
                sessionLabel,
                filters,
            });

            if (!scopedResult.error && Array.isArray(scopedResult.data) && scopedResult.data.length > 0) {
                data = scopedResult.data;
            } else if (scopedResult.error && !isMissingIngestionStatusError(scopedResult.error.message)) {
                error = scopedResult.error;
            }
        }

        if (!data && !error) {
            const result = await this.readAcceptedStreamItems(readClient, accessibleTenantIds, {
                limit: effectiveLimit,
                orderByCreatedAt: true,
                filters,
            });
            data = result.data || null;
            error = result.error;
        }

        if (error) {
            throw new Error(error.message);
        }

        const filteredItems = await this.filterItemsBySession(tenantId, data || [], sessionLabel, networkMode);
        const mapped = Array.isArray(filteredItems) ? filteredItems.map((item: any) => this.mapStreamItem(item, tenantId)) : [];
        return this.enrichWithIgrTransactions(this.enrichSourcePhones(
            this.rankStreamItems(mapped)
        ));
    }

    async listInboxMatches(
        tenantId: string,
        isSuperAdmin = false,
        limit = 200,
    ): Promise<InboxMatchRecord[]> {
        const effectiveLimit = Math.max(50, Math.min(500, limit));
        if (!isSuperAdmin) {
            await this.syncInboxMatchesForTenant(tenantId).catch((error) => {
                if (!isInboxItemsSchemaError(error as any)) {
                    console.error('[ChannelService] Inbox sync failed', { tenantId, error });
                }
            });

            try {
                const { data, error } = await this.db
                    .from('inbox_items')
                    .select('id, tenant_id, listing_id, requirement_id, match_score, match_reasons, created_at, updated_at')
                    .eq('tenant_id', tenantId)
                    .order('updated_at', { ascending: false })
                    .limit(effectiveLimit);

                if (error) {
                    throw error;
                }

                if (Array.isArray(data) && data.length > 0) {
                    return this.mapInboxItemsToResponse(tenantId, data as any[]);
                }
            } catch (error) {
                if (!isInboxItemsSchemaError(error as any)) {
                    console.error('[ChannelService] Failed to read inbox_items, using in-memory fallback', { tenantId, error });
                }
            }
        }

        if (isSuperAdmin) {
            const { data, error } = await this.db
                .from('stream_items')
                .select('*')
                .eq('ingestion_status', 'accepted')
                .order('created_at', { ascending: false })
                .limit(Math.max(effectiveLimit * 3, 400));
            if (error) throw new Error(error.message);
            return this.buildInboxMatchesFromRows(tenantId, Array.isArray(data) ? data : [], effectiveLimit);
        }

        const { data, error } = await this.readAcceptedStreamItems(this.db, [tenantId], {
            limit: Math.max(effectiveLimit * 3, 400),
            orderByCreatedAt: true,
        });
        if (error) throw new Error(error.message);
        return this.buildInboxMatchesFromRows(tenantId, Array.isArray(data) ? data : [], effectiveLimit);
    }

    async getStreamSummary(
        tenantId: string,
        channelId?: string | null,
        sessionLabel?: string | null,
        networkMode = false,
    ) {
        const accessibleTenantIds = await this.getNetworkTenantIds(tenantId, networkMode);
        const now = Date.now();
        const windows = {
            oneHour: new Date(now - 60 * 60 * 1000).toISOString(),
            fourHours: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
            oneDay: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
            sevenDays: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
        } as const;
        const countWindows = async (options?: { sessionGroupIds?: string[] | null; sessionLabel?: string | null }) => {
            const [oneHour, fourHours, oneDay, sevenDays, allTime] = await Promise.all([
                this.countAcceptedStreamItems(accessibleTenantIds, { ...options, createdAfter: windows.oneHour }),
                this.countAcceptedStreamItems(accessibleTenantIds, { ...options, createdAfter: windows.fourHours }),
                this.countAcceptedStreamItems(accessibleTenantIds, { ...options, createdAfter: windows.oneDay }),
                this.countAcceptedStreamItems(accessibleTenantIds, { ...options, createdAfter: windows.sevenDays }),
                this.countAcceptedStreamItems(accessibleTenantIds, options),
            ]);

            return {
                oneHour: Number(oneHour.count || 0),
                fourHours: Number(fourHours.count || 0),
                oneDay: Number(oneDay.count || 0),
                sevenDays: Number(sevenDays.count || 0),
                allTime: Number(allTime.count || 0),
            };
        };

        if (channelId) {
            const { data: links, error: linksError } = await this.db
                .from('channel_items')
                .select('stream_item_id')
                .eq('tenant_id', tenantId)
                .eq('channel_id', channelId);

            if (linksError) {
                throw new Error(linksError.message);
            }

            const streamIds = Array.isArray(links) ? links.map((link: any) => String(link.stream_item_id || '')).filter(Boolean) : [];
            if (streamIds.length === 0) {
                return { oneHour: 0, fourHours: 0, oneDay: 0, sevenDays: 0, allTime: 0 };
            }

            const { data, error } = await this.readAcceptedStreamItems(this.db, accessibleTenantIds, {
                streamIds,
            });

            if (error) {
                throw new Error(error.message);
            }

            const filteredItems = await this.filterItemsBySession(tenantId, data || [], sessionLabel, networkMode);
            const counts = { oneHour: 0, fourHours: 0, oneDay: 0, sevenDays: 0, allTime: 0 };

            for (const item of filteredItems) {
                const createdAt = new Date(String((item as any).created_at || ''));
                if (Number.isNaN(createdAt.getTime())) {
                    continue;
                }
                counts.allTime += 1;
                const timestamp = createdAt.getTime();
                if (timestamp >= new Date(windows.sevenDays).getTime()) counts.sevenDays += 1;
                if (timestamp >= new Date(windows.oneDay).getTime()) counts.oneDay += 1;
                if (timestamp >= new Date(windows.fourHours).getTime()) counts.fourHours += 1;
                if (timestamp >= new Date(windows.oneHour).getTime()) counts.oneHour += 1;
            }

            return counts;
        }

        if (!networkMode && sessionLabel) {
            const directCounts = await countWindows({ sessionLabel });
            if (directCounts.allTime > 0) {
                return directCounts;
            }
        }

        let sessionGroupIds: string[] | null = null;
        if (!networkMode && sessionLabel) {
            const groupsResult = await this.db
                .from('whatsapp_groups')
                .select('group_jid')
                .eq('tenant_id', tenantId)
                .eq('session_label', sessionLabel)
                .eq('is_archived', false);

            if (groupsResult.error) {
                if (isMissingSchemaEntityError(groupsResult.error.message)) {
                    sessionGroupIds = null;
                } else {
                    throw new Error(groupsResult.error.message);
                }
            } else {
                sessionGroupIds = Array.isArray(groupsResult.data)
                    ? groupsResult.data.map((row: any) => String(row.group_jid || '')).filter(Boolean)
                    : [];
                if (sessionGroupIds.length === 0) {
                    return { oneHour: 0, fourHours: 0, oneDay: 0, sevenDays: 0, allTime: 0 };
                }

                return countWindows({ sessionGroupIds });
            }
        }
        return countWindows();
    }

    private async filterItemsBySession(tenantId: string, items: any[], sessionLabel?: string | null, networkMode = false) {
        if (networkMode) {
            return items;
        }
        if (!sessionLabel || !Array.isArray(items) || items.length === 0) {
            return items;
        }

        const directlyScoped = items.filter((item: any) => String(item.tenant_id || '') === tenantId && String(item.session_label || '') === sessionLabel);
        if (directlyScoped.length > 0) {
            return items.filter((item: any) => {
                if (String(item.tenant_id || '') !== tenantId) {
                    return true;
                }

                return String(item.session_label || '') === sessionLabel;
            });
        }

        let groupsQuery = this.db
            .from('whatsapp_groups')
            .select('group_jid')
            .eq('tenant_id', tenantId)
            .eq('session_label', sessionLabel)
            .eq('is_archived', false);

        const groupsResult = await groupsQuery;
        if (groupsResult.error) {
            if (isMissingSchemaEntityError(groupsResult.error.message)) {
                return items;
            }
            throw new Error(groupsResult.error.message);
        }

        const groupData = Array.isArray(groupsResult.data) ? groupsResult.data : [];
        const groupIds = new Set(groupData.map((row: any) => String(row.group_jid || '')).filter(Boolean));
        if (groupIds.size === 0) {
            return items;
        }

        return items.filter((item: any) => {
            if (String(item.tenant_id || '') !== tenantId) {
                return true;
            }

            return !item.source_group_id || groupIds.has(String(item.source_group_id));
        });
    }

    async rebuildStreamFromMessages(
        tenantId: string,
        limitOrOptions: number | {
            limit?: number;
            remoteJid?: string | null;
            sessionLabel?: string | null;
            from?: string | null;
            to?: string | null;
        } = 500,
    ) {
        const options = typeof limitOrOptions === 'number'
            ? { limit: limitOrOptions }
            : (limitOrOptions || {});
        const limit = Math.max(1, Math.min(10000, Number(options.limit || 500)));

        let query = this.db
            .from('messages')
            .select('id, session_label, remote_jid, sender, text, timestamp, created_at')
            .eq('tenant_id', tenantId)
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (options.sessionLabel) {
            query = query.eq('session_label', options.sessionLabel);
        }

        if (options.remoteJid) {
            query = query.eq('remote_jid', options.remoteJid);
        }

        if (options.from) {
            query = query.gte('timestamp', options.from);
        }

        if (options.to) {
            query = query.lte('timestamp', options.to);
        }

        const { data: messages, error } = await query;

        if (error) {
            throw new Error(error.message);
        }

        const orderedMessages = Array.isArray(messages)
            ? [...messages].sort((left: any, right: any) => {
                const leftTime = new Date(String(left?.timestamp || left?.created_at || 0)).getTime();
                const rightTime = new Date(String(right?.timestamp || right?.created_at || 0)).getTime();
                return leftTime - rightTime;
            })
            : [];

        let ingestedCount = 0;
        for (const message of orderedMessages) {
            try {
                ingestedCount += await this.ingestMessage(tenantId, message);
            } catch (error) {
                console.error('[ChannelService] Failed to ingest message during rebuild', error);
            }
        }

        const { count } = await this.countAcceptedStreamItems([tenantId]);

        return {
            scanned: orderedMessages.length,
            ingested: ingestedCount,
            totalStreamItems: count || 0,
            filters: {
                sessionLabel: options.sessionLabel || null,
                remoteJid: options.remoteJid || null,
                from: options.from || null,
                to: options.to || null,
                limit,
            },
        };
    }

    async correctStreamItem(tenantId: string, correctedBy: string, streamItemId: string, input: StreamCorrectionInput) {
        const { data: existing, error: existingError } = await this.db
            .from('stream_items')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('id', streamItemId)
            .maybeSingle();

        if (existingError) {
            throw new Error(existingError.message);
        }

        if (!existing) {
            throw new Error('Stream item not found');
        }

        const nextPayload = {
            ...(existing.parsed_payload || {}),
            displayTitle: input.title?.trim() || existing.parsed_payload?.displayTitle || existing.parsed_payload?.title || null,
            sourceLabel: input.source ?? existing.parsed_payload?.sourceLabel ?? null,
            sourcePhone: input.sourcePhone ?? existing.parsed_payload?.sourcePhone ?? existing.source_phone ?? null,
            parseNotes: input.parseNotes?.trim() || null,
            correctedBy,
            correctedAt: new Date().toISOString(),
            isCorrected: true,
        };

        const update = {
            type: input.type ?? existing.type,
            locality: input.location?.trim() || existing.locality,
            city: input.city?.trim() || existing.city,
            price_label: input.price?.trim() || existing.price_label,
            price_numeric: typeof input.priceNumeric === 'number' ? input.priceNumeric : existing.price_numeric,
            bhk: input.bhk?.trim() || existing.bhk,
            raw_text: input.rawText?.trim() || existing.raw_text,
            source_phone: input.sourcePhone?.trim() || existing.source_phone,
            record_type: input.recordType?.trim() || existing.record_type,
            deal_type: input.dealType?.trim() || existing.deal_type,
            asset_class: input.assetClass?.trim() || existing.asset_class,
            confidence_score: typeof input.confidence === 'number' ? input.confidence : existing.confidence_score,
            parsed_payload: nextPayload,
        };

        const { data: corrected, error: correctedError } = await this.db
            .from('stream_items')
            .update(update)
            .eq('tenant_id', tenantId)
            .eq('id', streamItemId)
            .select('*')
            .single();

        if (correctedError || !corrected) {
            throw new Error(correctedError?.message || 'Failed to update stream item');
        }

        const correctionLog = {
            tenant_id: tenantId,
            stream_item_id: streamItemId,
            corrected_by: correctedBy,
            original_payload: {
                type: existing.type,
                locality: existing.locality,
                city: existing.city,
                price_label: existing.price_label,
                price_numeric: existing.price_numeric,
                bhk: existing.bhk,
                raw_text: existing.raw_text,
                source_phone: existing.source_phone,
                record_type: existing.record_type,
                deal_type: existing.deal_type,
                asset_class: existing.asset_class,
                confidence_score: existing.confidence_score,
                parsed_payload: existing.parsed_payload || {},
            },
            corrected_payload: {
                type: corrected.type,
                locality: corrected.locality,
                city: corrected.city,
                price_label: corrected.price_label,
                price_numeric: corrected.price_numeric,
                bhk: corrected.bhk,
                raw_text: corrected.raw_text,
                source_phone: corrected.source_phone,
                record_type: corrected.record_type,
                deal_type: corrected.deal_type,
                asset_class: corrected.asset_class,
                confidence_score: corrected.confidence_score,
                parsed_payload: corrected.parsed_payload || {},
            },
            correction_note: input.parseNotes?.trim() || null,
        };

        const { error: logError } = await this.db
            .from('stream_item_corrections')
            .insert(correctionLog);

        if (logError) {
            throw new Error(logError.message);
        }

        return this.mapStreamItem(corrected, tenantId);
    }

    async markChannelRead(tenantId: string, channelId: string) {
        const { error } = await this.db
            .from('channel_items')
            .update({ is_read: true })
            .eq('tenant_id', tenantId)
            .eq('channel_id', channelId)
            .eq('is_read', false);

        if (error) {
            throw new Error(error.message);
        }
    }

    async attachStreamItemToChannel(tenantId: string, channelId: string, streamItemId: string) {
        const { data: channel, error: channelError } = await this.db
            .from('broker_channels')
            .select('id, tenant_id, is_active')
            .eq('tenant_id', tenantId)
            .eq('id', channelId)
            .maybeSingle();

        if (channelError) {
            throw new Error(channelError.message);
        }

        if (!channel || !channel.is_active) {
            throw new Error('Channel not found');
        }

        const { data: streamItem, error: streamError } = await this.db
            .from('stream_items')
            .select('id, tenant_id')
            .eq('tenant_id', tenantId)
            .eq('id', streamItemId)
            .maybeSingle();

        if (streamError) {
            throw new Error(streamError.message);
        }

        if (!streamItem) {
            throw new Error('Stream item not found');
        }

        const { error } = await this.db
            .from('channel_items')
            .upsert({
                tenant_id: tenantId,
                channel_id: channelId,
                stream_item_id: streamItemId,
                matched_by: 'manual',
                match_score: 100,
                is_read: false,
                created_at: new Date().toISOString(),
            }, { onConflict: 'channel_id,stream_item_id' });

        if (error) {
            throw new Error(error.message);
        }

        return { success: true };
    }

    async ingestMessage(tenantId: string, message: RawInboundMessage) {
        const groupContext = await this.loadGroupIngestionContext(tenantId, message.remote_jid);
        const candidates = (await this.parseMessage(tenantId, message)).map((candidate) => this.applyGroupContextToCandidate(candidate, groupContext));
        if (candidates.length === 0) {
            return 0;
        }

        const qualityDecision = this.evaluateMessageQuality(message, candidates, groupContext);
        const isAccepted = qualityDecision.status === 'accepted';

        let ingestedCount = 0;
        for (const parsed of candidates) {
            if (!this.shouldPersistParsedCandidate(parsed)) {
                continue;
            }

            if (['listing', 'requirement'].includes(parsed.recordType)) {
                const windowMinutes = parsed.recordType === 'requirement' ? 24 * 60 : 10;
                const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
                const contentHash = buildStreamContentHash(parsed.rawText, parsed.sourcePhone);

                const { data: exactDupe } = await this.db
                    .from('stream_items')
                    .select('id, ingestion_status')
                    .eq('tenant_id', tenantId)
                    .eq('content_hash', contentHash)
                    .maybeSingle();

                if (exactDupe) {
                    await this.db
                        .from('stream_items')
                        .update({
                            created_at: parsed.createdAt,
                            ingestion_status: 'accepted',
                            suppressed_at: null,
                            suppression_reason: null,
                        })
                        .eq('id', exactDupe.id);
                    ingestedCount += 1;
                    continue;
                }

                if (parsed.locality && parsed.priceNumeric != null) {
                    const query = this.db
                        .from('stream_items')
                        .select('id, ingestion_status')
                        .eq('tenant_id', tenantId)
                        .eq('locality', parsed.locality)
                        .eq('record_type', parsed.recordType)
                        .gte('created_at', cutoff);

                    if (parsed.recordType === 'listing') {
                        if (parsed.sourcePhone && parsed.rawText) {
                            query.eq('source_phone', parsed.sourcePhone);
                            const contentHash = parsed.rawText
                                .toLowerCase()
                                .replace(/[^\w\s]/g, '')
                                .replace(/\s+/g, ' ')
                                .trim()
                                .slice(0, 200);
                            query.ilike('raw_text', `${contentHash}%`);
                        }
                    } else {
                        if (parsed.sourcePhone) query.eq('source_phone', parsed.sourcePhone);
                        if (parsed.rawText) query.eq('raw_text', parsed.rawText);
                    }

                    const { data: dupe } = await query
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    if (dupe) {
                        await this.db
                            .from('stream_items')
                            .update({
                                created_at: parsed.createdAt,
                                ingestion_status: 'accepted',
                                suppressed_at: null,
                                suppression_reason: null,
                            })
                            .eq('id', dupe.id);
                        ingestedCount += 1;
                        continue;
                    }
                }
            }

            const parsedPayload = {
                ...(parsed.parsedPayload || {}),
                ingestionStatus: qualityDecision.status,
                suppressionReason: qualityDecision.suppressionReason,
                qualityScore: qualityDecision.qualityScore,
                qualityMetrics: qualityDecision.metrics,
                source: String(message.source || parsed.parsedPayload?.source || 'unknown').trim() || 'unknown',
                sourceGroupId: message.sourceGroupId || parsed.sourceGroupId || message.remote_jid || null,
                sourceGroupName: message.sourceGroupName || parsed.sourceGroupName || null,
                senderJid: message.senderJid || null,
            };
            const contentHash = buildStreamContentHash(parsed.rawText, parsed.sourcePhone);
            const completeness = computeStreamCompleteness({
                locality: parsed.locality,
                bhk: parsed.bhk,
                sqft: parsed.areaSqft,
                priceNumeric: parsed.priceNumeric,
                brokerContactValid: Boolean(parsed.sourcePhone),
            });

            const { data, error } = await this.db
                .from('stream_items')
                .upsert({
                    tenant_id: tenantId,
                    session_label: message.session_label || 'workspace',
                    message_id: parsed.messageId,
                    source_message_id: String(message.id),
                    source_thread_jid: message.remote_jid || null,
                    source_group_id: parsed.sourceGroupId,
                    source_group_name: parsed.sourceGroupName,
                    source_phone: parsed.sourcePhone,
                    content_hash: contentHash,
                    raw_text: parsed.rawText,
                    type: parsed.streamType,
                    record_type: parsed.recordType,
                    locality: parsed.locality,
                    city: parsed.city,
                    bhk: parsed.bhk,
                    building_name: String(parsed.parsedPayload?.buildingName || '').trim() || null,
                    price_label: parsed.priceLabel,
                    price_numeric: parsed.priceNumeric,
                    deal_type: parsed.dealType,
                    asset_class: parsed.assetClass,
                    property_category: parsed.propertyCategory,
                    area_sqft: parsed.areaSqft,
                    furnishing: parsed.furnishing,
                    floor_number: parsed.floorNumber,
                    total_floors: parsed.totalFloors,
                    property_use: parsed.propertyUse,
                    confidence_score: parsed.confidenceScore,
                    is_global: this.isGlobalStreamCandidate(parsed, isAccepted),
                    parsed_payload: parsedPayload,
                    ingestion_status: qualityDecision.status,
                    suppression_reason: qualityDecision.suppressionReason,
                    suppressed_at: isAccepted ? null : new Date().toISOString(),
                    resolution_context: {
                        ...qualityDecision.resolutionContext,
                        qualityMetrics: qualityDecision.metrics,
                qualityScore: qualityDecision.qualityScore,
                candidateMessageId: parsed.messageId,
                streamQuality: {
                    completenessScore: completeness.completeness_score,
                    isComplete: completeness.is_complete,
                    brokerContactValid: Boolean(parsed.sourcePhone),
                },
            },
                    created_at: parsed.createdAt,
                }, { onConflict: 'tenant_id,message_id' })
                .select('*')
                .single();

            if (error || !data) {
                console.error('[ChannelService] Failed to upsert stream item', error);
                continue;
            }

            if (!isAccepted) {
                continue;
            }

            await this.upsertPublicListing(tenantId, parsed, message).catch((pe) => {
                console.error('[ChannelService] Failed to upsert public listing', pe);
            });
            await this.upsertWebsiteListing(tenantId, parsed).catch((le) => {
                console.error('[ChannelService] Failed to upsert website listing', le);
            });

            ingestedCount += 1;
            await canonicalizationService.canonicalizeStreamItem(data as any).catch((canonicalError) => {
                console.error('[ChannelService] Canonicalization failed', canonicalError);
            });
            await this.matchStreamItemToChannels(tenantId, data).catch((matchError) => {
                console.error('[ChannelService] Channel matching failed', matchError);
            });
            await this.syncInboxMatchesForStreamItem(tenantId, data).catch((matchError) => {
                if (!isInboxItemsSchemaError(matchError as any)) {
                    console.error('[ChannelService] Inbox matching failed', matchError);
                }
            });
        }

        return ingestedCount;
    }

    async previewMessageParse(tenantId: string, message: RawInboundMessage) {
        const groupContext = await this.loadGroupIngestionContext(tenantId, message.remote_jid);
        return (await this.parseMessage(tenantId, message))
            .map((candidate) => this.applyGroupContextToCandidate(candidate, groupContext));
    }

    private async upsertPublicListing(tenantId: string, parsed: ParsedStreamCandidate, message: RawInboundMessage): Promise<void> {
        const phone = parsed.sourcePhone || this.extractPhoneFromText(parsed.rawText);
        const listingType = parsed.streamType === 'Rent' ? 'listing_rent'
            : parsed.streamType === 'Sale' ? 'listing_sale'
            : 'requirement';
        const sourceMessageId = parsed.messageId;

        const publicRow = {
            source_message_id: sourceMessageId,
            source_group_id: parsed.sourceGroupId,
            source_group_name: parsed.sourceGroupName,
            listing_type: listingType,
            area: parsed.locality || null,
            sub_area: null,
            location: parsed.locality || 'Unknown',
            price: parsed.priceNumeric,
            price_type: parsed.streamType === 'Rent' ? 'monthly' : parsed.streamType === 'Sale' ? 'total' : null,
            size_sqft: parsed.areaSqft,
            furnishing: parsed.furnishing,
            bhk: this.parseBhk(parsed.bhk),
            building_name: String(parsed.parsedPayload?.buildingName || '').trim() || null,
            property_type: null,
            title: this.toTitle(parsed),
            description: parsed.rawText || '',
            raw_message: parsed.rawText || null,
            cleaned_message: null,
            sender_number: phone,
            primary_contact_name: parsed.sourceLabel || null,
            primary_contact_number: phone,
            primary_contact_wa: phone ? `91${phone.replace(/^\+?91/, '')}` : null,
            contacts: [],
            confidence: parsed.confidenceScore ?? 0.8,
            message_timestamp: parsed.createdAt || new Date().toISOString(),
            search_text: [parsed.rawText, parsed.locality, parsed.bhk, parsed.streamType].filter(Boolean).join(' '),
        };

        const { data: existingRow, error: selectError } = await this.db
            .from('public_listings')
            .select('id')
            .eq('source_message_id', sourceMessageId)
            .limit(1)
            .maybeSingle();

        if (selectError) {
            console.error('[ChannelService] public_listings lookup failed:', selectError.message, 'for', sourceMessageId);
            return;
        }

        const { error } = existingRow
            ? await this.db
                .from('public_listings')
                .update(publicRow)
                .eq('id', existingRow.id)
            : await this.db
                .from('public_listings')
                .insert(publicRow);

        if (error) {
            console.error('[ChannelService] public_listings save failed:', error.message, 'for', sourceMessageId);
        }
    }

    private async upsertWebsiteListing(tenantId: string, parsed: ParsedStreamCandidate): Promise<void> {
        const phone = parsed.sourcePhone || this.extractPhoneFromText(parsed.rawText);
        const structuredData: Record<string, unknown> = {
            bhk: parsed.bhk || null,
            locality: parsed.locality || null,
            contact_number: phone,
            source: parsed.parsedPayload?.source || null,
            source_group_id: parsed.sourceGroupId || null,
            source_group_name: parsed.sourceGroupName || null,
            sender_jid: (parsed.parsedPayload as any)?.senderJid || null,
            city: parsed.city || null,
            type: parsed.streamType?.toLowerCase?.() || null,
            deal_type: parsed.dealType || null,
            price_numeric: parsed.priceNumeric || null,
            price: parsed.priceLabel || null,
            area_sqft: parsed.areaSqft || null,
            furnishing: parsed.furnishing || null,
            floor_number: parsed.floorNumber || null,
            total_floors: parsed.totalFloors || null,
            property_use: parsed.propertyUse || null,
            asset_class: parsed.assetClass || null,
            property_category: parsed.propertyCategory || null,
            confidence: parsed.confidenceScore || null,
            title: this.toTitle(parsed),
            building: (parsed.parsedPayload as any)?.buildingName || null,
            micro_location: (parsed.parsedPayload as any)?.microLocation || null,
        };

        const { error } = await this.db.from('listings').insert({
            tenant_id: tenantId,
            source_group_id: parsed.sourceGroupId || null,
            source_group_name: parsed.sourceGroupName || null,
            structured_data: structuredData,
            raw_text: parsed.rawText || '',
            status: 'Active',
        });

        if (error) {
            console.error('[ChannelService] website listings insert failed:', error.message, 'for', parsed.messageId);
        }
    }

    private parseBhk(bhk: string | null | undefined): number | null {
        if (!bhk) return null;
        const m = String(bhk).match(/(\d+)/);
        return m ? parseInt(m[1], 10) : null;
    }

    private toTitle(parsed: ParsedStreamCandidate): string {
        const parts: string[] = [];
        if (parsed.bhk) parts.push(parsed.bhk);
        if (parsed.locality) parts.push(parsed.locality);
        if (parsed.streamType === 'Rent') parts.push('for Rent');
        else if (parsed.streamType === 'Sale') parts.push('for Sale');
        return parts.join(' ') || 'Property Listing';
    }

    private extractPhoneFromText(text: string): string | null {
        const m = text.match(/(?:\+?91)?[6-9]\d{9}/);
        return m ? m[0] : null;
    }

private async ensureStreamBackfilled(tenantId: string, sessionLabel?: string | null) {
         // Keep this path scoped and cheap. Reads should not synchronously depend on a full rebuild.
         let messagesQuery = this.db
             .from('messages')
             .select('id', { count: 'exact', head: true })
             .eq('tenant_id', tenantId);

         if (sessionLabel) {
             messagesQuery = messagesQuery.eq('session_label', sessionLabel);
         }

         const messageResult = await messagesQuery;
         const totalMessages = typeof messageResult.count === 'number' ? messageResult.count : 0;
         if (messageResult.error || totalMessages === 0) {
             return;
         }

         let streamQuery = this.db
             .from('stream_items')
             .select('id', { count: 'exact', head: true })
             .eq('tenant_id', tenantId)
             .eq('ingestion_status', 'accepted');

         if (sessionLabel) {
             streamQuery = streamQuery.eq('session_label', sessionLabel);
         }

         const streamResult = await streamQuery;
         const totalStreamItems = typeof streamResult.count === 'number' ? streamResult.count : 0;

         // Only skip backfill if we have a meaningful portion already ingested
         if (!streamResult.error && totalStreamItems >= Math.max(10, totalMessages * 0.5)) {
             return;
         }

         try {
              // Use cursor so each backfill processes messages after the latest stream item
              const { data: latestItem } = sessionLabel
                  ? await this.db
                      .from('stream_items')
                      .select('created_at')
                      .eq('tenant_id', tenantId)
                      .eq('session_label', sessionLabel)
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .maybeSingle()
                  : await this.db
                      .from('stream_items')
                      .select('created_at')
                      .eq('tenant_id', tenantId)
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .maybeSingle();

              const from = latestItem?.created_at || null;

              await this.rebuildStreamFromMessages(tenantId, {
                  limit: sessionLabel ? 2000 : 500,
                  sessionLabel: sessionLabel || null,
                  from,
              });
          } catch (error) {
              console.error('[ChannelService] Failed to backfill stream items from messages', {
                  tenantId,
                  sessionLabel: sessionLabel || null,
                  error,
              });
           }
       }

    private async maybeSendDailyBriefing(tenantId: string, email?: string | null) {
        if (!email) {
            return;
        }

        try {
            const settingsRecord = await getWorkspaceSettingsRecord(tenantId);
            if (!settingsRecord.settings.dailyBriefing) {
                return;
            }

            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const { data: items, error } = await this.db
                .from('stream_items')
                .select('id, raw_text, type, record_type, confidence_score, locality, bhk, price_label')
                .eq('tenant_id', tenantId)
                .gte('created_at', todayStart.toISOString())
                .order('confidence_score', { ascending: false })
                .limit(5);

            if (error || !items || items.length === 0) {
                return;
            }

            const topItems = items.map((item: any) => {
                const parts = [
                    item.type && `[${item.type}]`,
                    item.record_type && `(${item.record_type})`,
                    item.locality,
                    item.bhk,
                    item.price_label,
                    item.confidence_score != null && `${Math.round(item.confidence_score * 100)}%`,
                ].filter(Boolean);
                return parts.join(' ') || item.raw_text?.slice(0, 80) || 'Stream item';
            });

            await emailNotificationService.sendDailyBriefing(email, tenantId, items.length, topItems);
        } catch (err) {
            console.error('[ChannelService] Daily briefing failed', (err as Error).message);
        }
    }

    private async parseMessage(tenantId: string, message: RawInboundMessage): Promise<ParsedStreamCandidate[]> {
        try {
            const aiResult = await this.parseMessageWithAI(tenantId, message);
            if (aiResult.length > 0) {
                return aiResult;
            }
        } catch (error) {
            console.error('[ChannelService] AI stream parser failed, falling back to regex', error);
        }

        try {
            return this.parseMessageFallback(message);
        } catch (error) {
            console.error('[ChannelService] Regex fallback parser also failed', error);
            return [];
        }
    }

    private async parseMessageWithAI(tenantId: string, message: RawInboundMessage): Promise<ParsedStreamCandidate[]> {
        const rawText = String(message.text || message.text || '').trim();
        const senderLabel = String(message.sender || '').trim();

        if (!rawText || senderLabel.toUpperCase() === 'AI') {
            return [];
        }

        if (/^[^a-zA-Z0-9]/.test(rawText)) {
            return [];
        }

        const createdAt = new Date().toISOString();
        const sourcePhone = extractContactPhoneFromBody(rawText) || extractPhoneNumber(message.sender) || extractPhoneNumber(message.remote_jid);
        const bodyContactName = extractContactNameFromBody(rawText);
        const sourceLabel = bodyContactName || senderLabel || null;
        const sourceGroupId = message.remote_jid?.endsWith('@g.us') ? String(message.remote_jid) : null;
        const sourceGroupName = String(message.sourceGroupName || '').trim() || null;

        // Check locality_aliases before falling through to parser
        const commonResolution = parseIndianLocation(rawText);
        const commonLocation = commonResolution?.locality || extractIndianLocality(rawText) || '';
        const commonCity = commonResolution?.city || extractIndianCity(rawText);

        const systemPrompt = `You are PropAI's parser for raw Indian real estate WhatsApp broker messages.
A single message may contain multiple listings or requirements. Return valid JSON only. No markdown.`;

        const userPrompt = `Extract all real-estate records from this WhatsApp message.

Return ONLY this JSON:
{
  "items": [
    {
      "title": "string or null",
      "streamType": "Rent" | "Sale" | "Requirement" | "Pre-leased",
      "recordType": "listing" | "requirement",
      "dealType": "rent" | "sale" | "pre-leased" | "unknown",
      "assetClass": "residential" | "commercial" | "plot" | "unknown",
      "locality": "string or null",
      "city": "string or null",
      "bhk": "string or null",
      "priceLabel": "string or null (e.g. '45k', '3.5 Cr', '95 Lakhs')",
      "priceNumeric": number or null (full absolute INR value, e.g. 45000, 35500000),
      "price": "number or string or null (numeric value only, e.g. 45000, 3.5, 95)",
      "priceUnit": "crores or lakhs or thousands or rupees or null",
      "buildingName": "string or null",
      "microLocation": "string or null",
      "propertyCategory": "residential" | "commercial" | null,
      "areaSqft": number or null,
      "furnishing": "unfurnished" | "semi-furnished" | "fully-furnished" | "furnished" | null,
      "floorNumber": "string or null",
      "totalFloors": "string or null",
      "propertyUse": "string or null",
      "parseNotes": "string or null",
      "confidence": number,
      "rawText": "string"
    }
  ]
}

Rules:
- Split multi-listing broker blasts into separate items
- splitMultiListing() must handle ALL these patterns found in Mumbai broker groups:
  - PATTERN 1: Block separated with blank line between units, e.g. @ Building, Locality followed by 2 BHK - 781 sqft, Semi Furnished, Rent: 2L and another unit after a blank line
  - PATTERN 2: Inline CSV style, e.g. Andheri West followed by 2bhk 650sqft 95L | 3bhk 900sqft 1.4cr | 4bhk 1200sqft 2.1cr
  - PATTERN 3: Numbered list, e.g. 1) 2BHK 850sqft @1.2cr, 2) 3BHK 1100sqft @1.8cr, 3) 4BHK 1400sqft @2.5cr
  - PATTERN 4: Repeated BHK keyword without blank line separator, e.g. 2BHK sale 1.2cr Andheri, 3BHK sale 1.8cr Andheri, 4BHK sale 2.5cr Andheri
  - PATTERN 5: Dual deal type in the same message, e.g. Lease & Outright listing @ BKC-X and 2BHK Rent: 2L | Outright: 2.5cr; split into TWO records per unit, one rent and one sale
  - PATTERN 6: Floor-wise listing, e.g. Raheja Classique, Andheri West followed by 4th floor 2BHK 1.2cr, 8th floor 2BHK 1.35cr, 12th floor 3BHK 1.9cr
- Detection rule: treat a message as multi-listing if ANY of these are true:
  - Contains 2 or more BHK mentions
  - Contains 2 or more price mentions with different amounts
  - Contains a numbered list pattern such as 1. or 1) or bullet markers
  - Contains pipe | separators between property details
  - Contains multiple options or various options in the header
- Single listing messages must pass through unchanged as a single item using the original rawText
- Inherit top-level locality or section header into child listings when needed
- Detect building/project names and road/landmark references
- Normalize rent vs sale vs pre-leased correctly
- streamType "Requirement" means the sender is explicitly SEARCHING for a property (e.g. "looking for", "wanted", "need", "require", "client needs", "buyer wants")
- Messages describing a property's floor, furnishing, condition, building name, address, or amenities are listings (Rent/Sale), NOT Requirements
- priceNumeric must be full INR integer
- If price is not clearly present, return null for priceNumeric and priceLabel
- Use null instead of guessing
- Only return actual property records, not greetings or signatures

Message:
"""
${rawText}
"""`;

        const raw = await aiService.chat(userPrompt, 'Auto', 'listing_parsing', tenantId, systemPrompt);
        const parsed = parseJson<{ items?: AIParsedStreamItem[] }>(raw.text, 'Failed to parse AI stream JSON');
        const items = (() => {
            if (Array.isArray(parsed?.items) && parsed.items.length > 0) {
                return parsed.items;
            }
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const asItem = parsed as unknown as AIParsedStreamItem;
                if (asItem.bhk || asItem.title || asItem.streamType) {
                    return [asItem];
                }
            }
            return [];
        })();

        return items
            .map((item, index) => {
                const candidateText = String(item.rawText || '').trim() || rawText;
                const resolution =
                    parseIndianLocation(candidateText) ||
                    (item.locality ? parseIndianLocation(String(item.locality)) : null) ||
                    commonResolution;
                const locality = String(item.locality || resolution?.locality || commonLocation || extractIndianLocality(candidateText) || extractIndianLocality(rawText) || '').trim() || null;
                const city = String(item.city || resolution?.city || commonCity || '').trim() || null;
                const buildingName = item.buildingName ? titleCase(String(item.buildingName).trim()) : extractBuildingName(candidateText);
                const microLocation = item.microLocation ? titleCase(String(item.microLocation).trim()) : (extractMicroLocation(candidateText) || extractMicroLocation(rawText));
                const title = String(item.title || '').trim() || buildDisplayTitle(buildingName, microLocation, locality);
                const hintedStreamType =
                    item.streamType === 'Rent' || item.streamType === 'Sale' || item.streamType === 'Requirement' || item.streamType === 'Pre-leased'
                        ? item.streamType
                        : inferType(candidateText);
                const hintedDealType =
                    item.dealType === 'rent' || item.dealType === 'sale' || item.dealType === 'pre-leased' || item.dealType === 'unknown'
                        ? item.dealType
                        : extractDealType(candidateText);
                const provisionalPriceInfo = extractPriceInfo(candidateText, hintedDealType);
                const dealType = inferDealTypeFromPrice(candidateText, hintedDealType, provisionalPriceInfo.numeric);
                const priceInfo = extractPriceInfo(candidateText, dealType);
                const streamType = inferStreamTypeFromPrice(candidateText, hintedStreamType, priceInfo.numeric);
                const priceLabel = priceInfo.label || String(item.priceLabel || '').trim() || null;
                const rawAiNumeric = typeof item.priceNumeric === 'number' && Number.isFinite(item.priceNumeric) ? item.priceNumeric : null;
                const isRentType = streamType === 'Rent';
                
                let resolvedAiNumeric: number | null = null;
                if (rawAiNumeric != null && rawAiNumeric > 0) {
                    if (isRentType) {
                        if (rawAiNumeric >= 1000 && rawAiNumeric <= 10000000) {
                            resolvedAiNumeric = rawAiNumeric;
                        } else if (rawAiNumeric < 1000) {
                            resolvedAiNumeric = rawAiNumeric * 1000; // Assume thousands
                        }
                    } else {
                        if (rawAiNumeric >= 100000) {
                            resolvedAiNumeric = rawAiNumeric;
                        } else if (rawAiNumeric < 100) {
                            resolvedAiNumeric = rawAiNumeric * 10000000; // Assume crores
                        } else {
                            resolvedAiNumeric = rawAiNumeric * 100000; // Assume lakhs
                        }
                    }
                } else if (item.price != null) {
                    const priceVal = cleanNumber(item.price);
                    if (priceVal > 0) {
                        const unit = String(item.priceUnit || '').toLowerCase();
                        if (isRentType) {
                            if (unit.includes('crore')) {
                                resolvedAiNumeric = priceVal * 10000000;
                            } else if (unit.includes('lakh') || unit.includes('lac')) {
                                resolvedAiNumeric = priceVal * 100000;
                            } else if (unit.includes('thousand') || unit.includes('k')) {
                                resolvedAiNumeric = priceVal * 1000;
                            } else if (priceVal >= 1000) {
                                resolvedAiNumeric = priceVal;
                            } else {
                                resolvedAiNumeric = priceVal * 1000; // Assume thousands
                            }
                        } else {
                            if (unit.includes('crore')) {
                                resolvedAiNumeric = priceVal * 10000000;
                            } else if (unit.includes('lakh') || unit.includes('lac')) {
                                resolvedAiNumeric = priceVal * 100000;
                            } else if (priceVal >= 100) {
                                resolvedAiNumeric = priceVal; // Assume absolute
                            } else {
                                resolvedAiNumeric = priceVal * 10000000; // Assume crores
                            }
                        }
                    }
                }

                const priceNumeric = (resolvedAiNumeric != null) ? resolvedAiNumeric : priceInfo.numeric;
                const bhk = String(item.bhk || '').trim() || extractBhk(candidateText);
                const normalizedBhk = bhk === 'N/A' ? null : bhk;
                const assetClass =
                    item.assetClass === 'commercial' || item.assetClass === 'plot' || item.assetClass === 'unknown'
                        ? item.assetClass
                        : 'residential';
                const propertyCategory = item.propertyCategory === 'commercial' || assetClass === 'commercial' ? 'commercial' : 'residential';
                const areaSqft = typeof item.areaSqft === 'number' && Number.isFinite(item.areaSqft) ? item.areaSqft : extractAreaSqft(candidateText);
                const furnishing = normalizeFurnishing(item.furnishing) || normalizeFurnishing(candidateText);
                const floorNumber = String(item.floorNumber || '').trim() || extractFloorNumber(candidateText);
                const totalFloors = String(item.totalFloors || '').trim() || extractTotalFloors(candidateText);
                const propertyUse = String(item.propertyUse || '').trim() || extractPropertyUse(candidateText);
                const confidence = Math.max(0, Math.min(100, Number(item.confidence || 0))) || calculateConfidence(candidateText, {
                    location: locality,
                    price: priceLabel,
                    bhk,
                    buildingName,
                    microLocation,
                });
                const completeness = computeStreamCompleteness({
                    locality,
                    bhk: normalizedBhk,
                    sqft: areaSqft ?? null,
                    priceNumeric,
                    brokerContactValid: Boolean(sourcePhone),
                });

                return {
                    messageId: items.length > 1 ? `${String(message.id)}:${index + 1}` : String(message.id),
                    rawText: candidateText,
                    sourcePhone,
                    sourceLabel,
                    sourceGroupId,
                    sourceGroupName,
                    streamType,
                    recordType: item.recordType === 'requirement' ? 'requirement' : 'listing',
                    locality,
                    city,
                    bhk: normalizedBhk,
                    priceLabel,
                    priceNumeric,
                    dealType,
                    assetClass,
                    propertyCategory,
                    areaSqft,
                    furnishing,
                    floorNumber: floorNumber || null,
                    totalFloors: totalFloors || null,
                    propertyUse: propertyUse || null,
                    confidenceScore: confidence,
                    messageHash: buildStreamContentHash(candidateText, sourcePhone),
                    brokerContactValid: Boolean(sourcePhone),
                    completenessScore: completeness.completeness_score,
                    isComplete: completeness.is_complete,
                    createdAt,
                    parsedPayload: {
                        displayTitle: title,
                        buildingName,
                        microLocation,
                        sourcePhone,
                        sourceLabel,
                        contactName: bodyContactName,
                        contactPhone: sourcePhone,
                        normalizedText: candidateText.toLowerCase(),
                        sourceRemoteJid: message.remote_jid || null,
                        sourceMessageId: String(message.id),
                        segmentIndex: index,
                        matchedAlias: resolution?.matchedAlias || null,
                        resolutionMethod: 'ai_primary',
                        resolutionConfidence: resolution?.confidence || confidence,
                        pincode: resolution?.pincode || null,
                        propertyCategory,
                        areaSqft,
                        furnishing,
                        floorNumber: floorNumber || null,
                        totalFloors: totalFloors || null,
                        propertyUse: propertyUse || null,
                        parseNotes: item.parseNotes || null,
                        aiParsed: true,
                        source: String(message.source || 'ai').trim() || 'ai',
                        sourceGroupId,
                        sourceGroupName,
                        senderJid: message.senderJid || null,
                    },
                } satisfies ParsedStreamCandidate;
            })
            .filter((item) => Boolean(item.rawText));
    }

    private parseMessageFallback(message: RawInboundMessage): ParsedStreamCandidate[] {
        const rawText = String(message.text || message.text || '').trim();
        const senderLabel = String(message.sender || '').toUpperCase();

        if (!rawText || senderLabel === 'AI') {
            return [];
        }

        if (/^[^a-zA-Z0-9]/.test(rawText)) {
            return [];
        }

        const segments = splitMessageIntoSegments(rawText);
        const commonResolution = parseIndianLocation(rawText);
        const commonLocation = commonResolution?.locality || extractIndianLocality(rawText) || '';
        const createdAt = new Date().toISOString();
        const sourcePhone = extractContactPhoneFromBody(rawText) || extractPhoneNumber(message.sender) || extractPhoneNumber(message.remote_jid);
        const bodyContactName = extractContactNameFromBody(rawText);
        const sourceLabel = bodyContactName || String(message.sender || '').trim() || null;
        const sourceGroupId = message.remote_jid?.endsWith('@g.us') ? String(message.remote_jid) : null;
        const sourceGroupName = String(message.sourceGroupName || '').trim() || null;

        return segments.map((segment, index) => {
            const candidateText = segment.text.trim();
            const resolution = parseIndianLocation(candidateText) || commonResolution;
            const location = resolution?.locality || commonLocation || extractIndianLocality(candidateText) || null;
            const hintedDealType = extractDealType(candidateText);
            const provisionalPrice = extractPriceInfo(candidateText, hintedDealType);
            const dealType = inferDealTypeFromPrice(candidateText, hintedDealType, provisionalPrice.numeric);
            const price = extractPriceInfo(candidateText, dealType);
            const streamType = inferStreamTypeFromPrice(candidateText, segment.streamType, price.numeric);
            const bhkRaw = extractBhk(candidateText);
            const bhk = bhkRaw === 'N/A' ? null : bhkRaw;
            const buildingName = extractBuildingName(candidateText);
            const microLocation = extractMicroLocation(candidateText) || extractMicroLocation(rawText);
            const displayTitle = buildDisplayTitle(buildingName, microLocation, location);
            const assetClass = extractAssetClass(candidateText);
            const propertyCategory = assetClass === 'commercial' ? 'commercial' : 'residential';
            const areaSqft = extractAreaSqft(candidateText);
            const furnishing = normalizeFurnishing(candidateText);
            const floorNumber = extractFloorNumber(candidateText);
            const totalFloors = extractTotalFloors(candidateText);
            const propertyUse = extractPropertyUse(candidateText);
            const completeness = computeStreamCompleteness({
                locality: location,
                bhk,
                sqft: areaSqft,
                priceNumeric: price.numeric,
                brokerContactValid: Boolean(sourcePhone),
            });

            return {
                messageId: segments.length > 1 ? `${String(message.id)}:${index + 1}` : String(message.id),
                rawText: candidateText,
                sourcePhone,
                sourceLabel,
                sourceGroupId,
                sourceGroupName,
                streamType,
                recordType: segment.streamType === 'Requirement' ? 'requirement' : 'listing',
                locality: location,
                city: resolution?.city || extractIndianCity(candidateText) || null,
                bhk,
                priceLabel: price.label || null,
                priceNumeric: price.numeric,
                dealType,
                assetClass,
                propertyCategory,
                areaSqft,
                furnishing,
                floorNumber,
                totalFloors,
                propertyUse,
                confidenceScore: calculateConfidence(candidateText, {
                    location: location || '',
                    price: price.label,
                    bhk: bhk || '',
                    buildingName,
                    microLocation,
                }),
                messageHash: buildStreamContentHash(candidateText, sourcePhone),
                brokerContactValid: Boolean(sourcePhone),
                completenessScore: completeness.completeness_score,
                isComplete: completeness.is_complete,
                createdAt,
                parsedPayload: {
                    displayTitle,
                    buildingName,
                    microLocation,
                    sourcePhone,
                    sourceLabel,
                    contactName: bodyContactName,
                    contactPhone: sourcePhone,
                    normalizedText: candidateText.toLowerCase(),
                    sourceRemoteJid: message.remote_jid || null,
                    sourceMessageId: String(message.id),
                    segmentIndex: index,
                    matchedAlias: resolution?.matchedAlias || null,
                    resolutionMethod: resolution?.resolvedVia || 'unresolved',
                    resolutionConfidence: resolution?.confidence || 0,
                    pincode: resolution?.pincode || null,
                    propertyCategory,
                    areaSqft,
                    furnishing,
                    floorNumber,
                    totalFloors,
                    propertyUse,
                    source: String(message.source || 'fallback').trim() || 'fallback',
                    sourceGroupId,
                    sourceGroupName,
                    senderJid: message.senderJid || null,
                },
            };
        });
    }

    private async matchStreamItemToChannels(tenantId: string, streamItem: any) {
        const { data: channels, error } = await this.db
            .from('broker_channels')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true);

        if (error) {
            console.error('[ChannelService] Failed to load channels for matching', error);
            return;
        }

        for (const row of (channels || []) as ChannelRow[]) {
            const matchScore = this.calculateMatchScore(row, streamItem);
            if (matchScore <= 0) {
                continue;
            }

            await this.db
                .from('channel_items')
                .upsert({
                    tenant_id: tenantId,
                    channel_id: row.id,
                    stream_item_id: streamItem.id,
                    matched_by: 'rule',
                    match_score: matchScore,
                    is_read: false,
                    created_at: streamItem.created_at || new Date().toISOString(),
                }, { onConflict: 'channel_id,stream_item_id' });
        }
    }

    private getInboxPair(source: any, candidate: any): { listing: any; requirement: any } | null {
        if (!this.isOppositeRecordType(source, candidate)) {
            return null;
        }

        const sourceKind = this.getRecordKind(source);
        if (sourceKind === 'listing') {
            return { listing: source, requirement: candidate };
        }

        if (sourceKind === 'requirement') {
            return { listing: candidate, requirement: source };
        }

        return null;
    }

    private getInboxPairKey(listingId: string, requirementId: string) {
        return `${listingId}:${requirementId}`;
    }

    private collectInboxPairCandidates(rows: any[]): InboxPairCandidate[] {
        const pairMap = new Map<string, InboxPairCandidate>();

        for (const source of rows) {
            if (!this.isMatchableRecord(source)) {
                continue;
            }

            const sourcePhone = String(source.source_phone || '').trim();
            for (const candidate of rows) {
                if (String(candidate.id || '') === String(source.id || '')) {
                    continue;
                }

                const pair = this.getInboxPair(source, candidate);
                if (!pair) {
                    continue;
                }

                const candidatePhone = String(candidate.source_phone || '').trim();
                if (sourcePhone && candidatePhone && sourcePhone === candidatePhone) {
                    continue;
                }

                const result = this.calculateItemMatchScore(source, candidate);
                if (result.score <= 0) {
                    continue;
                }

                const key = this.getInboxPairKey(String(pair.listing.id), String(pair.requirement.id));
                const createdAt = pair.listing.created_at || pair.requirement.created_at || new Date().toISOString();
                const current = pairMap.get(key);
                if (!current) {
                    pairMap.set(key, {
                        listing: pair.listing,
                        requirement: pair.requirement,
                        score: result.score,
                        reasons: result.reasons,
                        createdAt,
                    });
                    continue;
                }

                const currentCreatedAt = new Date(current.createdAt || 0).getTime();
                const nextCreatedAt = new Date(createdAt || 0).getTime();
                if (result.score > current.score || (result.score === current.score && nextCreatedAt > currentCreatedAt)) {
                    pairMap.set(key, {
                        listing: pair.listing,
                        requirement: pair.requirement,
                        score: result.score,
                        reasons: result.reasons,
                        createdAt,
                    });
                }
            }
        }

        return [...pairMap.values()].sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });
    }

    private async buildInboxMatchesFromRows(tenantId: string, rows: any[], limit: number): Promise<InboxMatchRecord[]> {
        const selected = this.collectInboxPairCandidates(rows).slice(0, limit);
        const sourceMapped = this.enrichSourcePhones(
            selected.map((match) => this.mapStreamItem(match.requirement, tenantId)),
        );
        const matchedMapped = this.enrichSourcePhones(
            selected.map((match) => this.mapStreamItem(match.listing, tenantId, Boolean(match.listing.is_read))),
        );
        const enrichedMatched = await this.enrichWithIgrTransactions(matchedMapped);

        return selected.map((match, index) => ({
            id: this.getInboxPairKey(String(match.listing.id), String(match.requirement.id)),
            sourceItem: sourceMapped[index],
            matchedItem: enrichedMatched[index],
            matchScore: match.score,
            matchReasons: match.reasons,
            isRead: Boolean(match.listing.is_read),
            createdAt: match.createdAt,
        }));
    }

    private async mapInboxItemsToResponse(
        tenantId: string,
        inboxItems: Array<{
            id: string;
            tenant_id: string;
            listing_id: string;
            requirement_id: string;
            match_score: number;
            match_reasons: string[] | null;
            created_at: string;
            updated_at: string;
        }>,
    ): Promise<InboxMatchRecord[]> {
        const streamIds = Array.from(new Set(inboxItems.flatMap((item) => [item.listing_id, item.requirement_id])));
        const { data, error } = await this.readAcceptedStreamItems(this.db, [tenantId], {
            streamIds,
            limit: Math.max(streamIds.length, 1),
        });

        if (error) {
            throw new Error(error.message);
        }

        const rowMap = new Map<string, any>((data || []).map((row: any) => [String(row.id), row]));
        const completeItems = inboxItems.filter((item) => rowMap.has(item.listing_id) && rowMap.has(item.requirement_id));
        const sourceMapped = this.enrichSourcePhones(
            completeItems.map((item) => this.mapStreamItem(rowMap.get(item.requirement_id), tenantId)),
        );
        const matchedMapped = this.enrichSourcePhones(
            completeItems.map((item) => this.mapStreamItem(rowMap.get(item.listing_id), tenantId, Boolean(rowMap.get(item.listing_id)?.is_read))),
        );
        const enrichedMatched = await this.enrichWithIgrTransactions(matchedMapped);

        return completeItems.map((item, index) => ({
            id: item.id,
            sourceItem: sourceMapped[index],
            matchedItem: enrichedMatched[index],
            matchScore: Number(item.match_score || 0),
            matchReasons: Array.isArray(item.match_reasons) ? item.match_reasons : [],
            isRead: Boolean(rowMap.get(item.listing_id)?.is_read),
            createdAt: item.updated_at || item.created_at,
        }));
    }

    private async syncInboxMatchesForTenant(tenantId: string): Promise<void> {
        const { data, error } = await this.readAcceptedStreamItems(this.db, [tenantId], {
            limit: 1500,
            orderByCreatedAt: true,
        });
        if (error) {
            throw new Error(error.message);
        }

        const rows = Array.isArray(data) ? data : [];
        const pairCandidates = this.collectInboxPairCandidates(rows);
        if (pairCandidates.length === 0) {
            return;
        }

        const now = new Date().toISOString();
        const payload = pairCandidates.map((pair) => ({
            tenant_id: tenantId,
            listing_id: pair.listing.id,
            requirement_id: pair.requirement.id,
            match_score: pair.score,
            match_reasons: pair.reasons,
            created_at: pair.createdAt,
            updated_at: now,
        }));

        const { error: upsertError } = await this.db
            .from('inbox_items')
            .upsert(payload, { onConflict: 'tenant_id,listing_id,requirement_id' });

        if (upsertError) {
            if (isInboxItemsSchemaError(upsertError)) {
                return;
            }
            throw new Error(upsertError.message);
        }
    }

    private async syncInboxMatchesForStreamItem(tenantId: string, streamItem: any): Promise<void> {
        if (!this.isMatchableRecord(streamItem)) {
            return;
        }

        const { data, error } = await this.readAcceptedStreamItems(this.db, [tenantId], {
            limit: 1500,
            orderByCreatedAt: true,
        });
        if (error) {
            throw new Error(error.message);
        }

        const rows = Array.isArray(data) ? data : [];
        const relevantRows = rows.filter((row: any) =>
            String(row.id) === String(streamItem.id) || this.isOppositeRecordType(streamItem, row),
        );
        const pairCandidates = this.collectInboxPairCandidates(relevantRows)
            .filter((pair) => String(pair.listing.id) === String(streamItem.id) || String(pair.requirement.id) === String(streamItem.id));

        if (pairCandidates.length === 0) {
            return;
        }

        const now = new Date().toISOString();
        const payload = pairCandidates.map((pair) => ({
            tenant_id: tenantId,
            listing_id: pair.listing.id,
            requirement_id: pair.requirement.id,
            match_score: pair.score,
            match_reasons: pair.reasons,
            created_at: pair.createdAt,
            updated_at: now,
        }));

        const { error: upsertError } = await this.db
            .from('inbox_items')
            .upsert(payload, { onConflict: 'tenant_id,listing_id,requirement_id' });

        if (upsertError) {
            if (isInboxItemsSchemaError(upsertError)) {
                return;
            }
            throw new Error(upsertError.message);
        }
    }

    private async backfillChannelMatches(tenantId: string, channelId: string) {
        const { data: channel, error: channelError } = await this.db
            .from('broker_channels')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('id', channelId)
            .maybeSingle();

        if (channelError || !channel) {
            return;
        }

        const { data: streamItems, error: itemsError } = await this.readAcceptedStreamItems(this.db, [tenantId], {
            limit: 200,
            orderByCreatedAt: true,
        });

        if (itemsError) {
            return;
        }

        for (const streamItem of streamItems || []) {
            const matchScore = this.calculateMatchScore(channel as ChannelRow, streamItem);
            if (matchScore <= 0) {
                continue;
            }

            await this.db
                .from('channel_items')
                .upsert({
                    tenant_id: tenantId,
                    channel_id: channelId,
                    stream_item_id: streamItem.id,
                    matched_by: 'rule',
                    match_score: matchScore,
                    is_read: false,
                    created_at: streamItem.created_at || new Date().toISOString(),
                }, { onConflict: 'channel_id,stream_item_id' });
        }
    }

    private getRecordKind(item: any) {
        const recordType = normalize(item?.record_type || '');
        if (recordType === 'listing' || recordType === 'requirement') {
            return recordType;
        }

        const streamType = normalize(item?.type || '');
        return streamType === 'requirement' ? 'requirement' : 'listing';
    }

    private isMatchableRecord(item: any) {
        const kind = this.getRecordKind(item);
        return kind === 'listing' || kind === 'requirement';
    }

    private isOppositeRecordType(source: any, candidate: any) {
        return this.getRecordKind(source) !== this.getRecordKind(candidate);
    }

    private calculateItemMatchScore(source: any, candidate: any): { score: number; reasons: string[] } {
        const sourceKind = this.getRecordKind(source);
        const candidateKind = this.getRecordKind(candidate);
        if (sourceKind === candidateKind) {
            return { score: 0, reasons: [] };
        }

        const sourceLocality = normalize(source.locality || source.parsed_payload?.locality || '');
        const candidateLocality = normalize(candidate.locality || candidate.parsed_payload?.locality || '');
        const sourceRaw = normalize(source.raw_text || '');
        const candidateRaw = normalize(candidate.raw_text || '');
        const reasons: string[] = [];
        let score = 0;

        if (sourceLocality && candidateLocality) {
            if (sourceLocality === candidateLocality || sourceLocality.includes(candidateLocality) || candidateLocality.includes(sourceLocality)) {
                score += 40;
                reasons.push(`Locality: ${candidate.locality || source.locality}`);
            } else if (!sourceRaw.includes(candidateLocality) && !candidateRaw.includes(sourceLocality)) {
                return { score: 0, reasons: [] };
            }
        } else if (sourceLocality || candidateLocality) {
            const term = sourceLocality || candidateLocality;
            if (sourceRaw.includes(term) || candidateRaw.includes(term)) {
                score += 20;
                reasons.push('Locality mentioned');
            }
        }

        const sourceDeal = normalize(source.deal_type || '');
        const candidateDeal = normalize(candidate.deal_type || '');
        if (sourceDeal && candidateDeal) {
            if (sourceDeal !== candidateDeal) return { score: 0, reasons: [] };
            score += 10;
            reasons.push(`Deal: ${candidate.deal_type || source.deal_type}`);
        }

        const sourceCategory = normalize(source.property_category || '');
        const candidateCategory = normalize(candidate.property_category || '');
        if (sourceCategory && candidateCategory) {
            if (sourceCategory !== candidateCategory) return { score: 0, reasons: [] };
            score += 8;
        }

        const sourceAsset = normalize(source.asset_class || source.parsed_payload?.assetClass || '');
        const candidateAsset = normalize(candidate.asset_class || candidate.parsed_payload?.assetClass || '');
        if (sourceAsset && candidateAsset) {
            if (sourceAsset !== candidateAsset) return { score: 0, reasons: [] };
            score += 8;
            reasons.push(`Asset: ${candidate.asset_class || source.asset_class}`);
        }

        const sourceBhk = normalize(source.bhk || '');
        const candidateBhk = normalize(candidate.bhk || '');
        if (sourceBhk && candidateBhk) {
            if (sourceBhk !== candidateBhk) return { score: 0, reasons: [] };
            score += 15;
            reasons.push(`${candidate.bhk || source.bhk}`);
        }

        const listing = sourceKind === 'listing' ? source : candidate;
        const requirement = sourceKind === 'requirement' ? source : candidate;
        const listingPrice = Number(listing.price_numeric);
        const requirementPrice = Number(requirement.price_numeric);
        if (Number.isFinite(listingPrice) && listingPrice > 0 && Number.isFinite(requirementPrice) && requirementPrice > 0) {
            if (listingPrice > requirementPrice * 1.1) {
                return { score: 0, reasons: [] };
            }

            const ratio = Math.min(listingPrice, requirementPrice) / Math.max(listingPrice, requirementPrice);
            score += ratio >= 0.85 ? 18 : 10;
            reasons.push('Budget fit');
        }

        const confidence = Math.max(0, Math.min(100, Number(candidate.confidence_score || 0)));
        score += Math.round(confidence / 10);

        if (score < 35) {
            return { score: 0, reasons: [] };
        }

        return { score, reasons: reasons.slice(0, 4) };
    }

    private calculateMatchScore(channel: ChannelRow, streamItem: any) {
        const haystack = normalize([
            streamItem.raw_text,
            streamItem.locality,
            streamItem.city,
            streamItem.bhk,
            streamItem.price_label,
            streamItem.deal_type,
            streamItem.asset_class,
            streamItem.record_type,
        ].join(' '));

        const requiredRecordTypes = uniqueNormalized(channel.record_types || []);
        if (requiredRecordTypes.length > 0 && !requiredRecordTypes.includes(normalize(streamItem.record_type))) {
            return 0;
        }

        const dealTypes = uniqueNormalized(channel.deal_types || []);
        if (dealTypes.length > 0 && !dealTypes.includes(normalize(streamItem.deal_type))) {
            return 0;
        }

        const assetClasses = uniqueNormalized(channel.asset_classes || []);
        if (assetClasses.length > 0 && !assetClasses.includes(normalize(streamItem.asset_class))) {
            return 0;
        }

        const bhkValues = uniqueNormalized(channel.bhk_values || []);
        if (bhkValues.length > 0 && !bhkValues.includes(normalize(streamItem.bhk))) {
            return 0;
        }

        if (typeof channel.budget_min === 'number' && typeof streamItem.price_numeric === 'number' && streamItem.price_numeric < channel.budget_min) {
            return 0;
        }

        if (typeof channel.budget_max === 'number' && typeof streamItem.price_numeric === 'number' && streamItem.price_numeric > channel.budget_max) {
            return 0;
        }

        if (Number(channel.confidence_min || 0) > Number(streamItem.confidence_score || 0)) {
            return 0;
        }

        const excludedKeywords = uniqueNormalized(channel.keywords_exclude || []);
        if (excludedKeywords.some((term) => haystack.includes(term))) {
            return 0;
        }

        const localityTerms = uniqueNormalized(channel.localities || []);
        const keywordTerms = uniqueNormalized(channel.keywords_include || []);

        const localityHits = localityTerms.filter((term) => haystack.includes(term)).length;
        const keywordHits = keywordTerms.filter((term) => haystack.includes(term)).length;

        if (localityTerms.length === 0 && keywordTerms.length === 0 && requiredRecordTypes.length === 0 && dealTypes.length === 0) {
            return 0;
        }

        if (localityTerms.length > 0 && localityHits === 0) {
            return 0;
        }

        if (keywordTerms.length > 0 && keywordHits === 0 && localityTerms.length === 0) {
            return 0;
        }

        let score = 0;
        score += localityHits * 4;
        score += keywordHits * 2;
        if (requiredRecordTypes.length > 0) score += 2;
        if (dealTypes.length > 0) score += 2;
        if (bhkValues.length > 0) score += 1;
        if (assetClasses.length > 0) score += 1;

        return score;
    }

    private async generateUniqueSlug(tenantId: string, name: string) {
        const baseSlug = slugify(name);
        let candidate = baseSlug;
        let suffix = 2;

        while (true) {
            const { data } = await this.db
                .from('broker_channels')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('slug', candidate)
                .maybeSingle();

            if (!data) {
                return candidate;
            }

            candidate = `${baseSlug}-${suffix}`;
            suffix += 1;
        }
    }

    private deriveChannelName(localities: string[], keywords: string[], channelType: ChannelType) {
        const locality = localities[0];
        const keyword = keywords[0];
        if (locality && keyword) {
            return `${titleCase(locality)} ${keyword}`.trim();
        }
        if (locality) {
            return `${titleCase(locality)} ${channelType === 'requirement' ? 'buyers' : channelType === 'listing' ? 'listings' : 'channel'}`.trim();
        }
        if (keyword) {
            return titleCase(keyword);
        }
        return 'Personal channel';
    }

    private inferChannelType(recordTypes: string[]) {
        if (recordTypes.includes('requirement')) return 'requirement';
        if (recordTypes.includes('listing')) return 'listing';
        return 'mixed';
    }

    private async getChannelCounts(channelIds: string[]) {
        if (channelIds.length === 0) {
            return new Map<string, { unreadCount: number; itemCount: number }>();
        }

        const { data, error } = await this.db
            .from('channel_items')
            .select('channel_id, is_read')
            .in('channel_id', channelIds);

        if (error) {
            if (isMissingSchemaEntityError(error.message)) {
                return new Map<string, { unreadCount: number; itemCount: number }>();
            }
            throw new Error(error.message);
        }

        const counts = new Map<string, { unreadCount: number; itemCount: number }>();
        for (const channelId of channelIds) {
            counts.set(channelId, { unreadCount: 0, itemCount: 0 });
        }

        for (const item of data || []) {
            const current = counts.get(item.channel_id) || { unreadCount: 0, itemCount: 0 };
            current.itemCount += 1;
            if (!item.is_read) {
                current.unreadCount += 1;
            }
            counts.set(item.channel_id, current);
        }

        return counts;
    }

    private mapChannelRow(row: ChannelRow, counts?: { unreadCount: number; itemCount: number }): PersonalChannelRecord {
        return {
            id: row.id,
            name: row.name,
            slug: row.slug,
            channelType: row.channel_type,
            localities: coerceJsonArray(row.localities),
            keywords: coerceJsonArray(row.keywords_include),
            keywordsExclude: coerceJsonArray(row.keywords_exclude),
            dealTypes: coerceJsonArray(row.deal_types),
            recordTypes: coerceJsonArray(row.record_types),
            bhkValues: coerceJsonArray(row.bhk_values),
            assetClasses: coerceJsonArray(row.asset_classes),
            budgetMin: row.budget_min,
            budgetMax: row.budget_max,
            confidenceMin: Number(row.confidence_min || 0),
            pinned: Boolean(row.pinned),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            unreadCount: counts?.unreadCount || 0,
            itemCount: counts?.itemCount || 0,
        };
    }

    private mapStreamItem(item: any, currentTenantId: string, isRead?: boolean): StreamItemRecord {
        const rawText = String(item.raw_text || '');
        const locality = String(item.locality || '').trim();
        const dealType = String(item.deal_type || '').trim() || extractDealType(rawText);
        const inferredBhk = String(item.bhk || '').trim() || extractBhk(rawText);
        const inferredBuildingName = String(item.parsed_payload?.buildingName || '').trim() || extractBuildingName(rawText);
        const inferredMicroLocation = String(item.parsed_payload?.microLocation || '').trim() || extractMicroLocation(rawText);
        const inferredTitle = buildDisplayTitle(inferredBuildingName, inferredMicroLocation, locality || 'Mumbai market');
        const propertyCategory = item.property_category === 'commercial' ? 'commercial' : 'residential';
        const areaSqft = item.area_sqft != null && Number.isFinite(Number(item.area_sqft))
            ? Number(item.area_sqft)
            : extractAreaSqft(rawText);
        const sourcePhone =
            normaliseIndianPhone(item.source_phone) ||
            normaliseIndianPhone(item.parsed_payload?.sourcePhone) ||
            normaliseIndianPhone(item.parsed_payload?.contactPhone) ||
            extractContactPhoneFromBody(rawText) ||
            null;
        const brokerName =
            item.broker_name ||
            item.parsed_payload?.brokerName ||
            item.parsed_payload?.sender_name ||
            item.parsed_payload?.contactName ||
            null;
        const brokerCompany =
            item.parsed_payload?.brokerCompany ||
            item.parsed_payload?.company ||
            null;
        const parsedSource = String(item.parsed_payload?.source || '').trim().toLowerCase();
        const source =
            parsedSource === 'group_passive'
                ? 'Group passive'
                : (
                    item.parsed_payload?.contactName ||
                    item.parsed_payload?.sourceLabel ||
                    brokerName ||
                    brokerCompany ||
                    'Broker contact'
                );

        return {
            id: String(item.id),
            type: (item.type || 'Sale') as StreamType,
            title: item.parsed_payload?.displayTitle || item.parsed_payload?.title || inferredTitle,
            location: locality || 'Mumbai market',
            buildingName: inferredBuildingName || null,
            microLocation: inferredMicroLocation || null,
            city: item.city || undefined,
            price: String(item.price_label || '').trim() || '',
            priceNumeric: item.price_numeric != null ? Number(item.price_numeric) : null,
            bhk: inferredBhk,
            propertyCategory,
            areaSqft,
            furnishing: normalizeFurnishing(item.furnishing) || normalizeFurnishing(item.parsed_payload?.furnishing) || normalizeFurnishing(rawText),
            floorNumber: String(item.floor_number || '').trim() || extractFloorNumber(rawText),
            totalFloors: String(item.total_floors || '').trim() || extractTotalFloors(rawText),
            propertyUse: String(item.property_use || '').trim() || extractPropertyUse(rawText),
            posted: formatPostedTime(item.created_at),
            createdAt: item.created_at,
            source,
            sourcePhone,
            brokerName,
            brokerCompany,
            waLink: generateWaLink(item, brokerName, sourcePhone),
            isNetworkItem: String(item.tenant_id || '') !== currentTenantId,
            confidence: Number(item.confidence_score || 0),
            description: item.raw_text || '',
            rawText: item.raw_text || '',
            recordType: item.record_type || 'unknown',
            dealType,
            assetClass: item.asset_class || 'unknown',
            parseNotes: item.parsed_payload?.parseNotes || null,
            isCorrected: Boolean(item.parsed_payload?.isCorrected),
            isRead,
        };
    }

    private async enrichWithIgrTransactions(items: StreamItemRecord[]): Promise<StreamItemRecord[]> {
        if (!Array.isArray(items) || items.length === 0) {
            return items;
        }

        const lookupCandidates = items.filter((item) =>
            item.recordType === 'listing' &&
            String(item.buildingName || '').trim() &&
            String(item.location || '').trim()
        );

        if (lookupCandidates.length === 0) {
            return items;
        }

        const cache = new Map<string, IgrTransactionPreview[]>();
        const uniqueCandidates = new Map<string, { buildingName: string; location: string }>();
        const maxCandidates = 2;
        const cacheTtlMs = 10 * 60 * 1000;

        for (const item of lookupCandidates) {
            const buildingName = String(item.buildingName || '').trim();
            const location = String(item.location || '').trim();
            const key = `${normalize(buildingName)}|${normalize(location)}`;
            if (key && !uniqueCandidates.has(key)) {
                uniqueCandidates.set(key, { buildingName, location });
                if (uniqueCandidates.size >= maxCandidates) {
                    break;
                }
            }
        }

        try {
            await Promise.all(
                Array.from(uniqueCandidates.entries()).map(async ([key, candidate]) => {
                    const cached = this.igrEnrichmentCache.get(key);
                    if (cached && cached.expiresAt > Date.now()) {
                        cache.set(key, cached.transactions);
                        return;
                    }

                    const transactions = await igrQueryService.getRecentTransactionsForListing(
                        candidate.buildingName,
                        candidate.location,
                        3,
                    );
                    cache.set(key, transactions);
                    this.igrEnrichmentCache.set(key, {
                        transactions,
                        expiresAt: Date.now() + cacheTtlMs,
                    });
                }),
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || '');
            if (!isMissingSchemaEntityError(message) && !/igr_transactions|building_name|reg_date|price_per_sqft|consideration/i.test(message)) {
                console.warn('[ChannelService] Failed to enrich stream with IGR transactions:', message);
            }
            return items;
        }

        return items.map((item) => {
            const buildingName = String(item.buildingName || '').trim();
            const location = String(item.location || '').trim();
            if (!buildingName || !location) {
                return item;
            }

            const key = `${normalize(buildingName)}|${normalize(location)}`;
            const igrTransactions = cache.get(key);
            if (!igrTransactions?.length) {
                return item;
            }

            return {
                ...item,
                igrTransactions,
            };
        });
    }

    private rankStreamItems(items: StreamItemRecord[]): StreamItemRecord[] {
        if (!Array.isArray(items) || items.length === 0) return items;

        // Count how many items per source for source_count factor
        const sourceCounts = new Map<string, number>();
        for (const item of items) {
            const key = item.sourcePhone || item.source || 'unknown';
            sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1);
        }
        const maxSourceCount = Math.max(1, ...sourceCounts.values());

        const now = Date.now();
        const ranked = items.map((item) => {
            const confidence = Math.max(0, Math.min(1, (item.confidence || 0) / 100));
            const sourceCount = sourceCounts.get(item.sourcePhone || item.source || 'unknown') || 1;
            const sourceCountScore = Math.min(1, sourceCount / maxSourceCount);

            const ageHours = (now - new Date(item.createdAt).getTime()) / (1000 * 60 * 60);
            const recencyScore = Math.max(0, Math.min(1, 1 - (ageHours / 720)));

            return {
                item,
                rank: (confidence * 0.4) + (sourceCountScore * 0.3) + (recencyScore * 0.3),
            };
        });

        ranked.sort((a, b) => b.rank - a.rank);
        return ranked.map((r) => r.item);
    }

    private enrichSourcePhones(items: StreamItemRecord[]) {
        if (!Array.isArray(items)) return [];

        const sourcePhoneMap = new Map<string, string>();

        for (const item of items) {
            const sourcePhone = (item as StreamItemRecord & { sourcePhone?: string | null }).sourcePhone;
            if (!sourcePhone) {
                continue;
            }

            const key = normalizeSourceKey(item.source);
            if (key && !sourcePhoneMap.has(key)) {
                sourcePhoneMap.set(key, sourcePhone);
            }
        }

        return items.map((item) => {
            if (item.sourcePhone) {
                return item;
            }

            const recoveredPhone =
                sourcePhoneMap.get(normalizeSourceKey(item.source)) ||
                extractContactPhoneFromBody(item.description);

            if (!recoveredPhone) {
                return item;
            }

            return {
                ...item,
                sourcePhone: recoveredPhone,
                waLink: item.waLink || generateWaLink({
                    bhk: item.bhk,
                    locality: item.location,
                    price_label: item.price,
                    record_type: item.recordType,
                    parsed_payload: {},
                }, item.brokerName || null, recoveredPhone),
            };
        });
    }

    private async buildQueryRawTextOnly(readClient: any, tenantIds: string[], searchQuery: string, acceptedOnly: boolean, limit?: number) {
        const pattern = escapePostgrestPattern(searchQuery);
        let query = readClient
            .from('stream_items')
            .select('*')
            .in('tenant_id', tenantIds)
            .ilike('raw_text', `%${pattern}%`);

        if (acceptedOnly) {
            query = query.eq('ingestion_status', 'accepted');
        }

        // Quality filters
        query = query.not('locality', 'in', '("Mumbai market","Mumbai","Navi Mumbai","Thane","Pune")');
        query = query.or('type.neq.Rent,price_numeric.lte.500000000,price_numeric.is.null');
        query = query.or('type.neq.Rent,price_numeric.lte.5000000,price_numeric.is.null');
        query = query.or('type.neq.Sale,price_numeric.lte.500000000,price_numeric.is.null');

        query = query.order('created_at', { ascending: false });

        if (typeof limit === 'number') {
            query = query.limit(limit);
        }

        return query;
    }
}

export const channelService = new ChannelService();
