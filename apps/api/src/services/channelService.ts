import { createSupabaseAnonClient, supabase, supabaseAdmin } from '../config/supabase';
import { parsePrice, splitMultiListing } from '@propai/price-parser';
import { aiService } from './aiService';
import { canonicalizationService } from './canonicalizationService';
import { igrEnrichmentService, type IgrQueueStatusPreview } from './igrEnrichmentService';
import { igrQueryService, type IgrTransactionPreview } from './igrQueryService';
import { extractIndianCity, extractIndianLocality, parseIndianLocation } from '../utils/locationParser';
import { normaliseIndianPhone } from '../utils/phoneUtils';
import { buildStreamContentHash, computeStreamCompleteness } from '../utils/streamQuality';
import { getWorkspaceSettingsRecord } from './workspaceSettingsService';
import { emailNotificationService } from './emailNotificationService';
import { pushRecentAction } from './identityService';
import { cleanNumber } from '../utils/number';
import { embedStreamItem } from '../services/embeddingService';
import { sanitizeBuildingNameCandidate, sanitizeMicroLocationCandidate } from '../utils/streamMetadataSanitizer';
import { whatsappHealthService } from './whatsappHealthService';


type ChannelType = 'listing' | 'requirement' | 'mixed';
type StreamType = 'Rent' | 'Sale' | 'Requirement' | 'Pre-leased' | 'Lease';
type StreamTimeBand = '1h' | '1d' | '7d';
type StreamFreshnessBand = '1h' | '6h';
type StreamTable = 'stream_items_residential' | 'stream_items_commercial';

const sourceOwnerCache = new Map<string, { tenantId: string | null; expiresAt: number }>();

const streamTableFor = (propertyCategory?: string | null, propertyUse?: string | null, assetClass?: string | null): StreamTable => {
    const cat = (propertyCategory || assetClass || '').toLowerCase();
    const use = (propertyUse || '').toLowerCase();
    const commercialUses = ['office', 'retail', 'showroom', 'warehouse', 'industrial'];
    if (cat === 'commercial' || commercialUses.includes(use)) return 'stream_items_commercial';
    return 'stream_items_residential';
};

export type StreamListFilters = {
    search?: string | null;
    types?: StreamType[];
    category?: 'residential' | 'commercial' | null;
    locality?: string | null;
    bhk?: string | null;
    configuration?: string | null;
    timeBands?: StreamTimeBand[];
    freshnessBands?: StreamFreshnessBand[];
    source?: string | null;
    brokerOnly?: boolean;
    showAll?: boolean;
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
    configuration?: string | null;
    priceNumeric?: number | null;
    bhk: string;
    propertyCategory?: 'residential' | 'commercial';
    areaSqft?: number | null;
    furnishing?: string | null;
    floorNumber?: string | null;
    totalFloors?: string | null;
    parking?: string | null;
    propertyUse?: string | null;
    brokerWaMeLinks?: string[] | null;
    brokerContacts?: Array<{ name: string | null; phone: string; waLink: string }> | null;
    posted: string;
    rawText?: string;
    source: string;
    sourcePhone?: string | null;
    brokerName?: string | null;
    brokerCompany?: string | null;
    waLink?: string | null;
    isNetworkItem?: boolean;
    description: string;
    createdAt: string;
    recordType: string;
    dealType: string;
    assetClass: string;
    isCorrected?: boolean;
    isRead?: boolean;
    igrTransactions?: IgrTransactionPreview[];
    igrQueueStatus?: IgrQueueStatusPreview | null;
    ingestionStatus?: string;
    suppressionReason?: string | null;
};

