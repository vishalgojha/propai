import { aiService } from './aiService';
import { supabaseAdmin } from '../config/supabase';
import { classifyBrokerMessage } from '../utils/brokerMessageClassifier';

const ADMIN_NUMBER = '9820056180';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const LOCATION_CODES: Record<string, string> = {
    'bandra west': 'BND', 'bandra east': 'BND', 'bandra': 'BND',
    'khar west': 'KHR', 'khar east': 'KHR', 'khar': 'KHR',
    'santacruz west': 'SNT', 'santacruz east': 'SNT', 'santacruz': 'SNT',
    'juhu': 'JUH', 'pali hill': 'PNL', 'andheri west': 'AND',
    'andheri east': 'AND', 'andheri': 'AND', 'versova': 'VRS',
    'worli': 'WRL', 'lower parel': 'LPR', 'dadar': 'DDR',
    'mahim': 'MHM', 'prabhadevi': 'PRB', 'bandra kurla complex': 'BKC',
    'bkc': 'BKC', 'powai': 'POW', 'goregaon': 'GOR', 'malad': 'MLD',
    'borivali': 'BOR', 'kandivali': 'KND', 'chembur': 'CHM',
    'vile parle': 'VPL', 'mumbai': 'MUM',
};

export interface SplitItem {
    text: string;
    intent: 'listing' | 'requirement' | 'ignore';
}

type ActionableSplitItem = Omit<SplitItem, 'intent'> & {
    intent: 'listing' | 'requirement';
};

export interface BrokerSignature {
    name: string | null;
    phone: string | null;
    agency: string | null;
}

export interface SplitResult {
    items: SplitItem[];
    broker_signature: BrokerSignature;
}

export interface ListingParsed {
    bhk?: string | null;
    property_type?: 'residential' | 'commercial' | 'office' | 'jodi' | 'pre-leased' | null;
    listing_type?: 'sale' | 'rent' | 'lease' | null;
    locality?: string | null;
    building_name?: string | null;
    price_cr?: number | null;
    rent_monthly?: number | null;
    flags?: string[] | null;
    area_sqft?: number | null;
    floor?: string | null;
    possession?: 'Ready' | 'New Bldg' | 'Under Construction' | null;
}

export interface RequirementParsed {
    bhk_preference?: string[] | null;
    property_type?: 'residential' | 'commercial' | 'any' | null;
    listing_type?: 'sale' | 'rent' | 'lease' | null;
    preferred_localities?: string[] | null;
    budget_min_cr?: number | null;
    budget_max_cr?: number | null;
    rent_budget_monthly?: number | null;
    urgency?: 'high' | 'medium' | 'low' | null;
    possession_timeline?: string | null;
    notes?: string | null;
}

interface ListingExtracted {
    bhk: string;
    property_category: string;
    price: number;
    price_unit: string;
    carpet_area: number | null;
    built_up_area: number | null;
    floor: string | null;
    furnishing: string | null;
    parking: string | null;
    possession: string | null;
    location: string;
    pocket: string | null;
    building_name: string | null;
    listing_type: string;
    amenities: string[] | null;
    description: string | null;
    brokers: Array<{
        name: string;
        phone: string;
        agency: string | null;
        role: string;
    }>;
    ai_title: string;
    ai_description: string;
}

interface RequirementExtracted {
    bhk_preference: string[];
    budget_min: number | null;
    budget_max: number | null;
    budget_unit: string;
    preferred_locations: string[];
    pocket: string | null;
    listing_type: string;
    property_category: string;
    furnishing_preference: string | null;
    parking_required: boolean;
    veg_nonveg: string | null;
    possession_timeline: string | null;
    urgency: string;
    amenities_required: string[] | null;
    notes: string | null;
    broker: {
        name: string;
        phone: string;
        agency: string | null;
    } | null;
}

interface BroadcastParseArgs {
    message: string;
    senderPhone: string;
    senderName: string;
    tenantId: string;
}

interface ParsedItemResult {
    success?: boolean;
    skipped?: boolean;
    reason?: string;
    id?: string | null;
}

