import { createSupabaseAnonClient, supabase, supabaseAdmin } from '../config/supabase';
import { aiService } from './aiService';
import { canonicalizationService } from './canonicalizationService';
import { extractIndianCity, extractIndianLocality, parseIndianLocation } from '../utils/locationParser';

type ChannelType = 'listing' | 'requirement' | 'mixed';
type StreamType = 'Rent' | 'Sale' | 'Requirement' | 'Pre-leased';

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
    city?: string;
    price: string;
    priceNumeric?: number | null;
    bhk: string;
    posted: string;
    rawText?: string;
    source: string;
    sourcePhone?: string | null;
    confidence: number;
    description: string;
    createdAt: string;
    recordType: string;
    dealType: string;
    assetClass: string;
    parseNotes?: string | null;
    isCorrected?: boolean;
    isRead?: boolean;
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

const titleCase = (value: string) => {
    return value.split(' ').map(word => {
        if (word.length === 0) return word;
        return word[0].toUpperCase() + word.slice(1);
    }).join(' ');
};

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

function isMissingSchemaEntityError(message?: string | null) {
    const normalized = String(message || '').toLowerCase();
    return (
        normalized.includes(`could not find the table 'public.whatsapp_groups'`) ||
        normalized.includes('schema cache') ||
        normalized.includes('does not exist')
    );
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
    const raw = String(value || '').split('@')[0].split('').filter(c => c >= '0' && c <= '9').join('');
    return raw.length >= 10 ? raw : null;
};

