import { supabase } from '../config/supabase';
import { normalizeMumbaiLocation } from '../utils/locationNormalization';
import { normalizeIndianPhoneNumber } from '../utils/phoneNormalization';

type CaptureGroupMessageInput = {
    tenantId: string;
    groupId: string;
    groupName?: string | null;
    message: string;
    senderNumber?: string | null;
    senderName?: string | null;
    timestamp?: string | null;
};

type ParsedEntry = {
    type: 'listing' | 'requirement';
    area?: string;
    sub_area?: string;
    price?: number;
    price_type?: 'sale' | 'monthly';
    size_sqft?: number;
    bhk?: number;
    property_type?: string;
    furnishing?: string;
};

function parsePhones(text: string) {
    const matches = text.match(/(?:\+91[\s-]?)?[6-9]\d[\d\s-]{8,12}/g) || [];
    const unique = new Set<string>();

    for (const match of matches) {
        const normalized = normalizeIndianPhoneNumber(match);
        if (normalized) unique.add(normalized);
    }

    return Array.from(unique).map((phone) => ({ name: '', number: phone }));
}

function parseBhk(text: string) {
    const match = text.match(/(\d(?:\.\d)?)\s*bhk/i);
    return match ? Number(match[1]) : null;
}

function parseSizeSqft(text: string) {
    const match = text.match(/(\d{3,5})\s*(?:sq\.?\s*ft|sqft|sf|carpet|built[-\s]?up)/i);
    return match ? Number(match[1]) : null;
}

function parsePrice(text: string) {
    const compact = text.toLowerCase();
    const crore = compact.match(/(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(cr|crore|crores)/i);
    if (crore) {
        return { price: Math.round(Number(crore[1]) * 10000000), priceType: 'sale' as const };
    }

    const lakh = compact.match(/(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(lac|lakh|lakhs|l)/i);
    if (lakh) {
        return { price: Math.round(Number(lakh[1]) * 100000), priceType: 'sale' as const };
    }

    const thousandRent = compact.match(/(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(k|thousand)(?:\s*\/?\s*(?:month|pm))?/i);
    if (thousandRent) {
        return { price: Math.round(Number(thousandRent[1]) * 1000), priceType: 'monthly' as const };
    }

    const plainRent = compact.match(/(?:rent|lease)[^\d]{0,12}(?:rs\.?|₹)?\s*(\d{4,7})/i);
    if (plainRent) {
        return { price: Number(plainRent[1]), priceType: 'monthly' as const };
    }

    return { price: null, priceType: null };
}

function parsePropertyType(text: string) {
    const compact = text.toLowerCase();
    if (/(office|commercial)/i.test(compact)) return 'office';
    if (/(shop|retail)/i.test(compact)) return 'shop';
    if (/(plot|land)/i.test(compact)) return 'plot';
    if (/(villa|bungalow|house)/i.test(compact)) return 'house';
    if (/(flat|apartment|bhk|residential)/i.test(compact)) return 'apartment';
    return null;
}

function parseFurnishing(text: string) {
    const compact = text.toLowerCase();
    if (compact.includes('fully furnished')) return 'fully furnished';
    if (compact.includes('semi furnished')) return 'semi furnished';
    if (compact.includes('unfurnished')) return 'unfurnished';
    return null;
}

function parseListingType(text: string) {
    const compact = text.toLowerCase();
    if (/(requirement|wanted|looking for|need\b)/i.test(compact)) return 'requirement' as const;
    if (/(sale|sell|for sale|ownership)/i.test(compact)) return 'listing' as const;
    if (/(rent|lease|leave.?and.?license|l&l)/i.test(compact)) return 'listing' as const;
    return null;
}

const LOCATION_HINTS = [
    'Bandra', 'Khar', 'Santacruz', 'Andheri', 'Juhu', 'BKC', 'Lower Parel', 'Worli', 'Prabhadevi',
    'Dadar', 'Mahim', 'Powai', 'Goregaon', 'Malad', 'Versova', 'Borivali', 'Kandivali', 'Chembur',
    'Vile Parle', 'Colaba', 'Nariman Point', 'Marine Drive', 'Breach Candy', 'Malabar Hill', 'Cuffe Parade'
];

function parseLocation(text: string) {
    for (const hint of LOCATION_HINTS) {
        const regex = new RegExp(`\\b${hint.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (regex.test(text)) {
            return normalizeMumbaiLocation(hint);
        }
    }

    const inMatch = text.match(/\b(?:at|in|near)\s+([A-Za-z ]{3,40})/i);
    if (!inMatch) {
        return { location: null, pocket: null };
    }

    return normalizeMumbaiLocation(inMatch[1].trim());
}

function shouldCaptureMessage(text: string) {
    const compact = text.trim();
    if (compact.length < 20) return false;

    return /(bhk|rent|lease|sale|requirement|wanted|sq\s*ft|sqft|carpet|furnished|office|shop|flat|apartment|₹|rs\.?|\bcr\b|\blac|\blakh|\bk\b)/i.test(compact);
}

function parseEntry(text: string): ParsedEntry | null {
    if (!shouldCaptureMessage(text)) return null;

    const listingType = parseListingType(text);
    const { location, pocket } = parseLocation(text);
    const { price, priceType } = parsePrice(text);
    const bhk = parseBhk(text);
    const sizeSqft = parseSizeSqft(text);
    const propertyType = parsePropertyType(text);
    const furnishing = parseFurnishing(text);

    if (!listingType && !location && !price && !bhk && !sizeSqft && !propertyType) {
        return null;
    }

    return {
        type: listingType || 'listing',
        area: location || undefined,
        sub_area: pocket || undefined,
        price: price || undefined,
        price_type: priceType || undefined,
        size_sqft: sizeSqft || undefined,
        bhk: bhk || undefined,
        property_type: propertyType || undefined,
        furnishing: furnishing || undefined,
    };
}

class WhatsAppStreamIngestionService {
    async captureGroupMessage(input: CaptureGroupMessageInput) {
        const message = String(input.message || '').trim();
        if (!message) return;

        const entry = parseEntry(message);
        if (!entry) return;

        const contacts = parsePhones(message);
        const senderNumber = normalizeIndianPhoneNumber(input.senderNumber || '') || input.senderNumber || null;

        const { error } = await supabase
            .from('whatsapp_messages')
            .insert({
                tenant_id: input.tenantId,
                group_id: input.groupId,
                group_name: input.groupName || input.groupId,
                type: entry.type,
                message,
                cleaned_message: message.replace(/\s+/g, ' ').trim(),
                sender_number: senderNumber,
                contacts,
                entries: [entry],
                confidence: 0.55,
                status: 'processed',
                timestamp: input.timestamp || new Date().toISOString(),
            });

        if (error) {
            throw error;
        }
    }
}

export const whatsappStreamIngestionService = new WhatsAppStreamIngestionService();