export interface BroadcastParseResult {
    success: boolean;
    total: number;
    parsed: number;
    skipped_duplicates: number;
    failed: number;
    ignored_lines: number;
    broker: {
        name: string | null;
        phone: string | null;
    };
    items?: Array<{
        text: string;
        intent: 'listing' | 'requirement';
        status: 'ok' | 'duplicate' | 'failed' | 'error';
        id: string | null;
        error: string | null;
    }>;
    reason?: string;
}

export function cleanMessage(message: string): string {
    const withoutUrls = message.split(' ').filter(word => {
        const lower = word.toLowerCase();
        return !lower.startsWith('http://') && !lower.startsWith('https://');
    }).join(' ');

    let withoutSpecial1 = '';
    let seq1 = '';
    for (const c of withoutUrls) {
        if (c === '°' || c === '•' || c === '~' || c === '_') {
            seq1 += c;
        } else {
            if (seq1.length >= 3) {
            } else {
                withoutSpecial1 += seq1;
            }
            withoutSpecial1 += c;
            seq1 = '';
        }
    }
    if (seq1.length >= 3) {
    } else {
        withoutSpecial1 += seq1;
    }

    let result = '';
    let seq2 = '';
    for (const c of withoutSpecial1) {
        if (c === '-' || c === '=' || c === '*') {
            seq2 += c;
        } else {
            if (seq2.length >= 4) {
            } else {
                result += seq2;
            }
            result += c;
            seq2 = '';
        }
    }
    if (seq2.length >= 4) {
    } else {
        result += seq2;
    }

    return result.trim();
}

export function isPropertyBroadcast(message: string): boolean {
    const classification = classifyBrokerMessage(message);
    return classification.intent === 'listing' || classification.intent === 'requirement';
}

function resolvePhone(phone: string | null | undefined): string | null {
    if (!phone) {
        return null;
    }

    const digits = phone.split('').filter(c => c >= '0' && c <= '9').join('');
    const last10 = digits.slice(-10);

    if (!last10 || last10 === ADMIN_NUMBER) {
        return null;
    }

    return digits.startsWith('91') ? digits : `91${last10}`;
}

function extractJsonPayload(text: string): string {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
        throw new Error('AI returned an empty response');
    }

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
        return fenced[1].trim();
    }

    return trimmed;
}

function parseJson<T>(text: string, context: string): T {
    try {
        return JSON.parse(extractJsonPayload(text)) as T;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown JSON parse error';
        throw new Error(`${context}: ${message}`);
    }
}

function ensureAdminClient() {
    if (!supabaseAdmin) {
        throw new Error('Supabase admin client is not configured');
    }

    return supabaseAdmin;
}

function calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1,
                );
            }
        }
    }

    return matrix[str2.length][str1.length];
}

function normalizeBuildingName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/\s+(tower|building|apartments|residency|heights|complex|chs|society)$/i, '');
}

async function splitBroadcast(message: string, tenantId: string): Promise<SplitResult> {
    const systemPrompt = 'You are a Mumbai real estate data parser. Extract structured listings from broker WhatsApp broadcasts. Return valid JSON only, no markdown.';
    const userPrompt = `Parse this Mumbai broker WhatsApp broadcast into individual property items.

Rules:
- Section headers like "Bandra West:", "*Khar West:*", "🧿 Santacruz West:" define the current locality
- Each property line INHERITS locality from the nearest header above it
- PREPEND inherited locality to each line text: "Khar West — 2 BHK Kesar Kripa 3.55Cr"
- Classify each line:
  - "listing" = broker HAS a property (have/available/outright/for sale/for rent/pre-leased/offices)
  - "requirement" = broker NEEDS a property (need/required/looking/wanted/client ready)
  - "ignore" = headers, separators, greetings, footers, thank you lines
- Lines with no price AND no BHK → "ignore"
- Office/commercial lines with price → "listing"
- Pre-leased properties → "listing"
- Extract broker name + phone if found anywhere in the message
- Phone numbers: include 91 country code prefix

Return ONLY this JSON:
{
  "items": [
    { "text": "Khar West — 2 BHK Kesar Kripa 3.55Cr (TDR)", "intent": "listing" }
  ],
  "broker_signature": {
    "name": "string or null",
    "phone": "string or null",
    "agency": "string or null"
  }
}

Message:
"""
${message}
"""`;

    const raw = await aiService.chat(userPrompt, 'Auto', 'parsing', tenantId, systemPrompt);
    const result = parseJson<SplitResult>(raw.text, 'Failed to parse broadcast split result');

    return {
        items: Array.isArray(result?.items) ? result.items : [],
        broker_signature: {
            name: result?.broker_signature?.name || null,
            phone: result?.broker_signature?.phone || null,
            agency: result?.broker_signature?.agency || null,
        },
    };
}