export type InboxMatchRecord = {
    id: string;
    sourceItem: StreamItemRecord;
    matchedItem: StreamItemRecord;
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

const buildBrokerContactActions = (item: any, rawText: string): Array<{ name: string | null; phone: string; waLink: string }> => {
    const contactsFromPayload = Array.isArray(item.parsed_payload?.brokerContacts)
        ? item.parsed_payload.brokerContacts
        : [];
    const structuredContacts = contactsFromPayload
        .map((contact: any) => {
            const phone = normaliseIndianPhone(contact?.phone);
            if (!phone) return null;
            return {
                name: String(contact?.name || '').trim() || null,
                phone,
                waLink: `https://wa.me/${phone}`,
            };
        })
        .filter(Boolean) as Array<{ name: string | null; phone: string; waLink: string }>;

    const rawContacts = extractBrokerContacts(rawText).map((contact) => ({
        name: contact.name || null,
        phone: contact.phone,
        waLink: `https://wa.me/${contact.phone}`,
    }));

    const links = Array.isArray(item.broker_wa_me_links) ? item.broker_wa_me_links : [];
    const linkContacts = links
        .map((link: string, index: number) => {
            const phone = normaliseIndianPhone(link);
            if (!phone) return null;
            return {
                name: null,
                phone,
                waLink: String(link || '').trim() || `https://wa.me/${phone}`,
            };
        })
        .filter(Boolean) as Array<{ name: string | null; phone: string; waLink: string }>;

    const sourcePhone = normaliseIndianPhone(item.source_phone || item.parsed_payload?.sourcePhone || item.parsed_payload?.contactPhone);
    const sourceContact = sourcePhone
        ? [{
            name: String(item.parsed_payload?.contactName || item.parsed_payload?.sourceLabel || item.broker_name || '').trim() || null,
            phone: sourcePhone,
            waLink: `https://wa.me/${sourcePhone}`,
        }]
        : [];

    const seen = new Set<string>();
    return [...structuredContacts, ...rawContacts, ...linkContacts, ...sourceContact].filter((contact) => {
        if (seen.has(contact.phone)) return false;
        seen.add(contact.phone);
        return true;
    });
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

type BrokerContact = {
    name: string;
    phone: string;
};

const extractBrokerContacts = (text: string): BrokerContact[] => {
    const lines = text
        .split('\n')
        .map((line) => line.replace('\r', ''))
        .map((line) => line.trim())
        .filter(Boolean);

    const contacts: BrokerContact[] = [];
    const seenPhones = new Set<string>();

    for (const line of lines) {
        const cleaned = line.split('*').join(' ').split('_').join(' ').split('`').join(' ').split('~').join(' ').split(' ').filter(Boolean).join(' ').trim();
        if (!cleaned) continue;

        // Extract all 10-digit phone numbers from the line
        const phoneMatches = [...cleaned.matchAll(/\b(\d{10})\b/g)];
        if (phoneMatches.length === 0) continue;

        for (const match of phoneMatches) {
            const rawPhone = match[1];
            const normalized = normaliseIndianPhone(rawPhone);
            if (!normalized || seenPhones.has(normalized)) continue;

            // Extract name: text before the phone number on this line
            const beforePhone = cleaned.substring(0, match.index || 0).trim();
            const nameParts = beforePhone.split(/[\s📱📞]+/).filter((w) => w.length >= 2 && /^[A-Za-z]/.test(w));
            const name = nameParts.slice(-2).join(' ') || beforePhone.replace(/\s+/g, ' ').trim();

            if (name) {
                contacts.push({ name, phone: normalized });
                seenPhones.add(normalized);
            }
        }
    }

    // Fallback: if no structured contacts found, use the last phone as single broker
    if (contacts.length === 0) {
        const fallbackPhone = extractContactPhoneFromBody(text);
        if (fallbackPhone) {
            const fallbackName = extractContactNameFromBody(text);
            contacts.push({ name: fallbackName || fallbackPhone, phone: fallbackPhone });
        }
    }

    return contacts;
};

const buildBrokerContactList = (contacts: BrokerContact[], fallbackPhone?: string | null) => {
    if (contacts.length > 0) return contacts;
    return fallbackPhone ? [{ name: '', phone: fallbackPhone }] : [];
};

const buildBrokerWaLinks = (contacts: BrokerContact[]) => {
    const links = contacts
        .map((contact) => contact.phone.replace(/\D/g, ''))
        .filter(Boolean)
        .map((phone) => `https://wa.me/${phone}`);
    return links.length > 0 ? Array.from(new Set(links)) : null;
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
    const match =
        text.match(/(\d{2,5}(?:\.\d+)?)\s*(sqft|sq ft|sq\.?\s*ft|cpt|carpet|builtup|built-up)\b/i) ||
        text.match(/\b(?:area|carpet|cpt)\s*[:\-]?\s*(\d{2,5}(?:\.\d+)?)/i);
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

export const extractParking = (text: string) => {
    const lower = text.toLowerCase();
    
    // Check for explicit parking patterns
    const parkingPatterns = [
        /(\d+)\s*(covered|open|car)?\s*parking/i,
        /parking\s*[:\-]?\s*(\d+)/i,
        /(\d+)\s*car\s*(parking|space|spot)/i,
        /covered\s*parking/i,
        /open\s*parking/i,
        /dedicated\s*parking/i,
        /parking\s*space/i,
        /parking\s*available/i,
    ];
    
    for (const pattern of parkingPatterns) {
        const match = text.match(pattern);
        if (match) {
            // If we have a number, return it
            if (match[1]) {
                return `${match[1]} ${match[2] || 'parking'}`.trim();
            }
            // Otherwise return the type
            return match[0];
        }
    }
    
    // Check for "parking" keyword without specifics
    if (lower.includes('parking')) {
        return 'parking';
    }
    
    return null;
};

export const extractPropertyUse = (text: string) => {
    const lower = text.toLowerCase();
    
    // Check for residential signals FIRST (higher priority than commercial keywords)
    const residentialSignals = [
        /\b\d+\s*bhk\b/i, /\b\d+\s*bed\b/i, /\bflat\b/i, /\bapartment\b/i,
        /\balcony\b/i, /\bwardrobe\b/i, /\bbeds?\b/i, /\bkitchen\b/i,
        /\bresidential\b/i, /\bsociety\b/i, /\btower\b/i, /\bwing\b/i,
    ];
    const hasResidentialSignal = residentialSignals.some(pattern => pattern.test(text));
    
    // Commercial keywords — only match if NO residential signals present
    const commercialSignals = [
        { pattern: /\bshowroom\b/i, value: 'showroom' },
        { pattern: /\bshop\b|\bretail\b/i, value: 'retail' },
        { pattern: /\bwarehouse\b|\bgodown\b/i, value: 'warehouse' },
        { pattern: /\bindustrial\b/i, value: 'industrial' },
        { pattern: /\boffice\b/i, value: 'office' },
    ];
    
    // If residential signals present, prioritize residential
    if (hasResidentialSignal) {
        for (const { pattern, value } of commercialSignals) {
            if (pattern.test(text)) {
                // Check if commercial word is in a signature/footer context (last 3 lines)
                const lines = text.split('\n');
                const footerLines = lines.slice(-3).join('\n').toLowerCase();
                if (pattern.test(footerLines) && lines.length > 2) {
                    // Likely a broker signature, ignore
                    continue;
                }
                return value;
            }
        }
        return 'residential';
    }
    
    // No residential signals — check commercial
    for (const { pattern, value } of commercialSignals) {
        if (pattern.test(text)) return value;
    }
    
    return null;
};

export const extractCommercialType = (text: string): string | null => {
    const lower = text.toLowerCase();
    const patterns = [
        { pattern: /\bco[- ]?work(ing)?\b/i, value: 'co-working' },
        { pattern: /\boffice\s*space\b|\boffice\b/i, value: 'office' },
        { pattern: /\bretail\s*shop\b|\bretail\b/i, value: 'retail' },
        { pattern: /\bshop\b/i, value: 'shop' },
        { pattern: /\bshowroom\b/i, value: 'showroom' },
        { pattern: /\bwarehouse\b|\bgodown\b/i, value: 'warehouse' },
        { pattern: /\bindustrial\b|\bfactory\b/i, value: 'industrial' },
    ];
    for (const { pattern, value } of patterns) {
        if (pattern.test(text)) return value;
    }
    return null;
};

export const extractFitoutStatus = (text: string): string | null => {
    const lower = text.toLowerCase();
    if (/\bbare[- ]?shell\b|\bbare\b|\bshell\b|\bunfitted\b/i.test(lower)) return 'bare-shell';
    if (/\bfully[- ]?fitted\b|\bfully[- ]?fit\b|\bturnkey\b/i.test(lower)) return 'fully-fitted';
    if (/\bsemi[- ]?fitted\b|\bsemi[- ]?fit\b|\bpartially[- ]?fitted\b/i.test(lower)) return 'semi-fitted';
    if (/\bfurnished\b/i.test(lower)) return 'furnished';
    if (/\bunfurnished\b/i.test(lower)) return 'unfurnished';
    return null;
};

export const extractWorkstationsCount = (text: string): number | null => {
    const match = text.match(/(\d+)\s*(?:workstations?|ws|seats?|desk)/i);
    return match ? parseInt(match[1], 10) : null;
};

export const extractCabinsCount = (text: string): number | null => {
    const match = text.match(/(\d+)\s*(?:cabins?|cabin|private\s*room|manager\s*room)/i);
    return match ? parseInt(match[1], 10) : null;
};

const hasPreLeasedSignal = (text: string) => /\bpre[-\s]?leased\b/i.test(String(text || ''));
const hasLeaseSignal = (text: string) => {
    const value = String(text || '');
    return hasPreLeasedSignal(value)
        || /\bleas(?:e|ed|ing)\b/i.test(value)
        || /\bleave\s*(?:and|&)\s*license\b/i.test(value)
        || /\bl\s*&\s*l\b/i.test(value)
        || /\bll\b/i.test(value);
};
const hasRentSignal = (text: string) => /\brent(?:al|ed|ing)?\b|\bmonthly\b|\bper\s+month\b/i.test(String(text || ''));
const hasSaleSignal = (text: string) => /\b(?:sale|selling|resale|outright)\b/i.test(String(text || ''));
const hasAvailabilitySignal = (text: string) => /\b(?:available|direct\s+available|inventory|listing)\b/i.test(String(text || ''));
const hasRequirementSignal = (text: string) => {
    const value = String(text || '');
    const withoutConfigurableArea = value.replace(/\bas\s+per\s+requirement\b/gi, ' ');
    return /\b(?:requirement|required|requires?|wanted|need|needs|searching)\b|\blooking\s+for\b|\bclient\s+(?:needs|wants)\b|\b(?:buyer|tenant)\s+(?:needs|wants)\b|\blooking\s+to\s+(?:buy|rent)\b|\burgently\s+require\b/i.test(withoutConfigurableArea);
};

const inferType = (text: string): StreamType => {
    const normalized = text.toLowerCase();
    
    if (hasPreLeasedSignal(text) || /\byield\b|\btenant\s+in\s+place\b/i.test(text)) {
        return 'Pre-leased';
    }
    
    const listingIndicators = [
        'floor', 'furnished', 'furnishing', 'condition', 'building ',
        'sqft', 'sq ft', 'carpet area', 'super area', 'built-up', 'possession',
        'balcony', 'parking', 'amenities', ' facing', 'road', 'wing', 'tower',
        'apartment', 'phase', 'project', 'society', 'complex', 'heights',
    ];
    const hasListingFeatures = listingIndicators.some(w => normalized.includes(w));
    
    const isExplicitRequirement = hasRequirementSignal(text);
    const isExplicitAvailability = hasAvailabilitySignal(text);
    
    if ((hasListingFeatures || isExplicitAvailability) && !(isExplicitRequirement && !isExplicitAvailability)) {
        if (hasRentSignal(text) || hasLeaseSignal(text)) {
            return 'Rent';
        }
        return 'Sale';
    }
    
    if (isExplicitRequirement) {
        return 'Requirement';
    }
    
    if (hasRentSignal(text) || hasLeaseSignal(text)) {
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
    const areaSqft = extractAreaSqft(text);
    const hasExplicitPriceContext = /\b(?:rent|rental|asking|ask|budget|price|cost|quote|token|deposit|all\s*in|negotiable|nego|rs|inr|lakh|lac|cr|crore|k)\b|₹|@/i.test(text);
    if (
        chosen.numeric != null &&
        Number.isFinite(chosen.numeric) &&
        areaSqft != null &&
        Math.round(Number(chosen.numeric)) === Math.round(areaSqft) &&
        !hasExplicitPriceContext
    ) {
        return {
            label: null,
            numeric: null,
        };
    }
    if (
        chosen.numeric != null &&
        Number.isFinite(chosen.numeric) &&
        Number(chosen.numeric) < 5_000 &&
        /\b(?:sqft|sq\s*ft|sq\.?\s*ft|cpt|carpet|area)\b/i.test(text) &&
        !hasExplicitPriceContext
    ) {
        return {
            label: null,
            numeric: null,
        };
    }
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

const buildCommercialConfiguration = (input: {
    areaSqft?: number | null;
    propertyUse?: string | null;
    commercialType?: string | null;
    fitoutStatus?: string | null;
    workstationsCount?: number | null;
}) => {
    const use = String(input.commercialType || input.propertyUse || '').trim();
    const fitout = String(input.fitoutStatus || '').trim();
    const seats = typeof input.workstationsCount === 'number' && Number.isFinite(input.workstationsCount)
        ? `${input.workstationsCount}-seat`
        : '';
    const area = typeof input.areaSqft === 'number' && Number.isFinite(input.areaSqft)
        ? `${Math.round(input.areaSqft)} sqft`
        : '';
    return [area, seats, fitout, use || 'Commercial'].filter(Boolean).join(' ').trim() || null;
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
        
        // Check for "in <name>" at end of line (e.g., "Available for Rent In Sunaina")
        const lineEnd = afterIn.indexOf('\n');
        if (lineEnd > 0) {
            let name = afterIn.slice(0, lineEnd).trim();
            // Remove trailing asterisks or other formatting
            name = name.replace(/[*_~]+$/, '').trim();
            if (name.length >= 2 && name.length < 50) {
                return titleCase(name);
            }
        } else if (afterIn.trim().length > 0 && afterIn.trim().length < 50) {
            // "in <name>" at end of text
            let name = afterIn.trim();
            name = name.replace(/[*_~]+$/, '').trim();
            if (name.length >= 2) {
                return titleCase(name);
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

const detectLowSignalBrokerRelay = (text: string) => LOW_SIGNAL_BROKER_PATTERNS.some((pattern) => pattern.test(String(text || '')));

const extractDealType = (text: string) => {
    if (hasPreLeasedSignal(text)) return 'pre-leased';
    if (hasLeaseSignal(text)) {
        return 'lease';
    }
    if (hasRentSignal(text)) {
        return 'rent';
    }
    return 'sale';
};

const inferDealTypeFromPrice = (text: string, currentDealType: string | null | undefined, priceNumeric: number | null) => {
    if (hasPreLeasedSignal(text)) return 'pre-leased';
    if (hasLeaseSignal(text)) return 'lease';
    if (hasRentSignal(text)) return 'rent';
    if (hasSaleSignal(text)) return 'sale';

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
    if (hasPreLeasedSignal(text)) return 'Pre-leased';
    if (hasAvailabilitySignal(text) && (hasLeaseSignal(text) || hasRentSignal(text))) {
        return hasLeaseSignal(text) ? 'Lease' : 'Rent';
    }
    if (hasAvailabilitySignal(text) && hasSaleSignal(text)) {
        return 'Sale';
    }
    if (hasRequirementSignal(text)) {
        return 'Requirement';
    }
    if (hasLeaseSignal(text)) {
        return 'Lease';
    }
    if (hasRentSignal(text)) {
        return 'Rent';
    }
    if (hasSaleSignal(text)) {
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
    if (hasPreLeasedSignal(text)) return 'commercial';
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

const isLikelyNewRecordBullet = (line: string) => {
    const cleaned = sanitizeLine(line);
    if (!cleaned) return false;
    if (/^\d{1,2}[\).]\s+/.test(cleaned)) return true;
    if (hasAvailabilitySignal(cleaned) || hasRequirementSignal(cleaned) || hasPreLeasedSignal(cleaned)) return true;
    const hasLayoutOrUse = extractBhk(cleaned) !== 'N/A' || /\b(?:office|shop|showroom|warehouse|godown|flat|apartment|plot)\b/i.test(cleaned);
    const hasDeal = hasRentSignal(cleaned) || hasLeaseSignal(cleaned) || hasSaleSignal(cleaned);
    const hasPrice = extractPriceInfo(cleaned).numeric != null;
    return hasLayoutOrUse && (hasDeal || hasPrice);
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
    if (hasAvailabilitySignal(line) && (hasLeaseSignal(line) || hasRentSignal(line))) {
        return hasLeaseSignal(line) ? 'Lease' : 'Rent';
    }
    if (hasAvailabilitySignal(line) && hasSaleSignal(line)) {
        return 'Sale';
    }
    for (const entry of SECTION_TYPE_KEYWORDS) {
        if (entry.type === 'Lease' && hasLeaseSignal(line)) return entry.type;
        if (entry.type === 'Requirement' && hasRequirementSignal(line)) return entry.type;
        if (entry.type === 'Rent' && hasRentSignal(line)) return entry.type;
        if (entry.type === 'Sale' && hasSaleSignal(line)) return entry.type;
        if (entry.type === 'Pre-leased' && hasPreLeasedSignal(line)) return entry.type;
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

        if (bullet && currentLines.length > 0 && isLikelyNewRecordBullet(cleaned)) {
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
    if (detectLowSignalBrokerRelay(text)) score -= 14;
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
    configuration: string | null;
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
    parking: string | null;
    propertyUse: string | null;
    commercialType: string | null;
    fitoutStatus: string | null;
    workstationsCount: number | null;
    cabinsCount: number | null;
    brokerWaMeLinks: string[] | null;
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
    configuration?: string | null;
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
    parking?: string | null;
    propertyUse?: string | null;
    commercialType?: 'office' | 'retail' | 'shop' | 'showroom' | 'warehouse' | 'godown' | 'industrial' | 'factory' | 'co-working' | null;
    fitoutStatus?: 'bare-shell' | 'fully-fitted' | 'semi-fitted' | 'furnished' | 'unfurnished' | null;
    workstationsCount?: number | null;
    cabinsCount?: number | null;
    broker_wa_me_links?: string[] | null;
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

type RawDumpReplayOptions = {
    limit?: number;
    remoteJid?: string | null;
    sessionLabel?: string | null;
    from?: string | null;
    to?: string | null;
    includeNonGroup?: boolean;
    force?: boolean;
    minIntervalMs?: number;
    reason?: string;
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
    configuration?: string;
    bhk?: string;
    rawText?: string;
    source?: string;
    sourcePhone?: string | null;
    recordType?: string;
    dealType?: string;
    assetClass?: string;
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
    private streamMissingColumnsCache = new Map<StreamTable, Set<string>>();

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

        const buildQuery = (acceptedOnly: boolean) => {
            const table = options?.filters?.category === 'commercial'
                ? 'stream_items_commercial'
                : 'stream_items_residential';

            let query = readClient
                .from(table)
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

        const acceptedOnly = !options?.filters?.showAll;
        let result = await buildQuery(acceptedOnly);
        if (result.error && isMissingIngestionStatusError(result.error.message)) {
            result = await buildQuery(false);
        }

        if (result.data && Array.isArray(result.data) && result.data.length === 0 && initialSearch && hadStructuredFilters) {
            const rawFallback = await this.buildQueryRawTextOnly(readClient, tenantIds, initialSearch, acceptedOnly, options?.limit);
            if (Array.isArray(rawFallback) && rawFallback.length > 0) {
                result = { data: rawFallback, error: null, count: rawFallback.length };
            } else {
                const rawFallback2 = await this.buildQueryRawTextOnly(readClient, tenantIds, initialSearch, false, options?.limit);
                if (Array.isArray(rawFallback2) && rawFallback2.length > 0) {
                    result = { data: rawFallback2, error: null, count: rawFallback2.length };
                }
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
        category?: 'residential' | 'commercial' | null;
    }) {
        const buildQuery = (acceptedOnly: boolean) => {
            let query = this.db
                .from('stream_items')
                .select('id', { count: 'exact', head: true })
                .in('tenant_id', tenantIds);

            if (acceptedOnly) {
                query = query.eq('ingestion_status', 'accepted');
            }

            if (options?.category) {
                query = query.or(`property_category.eq.${options.category},asset_class.eq.${options.category}`);
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
        const payload = (parsed.parsedPayload || {}) as Record<string, unknown>;
        const source = String(payload.source || '').trim().toLowerCase();
        const rawText = String(parsed.rawText || '').trim();
        const lower = rawText.toLowerCase();

        if (this.isFragmentaryParsedCandidate(parsed)) {
            return false;
        }

        if (source === 'raw_dump_replay' || source === 'fallback') {
            if (rawText.length < 25) {
                return false;
            }

            if (
                /\b(?:please\s+add|add\s+(?:these\s+)?(?:numbers?|contacts?)|broadcast\s+list|save\s+(?:my\s+)?number|join\s+(?:this\s+)?group)\b/i.test(rawText)
                && !hasAvailabilitySignal(rawText)
            ) {
                return false;
            }

            if (typeof parsed.priceNumeric === 'number' && Number.isFinite(parsed.priceNumeric) && parsed.priceNumeric > 0 && parsed.priceNumeric < 5_000) {
                return false;
            }

            const hasTypology = this.hasMeaningfulTypology(parsed);
            const hasAnchor = this.hasStructuralAnchor(parsed);
            const hasLocation = !this.isPlaceholderLocation(parsed.locality);
            const hasExplicitDeal = hasAvailabilitySignal(rawText) || hasRentSignal(rawText) || hasLeaseSignal(rawText) || hasSaleSignal(rawText);
            const hasPropertyKeyword = /\b(?:bhk|flat|apartment|office|shop|showroom|warehouse|godown|industrial|carpet|sq\s*ft|sqft|floor|parking|building|project|society)\b/i.test(lower);

            if (!hasPropertyKeyword || (!hasExplicitDeal && !hasTypology && !hasAnchor)) {
                return false;
            }

            if (!hasLocation && !hasTypology && !hasAnchor && !this.hasUsefulPrice(parsed)) {
                return false;
            }
        }

        return true;
    }

    private isFragmentaryParsedCandidate(parsed: ParsedStreamCandidate) {
        const rawText = String(parsed.rawText || '').trim();
        const lower = rawText.toLowerCase();
        const lineCount = rawText.split('\n').map((line) => line.trim()).filter(Boolean).length;
        const hasExplicitListingOrRequirement = hasAvailabilitySignal(rawText) || hasRequirementSignal(rawText) || hasPreLeasedSignal(rawText);
        const hasExplicitDeal = hasRentSignal(rawText) || hasLeaseSignal(rawText) || hasSaleSignal(rawText);
        const hasPrice = this.hasUsefulPrice(parsed);
        const hasLayout = this.hasMeaningfulTypology(parsed);
        const hasAnchor = this.hasStructuralAnchor(parsed);
        const hasLocation = !this.isPlaceholderLocation(parsed.locality);

        if (
            !hasExplicitListingOrRequirement &&
            !hasExplicitDeal &&
            !hasPrice &&
            (hasAnchor || hasLayout) &&
            rawText.length < 140
        ) {
            return true;
        }

        if (
            !hasPrice &&
            !hasLayout &&
            !hasAnchor &&
            /\b(?:site\s+visit|for\s+details|call\s+for|whatsapp|contact|broker|realtors?|properties)\b/i.test(lower)
        ) {
            return true;
        }

        if (
            lineCount <= 4 &&
            !hasExplicitListingOrRequirement &&
            !hasPrice &&
            !hasLocation &&
            !hasLayout &&
            !hasAnchor
        ) {
            return true;
        }

        return false;
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
                confidence_min: 0,
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

        await this.backfillChannelMatches(tenantId, data.id);

        const created = await this.getChannelById(tenantId, data.id);
        if (!created) {
            throw new Error('Channel created but could not be reloaded');
        }

        return created;
    }

    async listChannels(tenantId: string): Promise<PersonalChannelRecord[]> {
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

private rawDumpReplayInFlight = new Set<string>();
private rawDumpReplayQueuedAt = new Map<string, number>();
private dailyBriefingSentKeys = new Set<string>();
private weeklyAnalyticsSentKeys = new Set<string>();
private highValueLeadAlertKeys = new Set<string>();

    private getRawDumpReplayScopeKey(tenantId: string, options: RawDumpReplayOptions = {}) {
        return [
            tenantId,
            options.sessionLabel || 'all-sessions',
            options.remoteJid || 'all-chats',
        ].join('::');
    }

    queueRawDumpReplay(tenantId: string, options: RawDumpReplayOptions = {}) {
        const scopeKey = this.getRawDumpReplayScopeKey(tenantId, options);
        if (this.rawDumpReplayInFlight.has(scopeKey)) {
            return { queued: false, status: 'running', scopeKey };
        }

        const now = Date.now();
        const minIntervalMs = options.force ? 0 : Math.max(10_000, Number(options.minIntervalMs || 5 * 60_000));
        const lastQueuedAt = this.rawDumpReplayQueuedAt.get(scopeKey) || 0;
        if (lastQueuedAt && now - lastQueuedAt < minIntervalMs) {
            return { queued: false, status: 'throttled', scopeKey };
        }

        this.rawDumpReplayQueuedAt.set(scopeKey, now);
        this.rawDumpReplayInFlight.add(scopeKey);
        void this.rebuildStreamFromRawDump(tenantId, options)
            .catch((error) => {
                console.error('[ChannelService] Raw dump replay failed', {
                    tenantId,
                    sessionLabel: options.sessionLabel || null,
                    remoteJid: options.remoteJid || null,
                    error,
                });
            })
            .finally(() => {
                this.rawDumpReplayInFlight.delete(scopeKey);
            });

        return { queued: true, status: 'queued', scopeKey };
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
            .in('app_role', ['broker', 'super_admin']);

        if (error) {
            throw new Error(error.message);
        }

        const tenantIds = new Set<string>([
            tenantId,
            ...((data || []).map((row: any) => String(row.id || '')).filter(Boolean)),
        ]);

        const acceptedTenantTables = ['stream_items', 'stream_items_residential', 'stream_items_commercial'] as const;
        for (const table of acceptedTenantTables) {
            let offset = 0;
            const pageSize = 1000;
            while (true) {
                const { data: rows, error: rowsError } = await this.db
                    .from(table)
                    .select('tenant_id')
                    .eq('ingestion_status', 'accepted')
                    .range(offset, offset + pageSize - 1);

                if (rowsError) {
                    throw new Error(rowsError.message);
                }

                const page = Array.isArray(rows) ? rows : [];
                for (const row of page) {
                    const id = String((row as any)?.tenant_id || '').trim();
                    if (id) tenantIds.add(id);
                }

                if (page.length < pageSize) {
                    break;
                }
                offset += pageSize;
            }
        }

        this.networkTenantIdsCache.set(cacheKey, {
            tenantIds: Array.from(tenantIds),
            expiresAt: Date.now() + (60 * 1000),
        });

        return Array.from(tenantIds);
    }

    private async resolveSourceOwnerTenantId(scannerTenantId: string, sourcePhone?: string | null): Promise<string> {
        const normalizedPhone = normaliseIndianPhone(sourcePhone || '');
        if (!normalizedPhone) {
            return scannerTenantId;
        }

        const cacheKey = `source-owner::${normalizedPhone}`;
        const cached = sourceOwnerCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.tenantId || scannerTenantId;
        }

        const phoneVariants = Array.from(new Set([
            normalizedPhone,
            normalizedPhone.startsWith('91') ? normalizedPhone.slice(2) : `91${normalizedPhone}`,
            normalizedPhone.startsWith('+') ? normalizedPhone.slice(1) : `+${normalizedPhone}`,
        ].filter(Boolean)));

        const { data, error } = await this.db
            .from('profiles')
            .select('id, phone')
            .in('phone', phoneVariants)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.warn('[ChannelService] Source owner lookup failed', {
                scannerTenantId,
                sourcePhone: normalizedPhone,
                error: error.message,
            });
            return scannerTenantId;
        }

        const ownerTenantId = String((data as any)?.id || '').trim() || null;
        sourceOwnerCache.set(cacheKey, {
            tenantId: ownerTenantId,
            expiresAt: Date.now() + 5 * 60 * 1000,
        });

        return ownerTenantId || scannerTenantId;
    }

    private normalizeComparableText(value?: string | number | null): string {
        return String(value || '')
            .toLowerCase()
            .replace(/\bbedrooms?\b/g, 'bhk')
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private numbersClose(left?: number | null, right?: number | null, toleranceRatio = 0.02): boolean {
        if (left == null || right == null) return false;
        const a = Number(left);
        const b = Number(right);
        if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false;
        return Math.abs(a - b) <= Math.max(1, Math.max(a, b) * toleranceRatio);
    }

    private isLikelyStreamUpdate(existing: any, parsed: ParsedStreamCandidate): boolean {
        const existingConfig = this.normalizeComparableText(existing.configuration || existing.bhk);
        const nextConfig = this.normalizeComparableText(parsed.configuration || parsed.bhk);
        if (existingConfig && nextConfig && existingConfig !== nextConfig) return false;

        const existingBuilding = this.normalizeComparableText(existing.building_name || existing.parsed_payload?.buildingName);
        const nextBuilding = this.normalizeComparableText(String(parsed.parsedPayload?.buildingName || ''));
        const buildingMatches = Boolean(existingBuilding && nextBuilding && existingBuilding === nextBuilding);
        const areaMatches = this.numbersClose(existing.area_sqft, parsed.areaSqft, 0.02);
        const priceMatches = this.numbersClose(existing.price_numeric, parsed.priceNumeric, 0.01);

        if (buildingMatches && (areaMatches || priceMatches)) return true;
        if (areaMatches && priceMatches && existingConfig && nextConfig) return true;

        return false;
    }

    private async findLikelyStreamUpdate(
        targetTable: StreamTable,
        tenantId: string,
        parsed: ParsedStreamCandidate,
        cutoff: string,
    ): Promise<any | null> {
        if (!parsed.sourcePhone || !parsed.locality || !parsed.recordType) return null;

        let query = this.db
            .from(targetTable)
            .select('id, message_id, raw_text, ingestion_status, created_at, source_phone, record_type, locality, type, deal_type, bhk, configuration, building_name, price_numeric, area_sqft, parsed_payload')
            .eq('tenant_id', tenantId)
            .eq('source_phone', parsed.sourcePhone)
            .eq('record_type', parsed.recordType)
            .eq('locality', parsed.locality)
            .gte('created_at', cutoff)
            .order('created_at', { ascending: false })
            .limit(10);

        if (parsed.dealType && parsed.dealType !== 'unknown') {
            query = query.eq('deal_type', parsed.dealType);
        }

        const { data, error } = await query;
        if (error || !Array.isArray(data)) {
            if (error) {
                console.warn('[ChannelService] Similar stream update lookup failed', {
                    targetTable,
                    tenantId,
                    messageId: parsed.messageId,
                    error: error.message,
                });
            }
            return null;
        }

        return data.find((row: any) => this.isLikelyStreamUpdate(row, parsed)) || null;
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
         // FIX 1: Daily market briefing — fire-and-forget on first load of day
         const today = new Date().toISOString().slice(0, 10);
         const briefingKey = `${tenantId}::${today}`;
         if (!this.dailyBriefingSentKeys.has(briefingKey)) {
             this.dailyBriefingSentKeys.add(briefingKey);
             void this.maybeSendDailyBriefing(tenantId, email);
         }
         const weekKey = this.getWeekKey(new Date());
         const analyticsKey = `${tenantId}::${weekKey}`;
         if (!this.weeklyAnalyticsSentKeys.has(analyticsKey)) {
             this.weeklyAnalyticsSentKeys.add(analyticsKey);
             void this.maybeSendPerformanceAnalytics(tenantId, email);
         }

         const readClient = this.db;
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
            const rankedItems = this.rankAcceptedRows(Array.isArray(filteredItems) ? filteredItems : []);
            const mapped = rankedItems
                ? rankedItems.map((item: any) => this.mapStreamItem(item, tenantId, linkMap.get(item.id)?.is_read))
                : [];
            return this.enrichWithIgrTransactions(this.enrichSourcePhones(
                mapped
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
        const rankedItems = this.rankAcceptedRows(Array.isArray(filteredItems) ? filteredItems : []);
        const mapped = rankedItems.map((item: any) => this.mapStreamItem(item, tenantId));
        return this.enrichWithIgrTransactions(this.enrichSourcePhones(
            mapped
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
            const [resResult, comResult] = await Promise.all([
                this.db.from('stream_items_residential').select('*').eq('ingestion_status', 'accepted').order('created_at', { ascending: false }).limit(Math.max(effectiveLimit * 3, 400)),
                this.db.from('stream_items_commercial').select('*').eq('ingestion_status', 'accepted').order('created_at', { ascending: false }).limit(Math.max(effectiveLimit * 3, 400)),
            ]);
            const data = [
                ...(Array.isArray(resResult.data) ? resResult.data : []),
                ...(Array.isArray(comResult.data) ? comResult.data : []),
            ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, Math.max(effectiveLimit * 3, 400));
            return this.buildNetworkInboxMatchesFromRows(tenantId, data, effectiveLimit);
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
            fifteenMinutes: new Date(now - 15 * 60 * 1000).toISOString(),
            oneHour: new Date(now - 60 * 60 * 1000).toISOString(),
            fourHours: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
            oneDay: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
            sevenDays: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
        } as const;
        const countWindows = async (options?: { sessionGroupIds?: string[] | null; sessionLabel?: string | null }) => {
            const [fifteenMinutes, oneHour, fourHours, oneDay, sevenDays, allTime] = await Promise.all([
                this.countAcceptedStreamItems(accessibleTenantIds, { ...options, createdAfter: windows.fifteenMinutes }),
                this.countAcceptedStreamItems(accessibleTenantIds, { ...options, createdAfter: windows.oneHour }),
                this.countAcceptedStreamItems(accessibleTenantIds, { ...options, createdAfter: windows.fourHours }),
                this.countAcceptedStreamItems(accessibleTenantIds, { ...options, createdAfter: windows.oneDay }),
                this.countAcceptedStreamItems(accessibleTenantIds, { ...options, createdAfter: windows.sevenDays }),
                this.countAcceptedStreamItems(accessibleTenantIds, options),
            ]);

            return {
                fifteenMinutes: Number(fifteenMinutes.count || 0),
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
                return { fifteenMinutes: 0, oneHour: 0, fourHours: 0, oneDay: 0, sevenDays: 0, allTime: 0 };
            }

            const { data, error } = await this.readAcceptedStreamItems(this.db, accessibleTenantIds, {
                streamIds,
            });

            if (error) {
                throw new Error(error.message);
            }

            const filteredItems = await this.filterItemsBySession(tenantId, data || [], sessionLabel, networkMode);
            const counts = { fifteenMinutes: 0, oneHour: 0, fourHours: 0, oneDay: 0, sevenDays: 0, allTime: 0 };

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
                if (timestamp >= new Date(windows.fifteenMinutes).getTime()) counts.fifteenMinutes += 1;
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
                    return { fifteenMinutes: 0, oneHour: 0, fourHours: 0, oneDay: 0, sevenDays: 0, allTime: 0 };
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
                ingestedCount += (await this.ingestMessage(tenantId, message)).count;
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

    async rebuildStreamFromRawDump(tenantId: string, options: RawDumpReplayOptions = {}) {
        const defaultLimit = options.reason === 'group_health_zero_parse' ? 50 : 250;
        const limit = Math.max(1, Math.min(1000, Number(options.limit || defaultLimit)));

        let query = this.db
            .from('raw_dump')
            .select('id, session_id, group_jid, sender_jid, raw_text, received_at')
            .eq('workspace_id', tenantId)
            .eq('gate_status', 'passed')
            .order('received_at', { ascending: false })
            .limit(limit);

        if (options.sessionLabel) {
            query = query.eq('session_id', options.sessionLabel);
        }

        if (options.remoteJid) {
            query = query.eq('group_jid', options.remoteJid);
        }

        if (options.from) {
            query = query.gte('received_at', options.from);
        }

        if (options.to) {
            query = query.lte('received_at', options.to);
        }

        const { data, error } = await query;
        if (error) {
            throw new Error(error.message);
        }

        const orderedRows = Array.isArray(data)
            ? [...data].sort((left: any, right: any) => {
                const leftTime = new Date(String(left?.received_at || 0)).getTime();
                const rightTime = new Date(String(right?.received_at || 0)).getTime();
                return leftTime - rightTime;
            })
            : [];

        let ingestedCount = 0;
        let failedCount = 0;
        for (const row of orderedRows) {
            const rawText = String((row as any)?.raw_text || '').trim();
            const remoteJid = String((row as any)?.group_jid || '').trim();
            const sessionLabel = String((row as any)?.session_id || options.sessionLabel || 'workspace').trim() || 'workspace';
            if (!rawText || !remoteJid) {
                continue;
            }
            if (!options.includeNonGroup && !remoteJid.endsWith('@g.us')) {
                continue;
            }

            try {
                const ingestResult = await this.ingestMessage(tenantId, {
                    id: String((row as any).id),
                    session_label: sessionLabel,
                    remote_jid: remoteJid,
                    sender: String((row as any)?.sender_jid || '').trim() || null,
                    text: rawText,
                    timestamp: String((row as any)?.received_at || '').trim() || null,
                    created_at: String((row as any)?.received_at || '').trim() || null,
                    source: 'raw_dump_replay',
                    sourceGroupId: remoteJid.endsWith('@g.us') ? remoteJid : null,
                    senderJid: String((row as any)?.sender_jid || '').trim() || null,
                });

                ingestedCount += ingestResult.count;
                if (ingestResult.count > 0) {
                    await whatsappHealthService.recordMessageMetrics({
                        tenantId,
                        sessionLabel,
                        remoteJid,
                        parsed: true,
                        countReceived: false,
                        timestamp: String((row as any)?.received_at || '').trim() || null,
                    }).catch(() => undefined);
                }
            } catch (error) {
                failedCount += 1;
                await whatsappHealthService.recordMessageMetrics({
                    tenantId,
                    sessionLabel,
                    remoteJid,
                    parsed: false,
                    failed: true,
                    countReceived: false,
                    timestamp: String((row as any)?.received_at || '').trim() || null,
                }).catch(() => undefined);
                console.error('[ChannelService] Failed to ingest raw_dump row during replay', {
                    tenantId,
                    rawDumpId: String((row as any)?.id || ''),
                    remoteJid,
                    sessionLabel,
                    error,
                });
            }
        }

        const eventSession = options.sessionLabel || String((orderedRows[0] as any)?.session_id || 'workspace');
        await whatsappHealthService.appendEvent(
            tenantId,
            eventSession,
            failedCount > 0 ? 'history_replay_failed' : 'history_replay_completed',
            failedCount > 0
                ? `Replay scanned ${orderedRows.length} stored WhatsApp rows with ${failedCount} failures.`
                : `Replay scanned ${orderedRows.length} stored WhatsApp rows.`,
            {
                messageCount: orderedRows.length,
                ingestedCount,
                failedCount,
                remoteJid: options.remoteJid || null,
                sessionLabel: options.sessionLabel || null,
                source: 'raw_dump',
                reason: options.reason || null,
            },
        ).catch(() => undefined);

        const { count } = await this.countAcceptedStreamItems([tenantId]);

        return {
            scanned: orderedRows.length,
            ingested: ingestedCount,
            failed: failedCount,
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
        let existing: any = null;
        for (const table of ['stream_items_residential', 'stream_items_commercial'] as const) {
            const { data } = await this.db.from(table).select('*').eq('tenant_id', tenantId).eq('id', streamItemId).maybeSingle();
            if (data) { existing = data; break; }
        }

        if (!existing) {
            throw new Error('Stream item not found');
        }

        const targetTable = existing.property_category === 'commercial' ? 'stream_items_commercial' : 'stream_items_residential';

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

        const update: Record<string, any> = {
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
            confidence_score: existing.confidence_score,
            parsed_payload: nextPayload,
        };

        const streamEmbedding = await embedStreamItem({
            record_type: update.record_type || existing.record_type,
            deal_type: update.deal_type || existing.deal_type,
            asset_class: update.asset_class || existing.asset_class,
            property_category: existing.property_category,
            building_name: existing.building_name,
            micro_location: (existing.parsed_payload as any)?.microLocation || null,
            locality: String(update.locality || existing.locality),
            city: String(update.city || existing.city),
            bhk: update.bhk ? `${update.bhk}BHK` : null,
            price_label: String(update.price_label || existing.price_label),
            area_sqft: existing.area_sqft,
            furnishing: existing.furnishing,
            property_use: existing.property_use,
        }).catch(() => null);
        if (streamEmbedding) update.embedding = streamEmbedding;

        const { data: corrected, error: correctedError } = await this.db
            .from(targetTable)
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

    async deleteChannel(tenantId: string, channelId: string) {
        const { data: channel, error: fetchError } = await this.db
            .from('broker_channels')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('id', channelId)
            .eq('is_active', true)
            .maybeSingle();

        if (fetchError) throw new Error(fetchError.message);
        if (!channel) throw new Error('Channel not found');

        const { error } = await this.db
            .from('broker_channels')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('tenant_id', tenantId)
            .eq('id', channelId);

        if (error) throw new Error(error.message);
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
            .from('stream_items_residential')
            .select('id, tenant_id, property_category')
            .eq('tenant_id', tenantId)
            .eq('id', streamItemId)
            .maybeSingle();

        if (!streamItem) {
            const { data: comItem } = await this.db
                .from('stream_items_commercial')
                .select('id, tenant_id, property_category')
                .eq('tenant_id', tenantId)
                .eq('id', streamItemId)
                .maybeSingle();
            if (comItem) { /* exists in commercial */ }
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

    async ingestMessage(tenantId: string, message: RawInboundMessage): Promise<{ count: number; refNos: string[] }> {
        const settingsRecord = await getWorkspaceSettingsRecord(tenantId).catch(() => null);
        const workspaceSettings = settingsRecord?.settings;
        const deduplicationEnabled = workspaceSettings?.deduplication !== false;
        const noiseFilterEnabled = workspaceSettings?.noiseFilter !== false;
        const groupContext = await this.loadGroupIngestionContext(tenantId, message.remote_jid);
        const candidates = (await this.parseMessage(tenantId, message)).map((candidate) => this.applyGroupContextToCandidate(candidate, groupContext));
        if (candidates.length === 0) {
            return { count: 0, refNos: [] };
        }

        const qualityDecision = this.evaluateMessageQuality(message, candidates, groupContext);
        if (!noiseFilterEnabled && qualityDecision.status !== 'accepted') {
            const originalStatus = qualityDecision.status;
            qualityDecision.status = 'accepted';
            qualityDecision.suppressionReason = null;
            qualityDecision.resolutionContext = {
                ...qualityDecision.resolutionContext,
                noiseFilterDisabled: true,
                originalStatus,
            };
        }
        const isAccepted = qualityDecision.status === 'accepted';

        let ingestedCount = 0;
        const refNos: string[] = [];
        for (const parsed of candidates) {
            if (!this.shouldPersistParsedCandidate(parsed)) {
                continue;
            }

            const ownerTenantId = await this.resolveSourceOwnerTenantId(tenantId, parsed.sourcePhone);
            const assignedToSourceOwner = ownerTenantId !== tenantId;

            if (deduplicationEnabled && ['listing', 'requirement'].includes(parsed.recordType)) {
                const windowMinutes = parsed.recordType === 'requirement' ? 24 * 60 : 10;
                const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
                const contentHash = buildStreamContentHash(parsed.rawText, parsed.sourcePhone);
                const targetTable = streamTableFor(parsed.propertyCategory, parsed.propertyUse, parsed.assetClass);

                const { data: exactDupe } = await this.db
                    .from(targetTable)
                    .select('id, ref_no, ingestion_status')
                    .eq('tenant_id', ownerTenantId)
                    .eq('content_hash', contentHash)
                    .maybeSingle();

                if (exactDupe) {
                    await this.db
                        .from(targetTable)
                        .update({
                            created_at: parsed.createdAt,
                            ingestion_status: 'accepted',
                            suppressed_at: null,
                            suppression_reason: null,
                        })
                        .eq('id', exactDupe.id);
                    ingestedCount += 1;
                    if (exactDupe.ref_no) refNos.push(String(exactDupe.ref_no));
                    continue;
                }

                if (parsed.locality && parsed.priceNumeric != null) {
                    const query = this.db
                        .from(targetTable)
                        .select('id, ref_no, ingestion_status')
                        .eq('tenant_id', ownerTenantId)
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
                            .from(targetTable)
                            .update({
                                created_at: parsed.createdAt,
                                ingestion_status: 'accepted',
                                suppressed_at: null,
                                suppression_reason: null,
                            })
                            .eq('id', dupe.id);
                        ingestedCount += 1;
                        if (dupe.ref_no) refNos.push(String(dupe.ref_no));
                        continue;
                    }
                }
            }

            const parsedPayload = {
                ...(parsed.parsedPayload || {}),
                scannerTenantId: tenantId,
                ownerTenantId,
                assignedToSourceOwner,
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

            const targetTable = streamTableFor(parsed.propertyCategory, parsed.propertyUse, parsed.assetClass);

            const streamEmbedding = await embedStreamItem({
                record_type: parsed.recordType,
                deal_type: parsed.dealType,
                asset_class: parsed.assetClass,
                property_category: parsed.propertyCategory,
                building_name: sanitizeBuildingNameCandidate(String(parsed.parsedPayload?.buildingName || '').trim()) || null,
                micro_location: (parsed.parsedPayload as any)?.microLocation || null,
                locality: parsed.locality,
                city: parsed.city,
                bhk: parsed.bhk ? `${parsed.bhk}BHK` : null,
                price_label: parsed.priceLabel,
                area_sqft: parsed.areaSqft,
                furnishing: parsed.furnishing,
                property_use: parsed.propertyUse,
            }).catch(() => null);

            const streamPayload = {
                ...(streamEmbedding ? { embedding: streamEmbedding } : {}),
                tenant_id: ownerTenantId,
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
                configuration: parsed.configuration || parsed.bhk || null,
                building_name: sanitizeBuildingNameCandidate(String(parsed.parsedPayload?.buildingName || '').trim()) || null,
                price_label: parsed.priceLabel,
                price_numeric: parsed.priceNumeric,
                deal_type: parsed.dealType,
                asset_class: parsed.assetClass,
                property_category: parsed.propertyCategory,
                area_sqft: parsed.areaSqft,
                furnishing: parsed.furnishing,
                floor_number: parsed.floorNumber,
                total_floors: parsed.totalFloors,
                parking: parsed.parking,
                property_use: parsed.propertyUse,
                commercial_type: parsed.commercialType || null,
                fitout_status: parsed.fitoutStatus || null,
                workstations_count: parsed.workstationsCount || null,
                cabins_count: parsed.cabinsCount || null,
                broker_wa_me_links: parsed.brokerWaMeLinks || null,
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
            };

            let data: any | null = null;
            let error: any = null;

            if (deduplicationEnabled && ['listing', 'requirement'].includes(parsed.recordType)) {
                const windowMinutes = parsed.recordType === 'requirement' ? 24 * 60 : 12 * 60;
                const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
                const likelyUpdate = await this.findLikelyStreamUpdate(targetTable, ownerTenantId, parsed, cutoff);

                if (likelyUpdate) {
                    const updatePayload = {
                        ...streamPayload,
                        parsed_payload: {
                            ...(streamPayload.parsed_payload as Record<string, unknown>),
                            updatedFromMessageId: parsed.messageId,
                            previousMessageId: likelyUpdate.message_id || null,
                        },
                    };
                    delete (updatePayload as Record<string, unknown>).id;
                    delete (updatePayload as Record<string, unknown>).message_id;

                    const updateResult = await this.db
                        .from(targetTable)
                        .update(updatePayload)
                        .eq('tenant_id', ownerTenantId)
                        .eq('id', likelyUpdate.id)
                        .select('*')
                        .single();

                    data = updateResult.data;
                    error = updateResult.error;
                }
            }

            if (!data && !error) {
                const upsertResult = await this.upsertStreamItemWithSchemaFallback(targetTable, streamPayload);
                data = upsertResult.data;
                error = upsertResult.error;
            }

            if (error || !data) {
                console.error('[ChannelService] Failed to upsert stream item', error);
                continue;
            }

            if (data.ref_no) {
                refNos.push(String(data.ref_no));
            }

            if (!isAccepted) {
                ingestedCount += 1;
                continue;
            }

            await this.upsertPublicListing(ownerTenantId, parsed, message).catch((pe) => {
                console.error('[ChannelService] Failed to upsert public listing', pe);
            });
            await this.upsertWebsiteListing(ownerTenantId, parsed).catch((le) => {
                console.error('[ChannelService] Failed to upsert website listing', le);
            });

            if (String(parsed.parsedPayload?.buildingName || '').trim()) {
                void igrEnrichmentService.seedBuildingName(
                    String(parsed.parsedPayload?.buildingName || '').trim(),
                    parsed.locality || null,
                    parsed.city || null,
                ).catch((error) => {
                    console.error('[ChannelService] Failed to seed IGR building index', {
                        streamItemId: data.id,
                        buildingName: String(parsed.parsedPayload?.buildingName || '').trim(),
                        locality: parsed.locality || null,
                        city: parsed.city || null,
                        error: error instanceof Error ? error.message : error,
                    });
                });
            }

            ingestedCount += 1;
            if (workspaceSettings?.highValueLeads !== false) {
                void this.maybeAlertHighValueLead(ownerTenantId, parsed, data.id);
            }
            await canonicalizationService.canonicalizeStreamItem(data as any).catch((canonicalError) => {
                console.error('[ChannelService] Canonicalization failed', canonicalError);
            });
            await this.matchStreamItemToChannels(ownerTenantId, data).catch((matchError) => {
                console.error('[ChannelService] Channel matching failed', matchError);
            });
            await this.syncInboxMatchesForStreamItem(ownerTenantId, data).catch((matchError) => {
                if (!isInboxItemsSchemaError(matchError as any)) {
                    console.error('[ChannelService] Inbox matching failed', matchError);
                }
            });
        }

        return { count: ingestedCount, refNos };
    }

    async previewMessageParse(tenantId: string, message: RawInboundMessage) {
        const groupContext = await this.loadGroupIngestionContext(tenantId, message.remote_jid);
        return (await this.parseMessage(tenantId, message))
            .map((candidate) => this.applyGroupContextToCandidate(candidate, groupContext));
    }

    private async upsertStreamItemWithSchemaFallback(
        targetTable: StreamTable,
        payload: Record<string, unknown>,
    ) {
        const cachedMissingColumns = this.streamMissingColumnsCache.get(targetTable);
        let nextPayload = { ...payload };

        if (cachedMissingColumns?.size) {
            for (const column of cachedMissingColumns) {
                delete nextPayload[column];
            }
        }

        const maxAttempts = Object.keys(nextPayload).length + 1;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const { data, error } = await this.db
                .from(targetTable)
                .upsert(nextPayload, { onConflict: 'tenant_id,message_id' })
                .select('*')
                .single();

            if (!error && data) {
                return { data, error: null };
            }

            const message = String(error?.message || '').toLowerCase();
            const match = message.match(/could not find the '([^']+)' column/i);
            const missingColumn = match?.[1] || null;
            const schemaError = ['PGRST204', '42703'].includes(String(error?.code || ''));

            if (!schemaError || !missingColumn || !(missingColumn in nextPayload)) {
                return { data, error };
            }

            console.warn('[ChannelService] Retrying stream upsert without missing column', {
                targetTable,
                missingColumn,
                attempt,
                messageId: String(nextPayload.message_id || ''),
            });

            if (!this.streamMissingColumnsCache.has(targetTable)) {
                this.streamMissingColumnsCache.set(targetTable, new Set());
            }
            this.streamMissingColumnsCache.get(targetTable)?.add(missingColumn);

            const { [missingColumn]: _omitted, ...rest } = nextPayload;
            nextPayload = rest;
        }

        return {
            data: null,
            error: new Error(`Failed to upsert stream item after ${maxAttempts} schema fallback retries`),
        };
    }

    private async upsertPublicListing(tenantId: string, parsed: ParsedStreamCandidate, message: RawInboundMessage): Promise<void> {
        const phone = normaliseIndianPhone(parsed.sourcePhone || this.extractPhoneFromText(parsed.rawText));
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
            location: parsed.locality || null,
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
            primary_contact_wa: phone,
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
        return m ? normaliseIndianPhone(m[0]) : null;
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
            const [resResult, comResult] = await Promise.all([
                this.db.from('stream_items_residential').select('id, raw_text, type, record_type, confidence_score, locality, bhk, price_label').eq('tenant_id', tenantId).gte('created_at', todayStart.toISOString()).order('confidence_score', { ascending: false }).limit(5),
                this.db.from('stream_items_commercial').select('id, raw_text, type, record_type, confidence_score, locality, bhk, price_label').eq('tenant_id', tenantId).gte('created_at', todayStart.toISOString()).order('confidence_score', { ascending: false }).limit(5),
            ]);
            const items = [
                ...(Array.isArray(resResult.data) ? resResult.data : []),
                ...(Array.isArray(comResult.data) ? comResult.data : []),
            ].sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0)).slice(0, 5);

            if (!items || items.length === 0) {
                return;
            }

            const topItems = items.map((item: any) => {
                const parts = [
                    item.type && `[${item.type}]`,
                    item.record_type && `(${item.record_type})`,
                    item.locality,
                    item.bhk,
                    item.price_label,
                ].filter(Boolean);
                return parts.join(' ') || item.raw_text?.slice(0, 80) || 'Stream item';
            });

            await emailNotificationService.sendDailyBriefing(email, tenantId, items.length, topItems);
        } catch (err) {
            console.error('[ChannelService] Daily briefing failed', (err as Error).message);
        }
    }

    private getWeekKey(date: Date) {
        const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const day = copy.getUTCDay() || 7;
        copy.setUTCDate(copy.getUTCDate() + 4 - day);
        const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((copy.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        return `${copy.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }

    private async maybeSendPerformanceAnalytics(tenantId: string, email?: string | null) {
        if (!email) {
            return;
        }

        try {
            const settingsRecord = await getWorkspaceSettingsRecord(tenantId);
            if (!settingsRecord.settings.performanceAnalytics) {
                return;
            }

            const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const [resResult, comResult] = await Promise.all([
                this.db.from('stream_items_residential').select('record_type, ingestion_status').eq('tenant_id', tenantId).gte('created_at', since).limit(5000),
                this.db.from('stream_items_commercial').select('record_type, ingestion_status').eq('tenant_id', tenantId).gte('created_at', since).limit(5000),
            ]);

            const rows = [
                ...(Array.isArray(resResult.data) ? resResult.data : []),
                ...(Array.isArray(comResult.data) ? comResult.data : []),
            ] as Array<{ record_type?: string | null; ingestion_status?: string | null }>;

            const stats = rows.reduce((acc, row) => {
                const recordType = String(row.record_type || '').toLowerCase();
                const status = String(row.ingestion_status || 'accepted').toLowerCase();
                if (recordType === 'listing') acc.listings += 1;
                if (recordType === 'requirement') acc.requirements += 1;
                if (status === 'accepted') acc.accepted += 1;
                else acc.suppressed += 1;
                return acc;
            }, { listings: 0, requirements: 0, accepted: 0, suppressed: 0 });

            await emailNotificationService.sendPerformanceAnalytics(email, stats);
        } catch (error) {
            console.error('[ChannelService] Failed to send performance analytics email', error);
        }
    }

    private isHighValueLead(candidate: ParsedStreamCandidate) {
        if (candidate.recordType !== 'requirement') {
            return false;
        }

        const price = Number(candidate.priceNumeric || 0);
        if (!Number.isFinite(price) || price <= 0) {
            return false;
        }

        const dealType = String(candidate.dealType || '').toLowerCase();
        if (dealType === 'rent' || candidate.streamType === 'Rent') {
            return price >= 300000;
        }

        return price >= 50000000;
    }

    private async maybeAlertHighValueLead(tenantId: string, candidate: ParsedStreamCandidate, streamItemId?: string | null) {
        if (!this.isHighValueLead(candidate)) {
            return;
        }

        const key = `${tenantId}::${streamItemId || candidate.messageId}`;
        if (this.highValueLeadAlertKeys.has(key)) {
            return;
        }

        this.highValueLeadAlertKeys.add(key);
        const location = [candidate.locality, candidate.city].filter(Boolean).join(', ') || 'Unknown location';
        const budget = candidate.priceLabel || (candidate.priceNumeric ? `₹${candidate.priceNumeric}` : 'budget available');
        await pushRecentAction(tenantId, `High-value lead detected: ${candidate.streamType} requirement in ${location} (${budget})`);
    }

    private async parseMessage(tenantId: string, message: RawInboundMessage): Promise<ParsedStreamCandidate[]> {
        try {
            const aiResult = await this.parseMessageWithAI(tenantId, message);
            if (aiResult.length > 0) {
                return aiResult;
            }
        } catch (error) {
            console.error('[ChannelService] AI stream parser failed; message retained as raw evidence without creating a stream item', error);
        }

        return [];
    }

    private async parseMessageWithAI(tenantId: string, message: RawInboundMessage): Promise<ParsedStreamCandidate[]> {
        const rawText = String(message.text || message.text || '').trim();
        const senderLabel = String(message.sender || '').trim();

        if (!rawText || senderLabel.toUpperCase() === 'AI') {
            return [];
        }

        if (!/[a-zA-Z0-9]/.test(rawText)) {
            return [];
        }

        const createdAt = new Date().toISOString();
        const brokerContacts = extractBrokerContacts(rawText);
        const fallbackPhone = extractPhoneNumber(message.sender) || extractPhoneNumber(message.remote_jid);
        const sourceGroupId = message.remote_jid?.endsWith('@g.us') ? String(message.remote_jid) : null;
        const sourceGroupName = String(message.sourceGroupName || '').trim() || null;

        // Check locality_aliases before falling through to parser
        const commonResolution = parseIndianLocation(rawText);
        const commonLocation = commonResolution?.locality || extractIndianLocality(rawText) || '';
        const commonCity = commonResolution?.city || extractIndianCity(rawText);

        const systemPrompt = `You are PropAI's parser for Indian real estate WhatsApp broker messages. Return valid JSON only. No markdown.

Extract every phone number, sanitize (remove spaces/hyphens/+/country code, prepend 91), and output as "https://wa.me/91XXXXXXXXXX" in broker_wa_me_links per item.`;

        const userPrompt = `Extract real-estate records from this WhatsApp message.

Return ONLY JSON: {"items":[{
  "title","streamType":"Rent|Sale|Requirement|Pre-leased","recordType":"listing|requirement",
  "dealType":"rent|sale|pre-leased|unknown","assetClass":"residential|commercial|plot|unknown",
  "locality","city","configuration","priceLabel","priceNumeric":number,
  "price","priceUnit":"crores|lakhs|thousands|rupees|null",
  "buildingName","microLocation","propertyCategory":"residential|commercial|null",
  "areaSqft":number,"furnishing":"unfurnished|semi-furnished|fully-furnished|furnished|null",
  "floorNumber","totalFloors","parking","propertyUse",
  "commercialType":"office|retail|shop|showroom|warehouse|godown|industrial|factory|co-working|null",
  "fitoutStatus":"bare-shell|fully-fitted|semi-fitted|furnished|unfurnished|null",
  "workstationsCount":number,"cabinsCount":number,
  "broker_wa_me_links":["https://wa.me/91..."],
  "parseNotes","confidence":number,"rawText"
}]}

Rules:
- Split multi-listings into separate items (blank lines, pipe |, numbered lists, repeated BHK)
- Inherit shared locality/building from headers into child items
- Requirement = sender IS searching ("looking for", "wanted", "need", "client wants")
- Property descriptions (floor, furnishing, building, amenities) are Rent/Sale listings, NOT Requirements
- priceNumeric = full INR integer (e.g. 45000, 35500000). Use null if unclear
- Use null instead of guessing. Skip greetings/signatures

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
                const locality = String(resolution?.locality || commonLocation || extractIndianLocality(candidateText) || item.locality || extractIndianLocality(rawText) || '').trim() || null;
                const city = String(resolution?.city || commonCity || item.city || '').trim() || null;
                const rawBuildingName = item.buildingName ? String(item.buildingName).trim() : extractBuildingName(candidateText);
                const rawMicroLocation = item.microLocation ? String(item.microLocation).trim() : (extractMicroLocation(candidateText) || extractMicroLocation(rawText));
                const buildingName = sanitizeBuildingNameCandidate(rawBuildingName);
                const microLocation = sanitizeMicroLocationCandidate(rawMicroLocation);
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
                const rawResidentialConfig = String(item.configuration || item.bhk || '').trim() || extractBhk(candidateText);
                const normalizedBhk = rawResidentialConfig === 'N/A' ? null : rawResidentialConfig;
                const assetClass =
                    item.assetClass === 'commercial' || item.assetClass === 'plot' || item.assetClass === 'unknown'
                        ? item.assetClass
                        : 'residential';
                const propertyCategory = item.propertyCategory === 'commercial' || assetClass === 'commercial' ? 'commercial' : 'residential';
                const areaSqft = typeof item.areaSqft === 'number' && Number.isFinite(item.areaSqft) ? item.areaSqft : extractAreaSqft(candidateText);
                const furnishing = normalizeFurnishing(item.furnishing) || normalizeFurnishing(candidateText);
                const floorNumber = String(item.floorNumber || '').trim() || extractFloorNumber(candidateText);
                const totalFloors = String(item.totalFloors || '').trim() || extractTotalFloors(candidateText);
                const parking = String(item.parking || '').trim() || extractParking(candidateText);
                const propertyUse = String(item.propertyUse || '').trim() || extractPropertyUse(candidateText);
                const commercialType = propertyCategory === 'commercial'
                    ? (String(item.commercialType || '').trim() || extractCommercialType(candidateText) || null)
                    : null;
                const fitoutStatus = propertyCategory === 'commercial'
                    ? (String(item.fitoutStatus || '').trim() || extractFitoutStatus(candidateText) || null)
                    : null;
                const workstationsCount = propertyCategory === 'commercial' && typeof item.workstationsCount === 'number' && Number.isFinite(item.workstationsCount)
                    ? item.workstationsCount
                    : extractWorkstationsCount(candidateText);
                const cabinsCount = propertyCategory === 'commercial' && typeof item.cabinsCount === 'number' && Number.isFinite(item.cabinsCount)
                    ? item.cabinsCount
                    : extractCabinsCount(candidateText);
                const configuration = propertyCategory === 'commercial'
                    ? (String(item.configuration || '').trim() || buildCommercialConfiguration({ areaSqft, propertyUse, commercialType, fitoutStatus, workstationsCount }) || normalizedBhk)
                    : normalizedBhk;
                const aiBrokerWaMeLinks = Array.isArray(item.broker_wa_me_links) && item.broker_wa_me_links.length > 0
                    ? item.broker_wa_me_links
                    : null;
                const confidence = Math.max(0, Math.min(100, Number(item.confidence || 0))) || calculateConfidence(candidateText, {
                    location: locality,
                    price: priceLabel,
                    bhk: configuration,
                    buildingName,
                    microLocation,
                });
                const parseNotes = item.parseNotes ? String(item.parseNotes).trim() : null;

                return {
                    messageId: items.length > 1 ? `${String(message.id)}:${index + 1}` : String(message.id),
                    rawText: candidateText,
                    sourcePhone: '',
                    sourceLabel: '',
                    sourceGroupId,
                    sourceGroupName,
                    streamType,
                    recordType: item.recordType === 'requirement' ? 'requirement' : 'listing',
                    locality,
                    city,
                    configuration,
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
                    parking: parking || null,
                    propertyUse: propertyUse || null,
                    commercialType: commercialType || null,
                    fitoutStatus: fitoutStatus || null,
                    workstationsCount: workstationsCount || null,
                    cabinsCount: cabinsCount || null,
                    brokerWaMeLinks: null,
                    confidenceScore: confidence,
                    messageHash: '',
                    brokerContactValid: false,
                    completenessScore: 0,
                    isComplete: false,
                    createdAt,
                    parsedPayload: {
                        displayTitle: title,
                        buildingName,
                        microLocation,
                        sourcePhone: null,
                        sourceLabel: null,
                        contactName: null,
                        contactPhone: null,
                        normalizedText: candidateText.toLowerCase(),
                        sourceRemoteJid: message.remote_jid || null,
                        sourceMessageId: String(message.id),
                        segmentIndex: index,
                        matchedAlias: resolution?.matchedAlias || null,
                        resolutionMethod: 'ai_primary',
                        resolutionConfidence: resolution?.confidence || confidence,
                        pincode: resolution?.pincode || null,
                        propertyCategory,
                        configuration,
                        areaSqft,
                        furnishing,
                        floorNumber: floorNumber || null,
                        totalFloors: totalFloors || null,
                        propertyUse: propertyUse || null,
                        parseNotes,
                        aiParsed: true,
                        source: String(message.source || 'ai').trim() || 'ai',
                        sourceGroupId,
                        sourceGroupName,
                        senderJid: message.senderJid || null,
                    },
                } satisfies ParsedStreamCandidate;
            })
            .flatMap((item) => {
                const activeBrokers = buildBrokerContactList(brokerContacts, fallbackPhone);
                const broker = activeBrokers[0];
                if (!broker) return [];
                const allBrokerWaLinks = buildBrokerWaLinks(activeBrokers);
                return [broker].map((broker) => {
                    const sourcePhone = broker.phone;
                    const sourceLabel = broker.name || null;
                    const brokerWaMeLinks = allBrokerWaLinks || (sourcePhone ? [`https://wa.me/${sourcePhone.replace(/\D/g, '')}`] : null);
                    const completeness = computeStreamCompleteness({
                        locality: item.locality,
                        bhk: item.bhk,
                        sqft: item.areaSqft ?? null,
                        priceNumeric: item.priceNumeric,
                        brokerContactValid: Boolean(sourcePhone),
                    });
                    return {
                        ...item,
                        sourcePhone,
                        sourceLabel,
                        brokerWaMeLinks,
                        brokerContactValid: Boolean(sourcePhone),
                        completenessScore: completeness.completeness_score,
                        isComplete: completeness.is_complete,
                        messageHash: buildStreamContentHash(item.rawText, sourcePhone),
                        parsedPayload: {
                            ...item.parsedPayload,
                            sourcePhone,
                            sourceLabel,
                            contactName: sourceLabel,
	                            contactPhone: sourcePhone,
	                            brokerContacts: activeBrokers,
                        },
                    };
                });
            })
            .filter((item) => Boolean(item.rawText));
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

    private collectNetworkInboxPairCandidates(tenantId: string, rows: any[]): InboxPairCandidate[] {
        const ownRows = rows.filter((row: any) => String(row.tenant_id || '') === tenantId);
        const rowPool = ownRows.length > 0 ? ownRows : rows;
        const pairMap = new Map<string, InboxPairCandidate>();

        for (const source of rowPool) {
            if (!this.isMatchableRecord(source)) {
                continue;
            }

            for (const candidate of rows) {
                if (String(candidate.id || '') === String(source.id || '')) {
                    continue;
                }

                const sourceTenantId = String(source.tenant_id || '');
                const candidateTenantId = String(candidate.tenant_id || '');
                if (sourceTenantId && candidateTenantId && sourceTenantId === candidateTenantId) {
                    continue;
                }

                const pair = this.getInboxPair(source, candidate);
                if (!pair) {
                    continue;
                }

                const sourcePhone = String(source.source_phone || '').trim();
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
        return this.mapInboxPairCandidatesToResponse(tenantId, selected);
    }

    private async buildNetworkInboxMatchesFromRows(tenantId: string, rows: any[], limit: number): Promise<InboxMatchRecord[]> {
        const selected = this.collectNetworkInboxPairCandidates(tenantId, rows).slice(0, limit);
        return this.mapInboxPairCandidatesToResponse(tenantId, selected);
    }

    private async mapInboxPairCandidatesToResponse(tenantId: string, selected: InboxPairCandidate[]): Promise<InboxMatchRecord[]> {
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
            pinned: Boolean(row.pinned),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            unreadCount: counts?.unreadCount || 0,
            itemCount: counts?.itemCount || 0,
        };
    }

    private mapStreamItem(item: any, currentTenantId: string, isRead?: boolean): StreamItemRecord {
        const rawText = String(item.raw_text || '');
        const brokerContacts = buildBrokerContactActions(item, rawText);
        const brokerWaMeLinks = brokerContacts.length > 0
            ? brokerContacts.map((contact) => contact.waLink)
            : (Array.isArray(item.broker_wa_me_links) ? item.broker_wa_me_links : null);
        const locality = String(item.locality || '').trim();
        const dealType = String(item.deal_type || '').trim() || extractDealType(rawText);
        const inferredBhk = String(item.configuration || item.bhk || '').trim() || extractBhk(rawText);
        const inferredBuildingName = sanitizeBuildingNameCandidate(
            String(item.building_name || item.parsed_payload?.buildingName || '').trim() || extractBuildingName(rawText),
        );
        const inferredMicroLocation = sanitizeMicroLocationCandidate(
            String(item.micro_location || item.parsed_payload?.microLocation || '').trim() || extractMicroLocation(rawText),
        );
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
            configuration: inferredBhk,
            propertyCategory,
            areaSqft,
            furnishing: normalizeFurnishing(item.furnishing) || normalizeFurnishing(item.parsed_payload?.furnishing) || normalizeFurnishing(rawText),
            floorNumber: String(item.floor_number || '').trim() || extractFloorNumber(rawText),
            totalFloors: String(item.total_floors || '').trim() || extractTotalFloors(rawText),
            parking: String(item.parking || '').trim() || extractParking(rawText),
            propertyUse: String(item.property_use || '').trim() || extractPropertyUse(rawText),
            brokerWaMeLinks,
            brokerContacts: brokerContacts.length > 0 ? brokerContacts : null,
            posted: formatPostedTime(item.created_at),
            createdAt: item.created_at,
            source,
            sourcePhone,
            brokerName,
            brokerCompany,
            waLink: generateWaLink(item, brokerName, sourcePhone),
            isNetworkItem: String(item.tenant_id || '') !== currentTenantId,
            description: item.raw_text || '',
            rawText: item.raw_text || '',
            recordType: item.record_type || 'unknown',
            dealType,
            assetClass: item.asset_class || 'unknown',
            isCorrected: Boolean(item.parsed_payload?.isCorrected),
            isRead,
            ingestionStatus: item.ingestion_status || 'accepted',
            suppressionReason: item.suppression_reason || null,
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
                        null,
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

        let queueStatuses = new Map<string, IgrQueueStatusPreview>();
        try {
            const statusCandidates = lookupCandidates.slice(0, 200).map((item) => ({
                streamItemId: item.id,
                buildingName: String(item.buildingName || '').trim(),
                locality: String(item.location || '').trim(),
                city: item.city || null,
            }));
            const statusResults = await igrEnrichmentService.getQueueStatusPreviews(statusCandidates);
            queueStatuses = new Map(
                statusCandidates.map((candidate, index) => [
                    String(candidate.streamItemId || ''),
                    statusResults[index],
                ]).filter((entry): entry is [string, IgrQueueStatusPreview] => Boolean(entry[0] && entry[1])),
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || '');
            if (!isMissingSchemaEntityError(message) && !/igr_enrichment_queue|building_name|last_checked_at|status/i.test(message)) {
                console.warn('[ChannelService] Failed to enrich stream with IGR queue status:', message);
            }
        }

        return items.map((item) => {
            const buildingName = String(item.buildingName || '').trim();
            const location = String(item.location || '').trim();
            if (!buildingName || !location) {
                return item;
            }

            const key = `${normalize(buildingName)}|${normalize(location)}`;
            const igrTransactions = cache.get(key);
            const igrQueueStatus = queueStatuses.get(item.id) || null;
            if (!igrTransactions?.length && !igrQueueStatus) {
                return item;
            }

            return {
                ...item,
                ...(igrTransactions?.length ? { igrTransactions } : {}),
                ...(igrQueueStatus ? { igrQueueStatus } : {}),
            };
        });
    }

    private rankAcceptedRows<T extends { confidence_score?: number | string | null; created_at?: string | null }>(items: T[]): T[] {
        if (!Array.isArray(items) || items.length === 0) return items;

        // Stream is a chronological feed. Source frequency must not push a fresh
        // post below older bulk imports; confidence is only a stable tie-breaker.
        return [...items].sort((left, right) => {
            const leftCreatedAt = new Date(left.created_at || 0).getTime();
            const rightCreatedAt = new Date(right.created_at || 0).getTime();
            const leftTimestamp = Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0;
            const rightTimestamp = Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0;

            if (leftTimestamp !== rightTimestamp) {
                return rightTimestamp - leftTimestamp;
            }

            return Number(right.confidence_score || 0) - Number(left.confidence_score || 0);
        });
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
        const [resResult, comResult] = await Promise.all([
            this.buildSingleTableQuery(readClient, 'stream_items_residential', tenantIds, pattern, acceptedOnly, limit),
            this.buildSingleTableQuery(readClient, 'stream_items_commercial', tenantIds, pattern, acceptedOnly, limit),
        ]);
        return [...(Array.isArray(resResult) ? resResult : []), ...(Array.isArray(comResult) ? comResult : [])]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, limit ?? 100);
    }

    private async buildSingleTableQuery(readClient: any, table: string, tenantIds: string[], pattern: string, acceptedOnly: boolean, limit?: number) {
        let query = readClient
            .from(table)
            .select('*')
            .in('tenant_id', tenantIds)
            .ilike('raw_text', `%${pattern}%`);

        if (acceptedOnly) {
            query = query.eq('ingestion_status', 'accepted');
        }

        query = query.not('locality', 'in', '("Mumbai market","Mumbai","Navi Mumbai","Thane","Pune")');
        query = query.or('type.neq.Rent,price_numeric.lte.500000000,price_numeric.is.null');
        query = query.or('type.neq.Rent,price_numeric.lte.5000000,price_numeric.is.null');
        query = query.or('type.neq.Sale,price_numeric.lte.500000000,price_numeric.is.null');

        query = query.order('created_at', { ascending: false });

        if (typeof limit === 'number') {
            query = query.limit(limit);
        }

        const { data } = await query;
        return data || [];
    }
}

export const channelService = new ChannelService();