const extractContactPhoneFromBody = (text: string) => {
    // Extract phone numbers without regex
    // Look for sequences that could be phone numbers (10+ digits, optionally starting with +91 or 91)
    const words = text.split(/\s+/); // Simple split, not using regex patterns
    let lastPhone = null;
    
    for (const word of words) {
        // Clean the word - remove common separators
        let cleaned = word;
        // Remove +91 or 91 prefix
        if (cleaned.startsWith('+91')) cleaned = cleaned.slice(3);
        else if (cleaned.startsWith('91') && cleaned.length > 10) cleaned = cleaned.slice(2);
        // Remove dashes and spaces
        cleaned = cleaned.split('-').join('').split(' ').join('');
        
        // Check if it looks like a phone number (10 digits starting with 6-9)
        const digits = cleaned.split('').filter(c => c >= '0' && c <= '9').join('');
        if (digits.length >= 10) {
            const last10 = digits.slice(-10);
            if (last10[0] >= '6' && last10[0] <= '9') {
                lastPhone = last10;
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

const normalizeFurnishing = (value?: string | null) => {
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

const extractFloorNumber = (text: string) => {
    const match = text.match(/\b(\d{1,2}(?:st|nd|rd|th)?|\w+)\s*floor\b/i);
    return match?.[1] ? String(match[1]).trim() : null;
};

const extractTotalFloors = (text: string) => {
    const match = text.match(/\b(?:out of|\/)\s*(\d{1,2})\s*floors?\b/i) || text.match(/\b(\d{1,2})\s*storey\b/i);
    return match?.[1] ? String(match[1]).trim() : null;
};

const extractPropertyUse = (text: string) => {
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
    
    // Check for pre-leased (with or without hyphen/space)
    if (normalized.includes('pre leased') || normalized.includes('pre-leased') || 
        normalized.includes('yield') || normalized.includes('tenant in place')) {
        return 'Pre-leased';
    }
    
    // Check for requirement keywords
    const requirementWords = ['requirement', 'looking for', 'need ', 'wanted', 'client wants', 'tenant wants', 'buyer wants'];
    if (requirementWords.some(w => normalized.includes(w))) {
        return 'Requirement';
    }
    
    // Check for rent keywords
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

const moneyUnitToInr = (amount: number, unit: string) => {
    const normalizedUnit = String(unit || '').toLowerCase();
    if (normalizedUnit === 'cr' || normalizedUnit === 'crore') {
        return amount * 10000000;
    }
    if (normalizedUnit === 'l' || normalizedUnit === 'lac' || normalizedUnit === 'lakh') {
        return amount * 100000;
    }
    if (normalizedUnit === 'k' || normalizedUnit === 'thousand') {
        return amount * 1000;
    }
    if (normalizedUnit === 'm' || normalizedUnit === 'mn' || normalizedUnit === 'million') {
        return amount * 1000000;
    }
    return amount;
};

const formatMoneyLabel = (amount: number, unit: string, isRent: boolean) => {
    const normalizedUnit = unit.toLowerCase();
    const compact =
        normalizedUnit === 'cr' || normalizedUnit === 'crore'
            ? `${amount} Cr`
            : normalizedUnit === 'l' || normalizedUnit === 'lac' || normalizedUnit === 'lakh'
                ? `${amount} L`
                : `${amount} K`;

    return isRent ? `â‚¹${compact}/mo` : `â‚¹${compact}`;
};

const extractPriceInfo = (text: string, dealTypeHint?: string) => {
    const lower = text.toLowerCase();
    
    // Check if it's rent
    const isRent = dealTypeHint === 'rent' || 
        lower.includes('rent') || lower.includes('rental') ||
        lower.includes('lease') || lower.includes(' pm') || lower.includes('/month') ||
        lower.includes('per month') || lower.includes(' r') || lower.includes('-r');
    
    // Extract price tokens without regex
    const words = text.split(/\s+/);
    const priceMatches: Array<{
        amount: number;
        unit: string;
        index: number;
        raw: string;
        numeric: number | null;
        score: number;
    }> = [];
    
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const lowerWord = word.toLowerCase();
        
        // Check for price patterns
        let amount = '';
        let unit = '';
        
        // Check if word starts with rs, inr, ₹
        let valuePart = lowerWord;
        if (valuePart.startsWith('rs') || valuePart.startsWith('inr') || valuePart.startsWith('₹')) {
            valuePart = valuePart.slice(2).trim();
        }
        
        // Extract digits and decimal
        let digits = '';
        for (const c of valuePart) {
            if (c >= '0' && c <= '9' || c === '.') {
                digits += c;
            } else {
                break;
            }
        }
        
        if (digits.length === 0) continue;
        
        amount = digits;
        const remaining = valuePart.slice(digits.length).trim();
        
        // Check for unit in same word or next word
        const units = ['cr', 'crore', 'l', 'lac', 'lakh', 'k', 'thousand', 'm', 'mn', 'million'];
        let foundUnit = '';
        
        for (const u of units) {
            if (remaining.startsWith(u)) {
                foundUnit = u;
                break;
            }
        }
        
        if (!foundUnit && i + 1 < words.length) {
            const nextWord = words[i + 1].toLowerCase();
            for (const u of units) {
                if (nextWord === u || nextWord.startsWith(u)) {
                    foundUnit = u;
                    break;
                }
            }
        }
        
        if (foundUnit) {
            unit = foundUnit;
            const numAmount = Number(amount);
            if (!Number.isNaN(numAmount)) {
                const raw = word;
                const start = text.indexOf(word);
                const context = lower.slice(Math.max(0, start - 18), Math.min(lower.length, start + raw.length + 18));
                
                // Check context for rent/deposit
                const rentContext = context.includes(' r') || context.includes('-r') || 
                    context.includes('rent') || context.includes('pm') || 
                    context.includes('per month') || context.includes('/month') || 
                    context.includes('lease');
                const depositContext = context.includes(' d') || context.includes('-d') || 
                    context.includes('deposit') || context.includes('dep');
                
                priceMatches.push({
                    amount: numAmount,
                    unit: unit,
                    index: start,
                    raw: raw,
                    numeric: moneyUnitToInr(numAmount, unit),
                    score: (rentContext ? 4 : 0) + (depositContext ? -3 : 0)
                });
            }
        }
    }
    
    if (priceMatches.length === 0) {
        return { label: 'Unspecified', numeric: null };
    }
    
    const chosen = priceMatches
        .sort((left, right) => (isRent ? right.score - left.score : 0) || ((right.numeric || 0) - (left.numeric || 0)))
        .find((entry) => !isRent || entry.score >= 0) || priceMatches[0];
    
    return {
        label: formatMoneyLabel(chosen.amount, chosen.unit, isRent),
        numeric: chosen.numeric,
    };
};

const extractBhk = (text: string) => {
    // Extract BHK patterns without regex
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
        const word = words[i].toLowerCase();
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

const buildDisplayTitle = (buildingName: string | null, microLocation: string | null, locality: string) => {
    if (buildingName && microLocation) {
        return `${buildingName}, ${microLocation}`;
    }

    if (buildingName) {
        return `${buildingName}, ${locality}`;
    }

    if (microLocation && microLocation.toLowerCase() !== locality.toLowerCase()) {
        return microLocation;
    }

    return locality;
};

const extractDealType = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes('pre leased') || lower.includes('pre-leased')) return 'pre-leased';
    if (lower.includes('rent') || lower.includes('lease') || 
        lower.includes('leave and license') || lower.includes('leave & license') ||
        lower.includes('l&l') || lower.includes(' ll') || lower.endsWith(' ll')) {
        return 'rent';
    }
    return 'sale';
};

const extractAssetClass = (text: string) => {
    const lower = text.toLowerCase();
    const commercialWords = ['office', 'shop', 'showroom', 'warehouse', 'commercial'];
    if (commercialWords.some(w => lower.includes(w))) return 'commercial';
    if (lower.includes('pre leased') || lower.includes('pre-leased')) return 'commercial';
    return 'residential';
};

const SECTION_TYPE_KEYWORDS: Array<{ keywords: string[]; type: StreamType }> = [
    { keywords: ['pre leased', 'pre-leased'], type: 'Pre-leased' },
    { keywords: ['requirement'], type: 'Requirement' },
    { keywords: ['rent', 'rental', 'lease', 'l&l', ' ll', 'll '], type: 'Rent' },
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
        let text = currentLines.map(sanitizeLine).filter(Boolean).join(' ');
        if (text && currentLocalityHint) {
            // Check if locality is already in text
            const normalizedText = normalize(text);
            const normalizedLocality = normalize(currentLocalityHint);
            if (!normalizedText.includes(normalizedLocality)) {
                text = `${currentLocalityHint} — ${text}`;
            }
        }
        if (text) {
            segments.push({ text, streamType: currentType });
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

const calculateConfidence = (text: string, item: { location: string; price: string; bhk: string; buildingName?: string | null; microLocation?: string | null }) => {
    let score = 48;
    if (item.location !== 'Location not parsed yet') score += 16;
    if (item.price !== 'Unspecified') score += 14;
    if (item.bhk !== 'N/A') score += 10;
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
    locality: string;
    city: string;
    bhk: string;
    priceLabel: string;
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
    remote_jid?: string | null;
    sender?: string | null;
    text?: string | null;
    timestamp?: string | null;
    created_at?: string | null;
};

type StreamCorrectionInput = {
    type?: StreamType;
    location?: string;
    city?: string;
    price?: string;
    priceNumeric?: number | null;
    bhk?: string;
    source?: string;
    sourcePhone?: string | null;
    recordType?: string;
    dealType?: string;
    assetClass?: string;
    confidence?: number;
    parseNotes?: string | null;
};

export class ChannelService {
    private readonly db = supabaseAdmin ?? supabase;

    private isGlobalStreamCandidate(parsed: ParsedStreamCandidate) {
        return typeof parsed.priceNumeric === 'number'
            && Number.isFinite(parsed.priceNumeric)
            && parsed.priceNumeric > 0
            && Number(parsed.confidenceScore || 0) > 0.6;
    }

    private shouldPersistParsedCandidate(parsed: ParsedStreamCandidate) {
        return true;
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
        await this.ensureStreamBackfilled(tenantId);

        const { data, error } = await this.db
            .from('broker_channels')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .order('pinned', { ascending: false })
            .order('updated_at', { ascending: false });

        if (error) {
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
            throw new Error(error.message);
        }

        if (!data) {
            return null;
        }

        const counts = await this.getChannelCounts([channelId]);
        return this.mapChannelRow(data as ChannelRow, counts.get(channelId));
    }

    async listStreamItems(tenantId: string, accessToken?: string | null, channelId?: string | null, sessionLabel?: string | null): Promise<StreamItemRecord[]> {
        await this.ensureStreamBackfilled(tenantId);
        const readClient = accessToken ? createSupabaseAnonClient(accessToken) : this.db;

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

            const streamIds = links.map((link: any) => link.stream_item_id);
            const { data: items, error: itemsError } = await readClient
                .from('stream_items')
                .select('*')
                .eq('tenant_id', tenantId)
                .in('id', streamIds);

            if (itemsError) {
                throw new Error(itemsError.message);
            }

            const linkMap = new Map<string, any>(links.map((link: any) => [link.stream_item_id, link]));
            const filteredItems = await this.filterItemsBySession(tenantId, (items || []), sessionLabel);
            return this.enrichSourcePhones(
                filteredItems
                .map((item: any) => this.mapStreamItem(item, linkMap.get(item.id)?.is_read))
                .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
            );
        }

        const { data, error } = await readClient
            .from('stream_items')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) {
            throw new Error(error.message);
        }

        const filteredItems = await this.filterItemsBySession(tenantId, data || [], sessionLabel);
        return this.enrichSourcePhones(filteredItems.map((item: any) => this.mapStreamItem(item)));
    }

    private async filterItemsBySession(tenantId: string, items: any[], sessionLabel?: string | null) {
        if (!sessionLabel || items.length === 0) {
            return items;
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

        const groupIds = new Set((groupsResult.data || []).map((row: any) => String(row.group_jid || '')).filter(Boolean));
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

    async rebuildStreamFromMessages(tenantId: string, limit = 500) {
        const { data: messages, error } = await this.db
            .from('messages')
            .select('id, remote_jid, sender, text, timestamp')
            .eq('tenant_id', tenantId)
            .order('timestamp', { ascending: true })
            .limit(limit);

        if (error) {
            throw new Error(error.message);
        }

        let ingestedCount = 0;
        for (const message of messages || []) {
            ingestedCount += await this.ingestMessage(tenantId, message);
        }

        const { count } = await this.db
            .from('stream_items')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId);

        return {
            scanned: (messages || []).length,
            ingested: ingestedCount,
            totalStreamItems: count || 0,
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

        return this.mapStreamItem(corrected);
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
        const candidates = await this.parseMessage(tenantId, message);
        if (candidates.length === 0) {
            return 0;
        }

        let ingestedCount = 0;
        for (const parsed of candidates) {
            if (!this.shouldPersistParsedCandidate(parsed)) {
                continue;
            }

            const { data, error } = await this.db
                .from('stream_items')
                .upsert({
                    tenant_id: tenantId,
                    message_id: parsed.messageId,
                    source_message_id: String(message.id),
                    source_group_id: parsed.sourceGroupId,
                    source_group_name: parsed.sourceGroupName,
                    source_phone: parsed.sourcePhone,
                    raw_text: parsed.rawText,
                    type: parsed.streamType,
                    record_type: parsed.recordType,
                    locality: parsed.locality,
                    city: parsed.city,
                    bhk: parsed.bhk,
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
                    is_global: this.isGlobalStreamCandidate(parsed),
                    parsed_payload: parsed.parsedPayload,
                    created_at: parsed.createdAt,
                }, { onConflict: 'tenant_id,message_id' })
                .select('*')
                .single();

            if (error || !data) {
                console.error('[ChannelService] Failed to upsert stream item', error);
                continue;
            }

            ingestedCount += 1;
            await canonicalizationService.canonicalizeStreamItem(data as any).catch((canonicalError) => {
                console.error('[ChannelService] Canonicalization failed', canonicalError);
            });
            await this.matchStreamItemToChannels(tenantId, data);
        }

        return ingestedCount;
    }

    private async ensureStreamBackfilled(tenantId: string) {
        const { count } = await this.db
            .from('stream_items')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId);

        if ((count || 0) > 0) {
            return;
        }

        try {
            await this.rebuildStreamFromMessages(tenantId, 200);
        } catch (error) {
            console.error('[ChannelService] Failed to backfill stream items from messages', error);
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

        const createdAt = String(message.timestamp || message.created_at || new Date().toISOString());
        const sourcePhone = extractContactPhoneFromBody(rawText) || extractPhoneNumber(message.sender) || extractPhoneNumber(message.remote_jid);
        const bodyContactName = extractContactNameFromBody(rawText);
        const sourceLabel = bodyContactName || senderLabel || null;
        const sourceGroupId = message.remote_jid?.endsWith('@g.us') ? String(message.remote_jid) : null;
        const commonResolution = parseIndianLocation(rawText);
        const commonLocation = commonResolution?.locality || '';
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
      "priceLabel": "string or null",
      "priceNumeric": number or null,
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
- Inherit top-level locality or section header into child listings when needed
- Detect building/project names and road/landmark references
- Normalize rent vs sale vs pre-leased correctly
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
        const items = Array.isArray(parsed?.items) ? parsed.items : [];

        return items
            .map((item, index) => {
                const candidateText = String(item.rawText || '').trim() || rawText;
                const resolution =
                    parseIndianLocation(candidateText) ||
                    (item.locality ? parseIndianLocation(String(item.locality)) : null) ||
                    commonResolution;
                const locality = String(item.locality || resolution?.locality || commonLocation || 'Location not parsed yet').trim();
                const city = String(item.city || resolution?.city || commonCity || 'Unknown').trim();
                const buildingName = item.buildingName ? titleCase(String(item.buildingName).trim()) : extractBuildingName(candidateText);
                const microLocation = item.microLocation ? titleCase(String(item.microLocation).trim()) : (extractMicroLocation(candidateText) || extractMicroLocation(rawText));
                const title = String(item.title || '').trim() || buildDisplayTitle(buildingName, microLocation, locality);
                const streamType =
                    item.streamType === 'Rent' || item.streamType === 'Sale' || item.streamType === 'Requirement' || item.streamType === 'Pre-leased'
                        ? item.streamType
                        : inferType(candidateText);
                const dealType =
                    item.dealType === 'rent' || item.dealType === 'sale' || item.dealType === 'pre-leased' || item.dealType === 'unknown'
                        ? item.dealType
                        : extractDealType(candidateText);
                const priceInfo = extractPriceInfo(candidateText, dealType);
                const priceLabel = String(item.priceLabel || '').trim() || priceInfo.label;
                const priceNumeric = typeof item.priceNumeric === 'number' && Number.isFinite(item.priceNumeric) ? item.priceNumeric : priceInfo.numeric;
                const bhk = String(item.bhk || '').trim() || extractBhk(candidateText);
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

                return {
                    messageId: items.length > 1 ? `${String(message.id)}:${index + 1}` : String(message.id),
                    rawText: candidateText,
                    sourcePhone,
                    sourceLabel,
                    sourceGroupId,
                    sourceGroupName: null,
                    streamType,
                    recordType: item.recordType === 'requirement' ? 'requirement' : 'listing',
                    locality,
                    city,
                    bhk,
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

        const segments = splitMessageIntoSegments(rawText);
        const commonResolution = parseIndianLocation(rawText);
        const commonLocation = commonResolution?.locality || '';
        const createdAt = String(message.timestamp || message.created_at || new Date().toISOString());
        const sourcePhone = extractContactPhoneFromBody(rawText) || extractPhoneNumber(message.sender) || extractPhoneNumber(message.remote_jid);
        const bodyContactName = extractContactNameFromBody(rawText);
        const sourceLabel = bodyContactName || String(message.sender || '').trim() || null;
        const sourceGroupId = message.remote_jid?.endsWith('@g.us') ? String(message.remote_jid) : null;

        return segments.map((segment, index) => {
            const candidateText = segment.text.trim();
            const resolution = parseIndianLocation(candidateText) || commonResolution;
            const location = resolution?.locality || commonLocation || 'Location not parsed yet';
            const dealType = extractDealType(candidateText);
            const price = extractPriceInfo(candidateText, dealType);
            const bhk = extractBhk(candidateText);
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

            return {
                messageId: segments.length > 1 ? `${String(message.id)}:${index + 1}` : String(message.id),
                rawText: candidateText,
                sourcePhone,
                sourceLabel,
                sourceGroupId,
                sourceGroupName: null,
                streamType: segment.streamType,
                recordType: segment.streamType === 'Requirement' ? 'requirement' : 'listing',
                locality: location,
                city: resolution?.city || extractIndianCity(candidateText),
                bhk,
                priceLabel: price.label,
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
                    location,
                    price: price.label,
                    bhk,
                    buildingName,
                    microLocation,
                }),
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

        const { data: streamItems, error: itemsError } = await this.db
            .from('stream_items')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(200);

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

    private mapStreamItem(item: any, isRead?: boolean): StreamItemRecord {
        const rawText = String(item.raw_text || '');
        const sourcePhone =
            item.source_phone ||
            item.parsed_payload?.sourcePhone ||
            item.parsed_payload?.contactPhone ||
            extractContactPhoneFromBody(rawText) ||
            null;
        const source =
            item.parsed_payload?.contactName ||
            item.parsed_payload?.sourceLabel ||
            item.source_group_name ||
            sourcePhone ||
            'Unknown source';

        return {
            id: String(item.id),
            type: (item.type || 'Sale') as StreamType,
            title: item.parsed_payload?.displayTitle || item.locality || 'Location not parsed yet',
            location: item.locality || 'Location not parsed yet',
            city: item.city || undefined,
            price: item.price_label || 'Unspecified',
            priceNumeric: item.price_numeric != null ? Number(item.price_numeric) : null,
            bhk: item.bhk || 'N/A',
            posted: formatPostedTime(item.created_at),
            createdAt: item.created_at,
            source,
            sourcePhone,
            confidence: Number(item.confidence_score || 0),
            description: item.raw_text || '',
            rawText: item.raw_text || '',
            recordType: item.record_type || 'unknown',
            dealType: item.deal_type || 'unknown',
            assetClass: item.asset_class || 'unknown',
            parseNotes: item.parsed_payload?.parseNotes || null,
            isCorrected: Boolean(item.parsed_payload?.isCorrected),
            isRead,
        };
    }

    private enrichSourcePhones(items: StreamItemRecord[]) {
        const sourcePhoneMap = new Map<string, string>();

        for (const item of items) {
            if (!item.sourcePhone) {
                continue;
            }

            const key = normalizeSourceKey(item.source);
            if (key && !sourcePhoneMap.has(key)) {
                sourcePhoneMap.set(key, item.sourcePhone);
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
            };
        });
    }
}

export const channelService = new ChannelService();