async function parseListingLine(
    line: string,
    tenantId: string,
    brokerPhone: string | null,
    brokerName: string | null,
    brokerAgency: string | null,
): Promise<ParsedItemResult> {
    const admin = ensureAdminClient();
    const prompt = `Extract property listing with ALL brokers mentioned (team detection).

Message:
"""
${line}
"""

Return this EXACT JSON structure:
{
  "bhk": "string (e.g., '2 BHK', '3 BHK', 'Office Space', 'Studio')",
  "property_category": "Residential or Commercial",
  "price": number (in lakhs),
  "price_unit": "lakhs or crores",
  "carpet_area": number or null,
  "built_up_area": number or null,
  "floor": "string or null",
  "furnishing": "Unfurnished|Semi-Furnished|Fully Furnished|Bare Shell|Warm Shell|Not Applicable or null",
  "parking": "string or null",
  "possession": "string or null",
  "location": "string (e.g., 'Bandra West', 'BKC', 'Kandivali West')",
  "pocket": "string or null (micro-area within location, e.g., 'Linking Road', 'Lokhandwala')",
  "building_name": "string or null",
  "listing_type": "Sale|Rent|Lease",
  "amenities": ["array of strings"] or null,
  "description": "string or null (keep original broker language)",
  "brokers": [
    {
      "name": "string",
      "phone": "string (with 91 prefix)",
      "agency": "string or null",
      "role": "primary or secondary"
    }
  ],
  "ai_title": "string (10-15 word descriptive title)",
  "ai_description": "string (EXACTLY 4-5 complete sentences, 60-80 words, no marketing fluff)"
}

**MULTI-BROKER DETECTION RULES:**
- Extract EVERY unique name + phone combination in the message
- FIRST broker found = "primary" role
- Additional brokers = "secondary" role
- If only one name but multiple phones → one entry per phone, same name
- If multiple names but one phone → primary broker only
- Always add 91 country code prefix to phones
- Same agency name for all brokers if mentioned once

**Common co-broker patterns to detect:**
1. "Contact Ramesh 9820056789 or Priya 9820094416"
2. "Ramesh 9820056789 / Priya 9820094416"
3. "Listed by Ramesh and Priya"
4. "Lacasaa Real Estate - Ramesh 98200... / Priya 98201..."
5. "Thanks, Ramesh (9820056789) & Priya (9820094416)"

**If no brokers found:** return empty brokers array []

Return ONLY valid JSON, no markdown, no explanation.`;

    const raw = await aiService.chat(prompt, 'Auto', 'parsing', tenantId);
    const extracted = parseJson<ListingExtracted>(raw.text, 'Failed to parse listing JSON');

    const listingType = extracted.listing_type ? extracted.listing_type.toLowerCase() as 'sale' | 'rent' | 'lease' : null;

    let priceCr: number | null = null;
    let rentMonthly: number | null = null;
    if (extracted.price) {
        const priceInLakhs = extracted.price_unit === 'crores' ? extracted.price * 100 : extracted.price;
        if (listingType === 'rent' || listingType === 'lease') {
            rentMonthly = priceInLakhs * 100000;
        } else {
            priceCr = priceInLakhs / 100;
        }
    }

    let areaSqft: number | null = null;
    if (extracted.carpet_area) {
        areaSqft = extracted.carpet_area;
    } else if (extracted.built_up_area) {
        areaSqft = extracted.built_up_area;
    }

    let possession: string | null = null;
    if (extracted.possession) {
        const p = extracted.possession.toLowerCase();
        if (p.includes('ready') || p === 'ready') possession = 'Ready';
        else if (p.includes('new')) possession = 'New Bldg';
        else if (p.includes('under construction') || p.includes('uct')) possession = 'Under Construction';
        else possession = extracted.possession;
    }

    const primaryBroker = extracted.brokers?.find(b => b.role === 'primary') || extracted.brokers?.[0] || null;
    const resolvedBrokerName = primaryBroker?.name || brokerName;
    const resolvedBrokerPhone = primaryBroker?.phone || brokerPhone;
    const resolvedBrokerAgency = primaryBroker?.agency || brokerAgency;

    const propertyCategory = extracted.property_category?.toLowerCase() || null;
    let propertyType: 'residential' | 'commercial' | null = null;
    if (propertyCategory === 'residential') propertyType = 'residential';
    else if (propertyCategory === 'commercial') propertyType = 'commercial';

    const parsed: ListingParsed = {
        bhk: extracted.bhk || null,
        property_type: propertyType,
        listing_type: listingType,
        locality: extracted.location || null,
        building_name: extracted.building_name || null,
        price_cr: priceCr,
        rent_monthly: rentMonthly,
        area_sqft: areaSqft,
        floor: extracted.floor || null,
        possession: possession as ListingParsed['possession'],
    };

    // PART 3: Building deduplication
    let buildingName = parsed.building_name;
    if (buildingName) {
        try {
            const normalizedName = normalizeBuildingName(buildingName);
            const { data: existingBuildings } = await admin
                .from('listings')
                .select('building_name, locality')
                .eq('tenant_id', tenantId)
                .not('building_name', 'is', null)
                .limit(100);

            if (existingBuildings) {
                const uniqueBuildings = new Map<string, string>();
                for (const row of existingBuildings) {
                    const key = `${row.locality || ''}|${row.building_name || ''}`;
                    if (!uniqueBuildings.has(key) && row.building_name) {
                        uniqueBuildings.set(key, row.building_name);
                    }
                }

                for (const [, existingName] of uniqueBuildings) {
                    const existingNormalized = normalizeBuildingName(existingName);
                    if (normalizedName === existingNormalized) {
                        buildingName = existingName;
                        break;
                    }
                    const similarity = calculateSimilarity(normalizedName, existingNormalized);
                    if (similarity > 0.8) {
                        buildingName = existingName;
                        break;
                    }
                }
            }
        } catch {
            // Building dedup is non-blocking, proceed with original name
        }
    }

    // PART 4: Duplicate listing detection
    try {
        const activeListings = await admin
            .from('listings')
            .select('id, building_name, locality, bhk, price_cr, rent_monthly, floor, area_sqft')
            .eq('tenant_id', tenantId)
            .is('building_name', buildingName)
            .eq('locality', parsed.locality)
            .eq('bhk', parsed.bhk)
            .limit(50);

        if (activeListings.data && activeListings.data.length > 0) {
            for (const existing of activeListings.data) {
                if (
                    existing.building_name === buildingName &&
                    existing.locality === parsed.locality &&
                    existing.bhk === parsed.bhk
                ) {
                    const existingPrice = existing.price_cr || (existing.rent_monthly ? existing.rent_monthly / 100000 / 100 : 0);
                    const newPrice = priceCr || (rentMonthly ? rentMonthly / 100000 / 100 : 0);
                    if (existingPrice > 0 && newPrice > 0) {
                        const priceDiff = Math.abs(existingPrice - newPrice) / existingPrice;
                        if (priceDiff > 0.10) continue;
                    }

                    if (parsed.floor && existing.floor && existing.floor !== parsed.floor) continue;

                    if (areaSqft && existing.area_sqft) {
                        const areaDiff = Math.abs(areaSqft - existing.area_sqft) / existing.area_sqft;
                        if (areaDiff > 0.05) continue;
                    }

                    return { skipped: true, reason: 'duplicate', id: existing.id };
                }
            }
        }
    } catch {
        // Duplicate check is non-blocking
    }

    const insertPayload = {
        tenant_id: tenantId,
        raw_text: line,
        bhk: parsed.bhk ?? null,
        property_type: parsed.property_type ?? null,
        listing_type: parsed.listing_type ?? null,
        locality: parsed.locality ?? null,
        building_name: buildingName,
        price_cr: parsed.price_cr ?? null,
        rent_monthly: parsed.rent_monthly ?? null,
        area_sqft: parsed.area_sqft ?? null,
        floor: parsed.floor ?? null,
        possession: parsed.possession ?? null,
        broker_name: resolvedBrokerName,
        broker_phone: resolvedBrokerPhone,
        broker_agency: resolvedBrokerAgency,
        source: 'whatsapp_broadcast',
    };

    const { data, error } = await admin
        .from('listings')
        .insert(insertPayload)
        .select('id')
        .single();

    if (error || !data) {
        throw new Error(`Failed to save listing: ${error?.message || 'Insert returned no row'}`);
    }

    return { success: true, id: data.id };
}

async function parseRequirementLine(
    line: string,
    tenantId: string,
    brokerPhone: string | null,
    brokerName: string | null,
    brokerAgency: string | null,
): Promise<ParsedItemResult> {
    const admin = ensureAdminClient();
    const prompt = `Extract broker requirement from this WhatsApp group message.

Message:
"""
${line}
"""

Return this EXACT JSON structure:
{
  "bhk_preference": ["array of strings like '2 BHK', '3 BHK', 'Office Space'"],
  "budget_min": number or null (in lakhs or crores per budget_unit),
  "budget_max": number or null,
  "budget_unit": "lakhs or crores",
  "preferred_locations": ["array of Mumbai location strings"],
  "pocket": "string or null (micro-area)",
  "listing_type": "Sale|Rent|Lease",
  "property_category": "Residential or Commercial",
  "furnishing_preference": "Unfurnished|Semi-Furnished|Fully Furnished|Any or null",
  "parking_required": boolean,
  "veg_nonveg": "Veg Only|Non-Veg Allowed|Both or null",
  "possession_timeline": "string or null (e.g., 'Immediate', 'Within 2 months')",
  "urgency": "High|Medium|Low",
  "amenities_required": ["array of strings"] or null,
  "notes": "string or null",
  "broker": {
    "name": "string (broker name from message)",
    "phone": "string (with 91 prefix)",
    "agency": "string or null"
  }
}

**RULES:**
- Extract broker name + phone from the message if present
- If no broker name/phone found → set broker to null
- Always add 91 country code prefix to phones

Return ONLY valid JSON, no markdown, no explanation.`;

    const raw = await aiService.chat(prompt, 'Auto', 'parsing', tenantId);
    const extracted = parseJson<RequirementExtracted>(raw.text, 'Failed to parse requirement JSON');

    const listingType = extracted.listing_type ? extracted.listing_type.toLowerCase() as 'sale' | 'rent' | 'lease' : null;

    let budgetMinCr: number | null = null;
    let budgetMaxCr: number | null = null;
    let rentBudgetMonthly: number | null = null;
    if (extracted.budget_min || extracted.budget_max) {
        const toCr = (val: number) => extracted.budget_unit === 'lakhs' ? val / 100 : val;
        const toMonthly = (val: number) => extracted.budget_unit === 'lakhs' ? val * 100000 : val * 10000000;
        if (listingType === 'rent' || listingType === 'lease') {
            if (extracted.budget_min) rentBudgetMonthly = toMonthly(extracted.budget_min);
            if (extracted.budget_max) rentBudgetMonthly = toMonthly(extracted.budget_max);
        } else {
            if (extracted.budget_min) budgetMinCr = toCr(extracted.budget_min);
            if (extracted.budget_max) budgetMaxCr = toCr(extracted.budget_max);
        }
    }

    const propertyCategory = extracted.property_category?.toLowerCase() || null;
    let propertyType: 'residential' | 'commercial' | 'any' | null = null;
    if (propertyCategory === 'residential') propertyType = 'residential';
    else if (propertyCategory === 'commercial') propertyType = 'commercial';
    else propertyType = 'any';

    const urgency = extracted.urgency ? extracted.urgency.toLowerCase() as 'high' | 'medium' | 'low' : null;

    const resolvedBroker = extracted.broker;
    const resolvedName = resolvedBroker?.name || brokerName;
    const resolvedPhone = resolvedBroker?.phone || brokerPhone;
    const resolvedAgency = resolvedBroker?.agency || brokerAgency;

    const insertPayload = {
        tenant_id: tenantId,
        raw_text: line,
        bhk_preference: extracted.bhk_preference ?? [],
        property_type: propertyType,
        listing_type: listingType,
        preferred_localities: extracted.preferred_locations ?? [],
        budget_min_cr: budgetMinCr,
        budget_max_cr: budgetMaxCr,
        rent_budget_monthly: rentBudgetMonthly,
        urgency: urgency,
        possession_timeline: extracted.possession_timeline ?? null,
        notes: extracted.notes ?? null,
        broker_name: resolvedName,
        broker_phone: resolvedPhone,
        broker_agency: resolvedAgency,
        source: 'whatsapp_broadcast',
    };

    const { data, error } = await admin
        .from('requirements')
        .insert(insertPayload)
        .select('id')
        .single();

    if (error || !data) {
        throw new Error(`Failed to save requirement: ${error?.message || 'Insert returned no row'}`);
    }

    return { success: true, id: data.id };
}

export async function parseBroadcastMessage(args: BroadcastParseArgs): Promise<BroadcastParseResult> {
    const cleanedMessage = cleanMessage(args.message);

    if (!cleanedMessage || !isPropertyBroadcast(cleanedMessage)) {
        return {
            success: false,
            reason: 'noise',
            total: 0,
            parsed: 0,
            skipped_duplicates: 0,
            failed: 0,
            ignored_lines: 0,
            broker: { name: null, phone: null },
        };
    }

    const splitResult = await splitBroadcast(cleanedMessage, args.tenantId);
    const resolvedPhone = resolvePhone(splitResult.broker_signature?.phone) ?? resolvePhone(args.senderPhone);
    const resolvedName = splitResult.broker_signature?.name ?? args.senderName;
    const resolvedAgency = splitResult.broker_signature?.agency ?? null;
    const actionable: ActionableSplitItem[] = splitResult.items.filter(
        (item): item is ActionableSplitItem => item.intent !== 'ignore',
    );

    const results = await Promise.allSettled(
        actionable.map((item) => {
            const enriched = `${item.text}\nBroker: ${resolvedName || ''} ${resolvedPhone || ''}`.trim();

            return item.intent === 'listing'
                ? parseListingLine(enriched, args.tenantId, resolvedPhone, resolvedName, resolvedAgency)
                : parseRequirementLine(enriched, args.tenantId, resolvedPhone, resolvedName, resolvedAgency);
        }),
    );

    return {
        success: true,
        total: actionable.length,
        parsed: results.filter((result) => result.status === 'fulfilled' && result.value?.success).length,
        skipped_duplicates: results.filter((result) => result.status === 'fulfilled' && result.value?.skipped).length,
        failed: results.filter((result) => result.status === 'rejected').length,
        ignored_lines: splitResult.items.filter((item) => item.intent === 'ignore').length,
        broker: {
            name: resolvedName,
            phone: resolvedPhone,
        },
        items: results.map((result, index) => ({
            text: actionable[index].text,
            intent: actionable[index].intent,
            status: result.status === 'fulfilled'
                ? result.value?.skipped
                    ? 'duplicate'
                    : result.value?.success
                        ? 'ok'
                        : 'failed'
                : 'error',
            id: result.status === 'fulfilled' ? result.value?.id || null : null,
            error: result.status === 'rejected'
                ? result.reason instanceof Error
                    ? result.reason.message
                    : 'Unknown parsing error'
                : null,
        })),
    };
}

export const broadcastParserService = {
    parseBroadcast: parseBroadcastMessage,
};
