import { aiService } from './aiService';
import { supabaseAdmin } from '../config/supabase';

const ADMIN_NUMBER = '9820056180';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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
    // Remove URLs (words starting with http:// or https://)
    const withoutUrls = message.split(' ').filter(word => {
        const lower = word.toLowerCase();
        return !lower.startsWith('http://') && !lower.startsWith('https://');
    }).join(' ');
    
    // Remove sequences of 3+ special characters: °•~_
    let withoutSpecial1 = '';
    let seq1 = '';
    for (const c of withoutUrls) {
        if (c === '°' || c === '•' || c === '~' || c === '_') {
            seq1 += c;
        } else {
            if (seq1.length >= 3) {
                // Skip the sequence
            } else {
                withoutSpecial1 += seq1;
            }
            withoutSpecial1 += c;
            seq1 = '';
        }
    }
    if (seq1.length >= 3) {
        // Skip the sequence
    } else {
        withoutSpecial1 += seq1;
    }
    
    // Remove sequences of 4+ special characters: -=*
    let result = '';
    let seq2 = '';
    for (const c of withoutSpecial1) {
        if (c === '-' || c === '=' || c === '*') {
            seq2 += c;
        } else {
            if (seq2.length >= 4) {
                // Skip the sequence
            } else {
                result += seq2;
            }
            result += c;
            seq2 = '';
        }
    }
    if (seq2.length >= 4) {
        // Skip the sequence
    } else {
        result += seq2;
    }
    
    return result.trim();
}

export function isPropertyBroadcast(message: string): boolean {
    const lower = message.toLowerCase();
    
    // Check for price indicators
    const hasPrice = lower.includes('₹') || 
                    lower.includes('cr') || 
                    lower.includes('crore') || 
                    lower.includes('lakh') || 
                    lower.includes('/month') || 
                    lower.includes('rent');
    
    // Check for property type indicators
    const hasProperty = lower.includes('bhk') || 
                       lower.includes('office') || 
                       lower.includes('shop') || 
                       lower.includes('commercial') || 
                       lower.includes('outright') || 
                       lower.includes('residential');
    
    // Check for location indicators
    const locations = ['bandra', 'khar', 'santacruz', 'juhu', 'andheri', 'worli', 'dadar', 'powai', 'borivali', 'malad', 'goregaon', 'kandivali', 'chembur', 'parel', 'mahim', 'versova'];
    const hasLocation = locations.some(loc => lower.includes(loc));
    
    return hasPrice && (hasProperty || hasLocation);
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
    const prompt = `Extract a structured property listing from this Mumbai broker message.

Return ONLY this JSON:
{
  "bhk": "2 BHK",
  "property_type": "residential" | "commercial" | "office" | "jodi" | "pre-leased",
  "listing_type": "sale" | "rent" | "lease",
  "locality": "string",
  "building_name": "string or null",
  "price_cr": number or null,
  "rent_monthly": number or null,
  "flags": ["TDR", "No OC", "New Bldg", "Stilt parking", "Only for Gujaratis"],
  "area_sqft": number or null,
  "floor": "string or null",
  "possession": "Ready" | "New Bldg" | "Under Construction" | null
}

Message: ${line}`;

    const raw = await aiService.chat(prompt, 'Auto', 'parsing', tenantId);
    const parsed = parseJson<ListingParsed>(raw.text, 'Failed to parse listing JSON');

    const duplicateSince = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    const { data: existing, error: duplicateError } = await admin
        .from('listings')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('building_name', parsed.building_name ?? null)
        .eq('bhk', parsed.bhk ?? null)
        .eq('locality', parsed.locality ?? null)
        .gte('created_at', duplicateSince)
        .limit(1);

    if (duplicateError) {
        throw new Error(`Listing duplicate check failed: ${duplicateError.message}`);
    }

    if (existing?.length) {
        return { skipped: true, reason: 'duplicate', id: existing[0].id };
    }

    const insertPayload = {
        tenant_id: tenantId,
        raw_text: line,
        bhk: parsed.bhk ?? null,
        property_type: parsed.property_type ?? null,
        listing_type: parsed.listing_type ?? null,
        locality: parsed.locality ?? null,
        building_name: parsed.building_name ?? null,
        price_cr: parsed.price_cr ?? null,
        rent_monthly: parsed.rent_monthly ?? null,
        flags: parsed.flags ?? [],
        area_sqft: parsed.area_sqft ?? null,
        floor: parsed.floor ?? null,
        possession: parsed.possession ?? null,
        broker_name: brokerName,
        broker_phone: brokerPhone,
        broker_agency: brokerAgency,
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
    const prompt = `Extract a structured property requirement from this Mumbai broker message.

Return ONLY this JSON:
{
  "bhk_preference": ["2 BHK", "3 BHK"],
  "property_type": "residential" | "commercial" | "any",
  "listing_type": "sale" | "rent" | "lease",
  "preferred_localities": ["string"],
  "budget_min_cr": number or null,
  "budget_max_cr": number or null,
  "rent_budget_monthly": number or null,
  "urgency": "high" | "medium" | "low",
  "possession_timeline": "string or null",
  "notes": "string or null"
}

Message: ${line}`;

    const raw = await aiService.chat(prompt, 'Auto', 'parsing', tenantId);
    const parsed = parseJson<RequirementParsed>(raw.text, 'Failed to parse requirement JSON');

    const insertPayload = {
        tenant_id: tenantId,
        raw_text: line,
        bhk_preference: parsed.bhk_preference ?? [],
        property_type: parsed.property_type ?? null,
        listing_type: parsed.listing_type ?? null,
        preferred_localities: parsed.preferred_localities ?? [],
        budget_min_cr: parsed.budget_min_cr ?? null,
        budget_max_cr: parsed.budget_max_cr ?? null,
        rent_budget_monthly: parsed.rent_budget_monthly ?? null,
        urgency: parsed.urgency ?? null,
        possession_timeline: parsed.possession_timeline ?? null,
        notes: parsed.notes ?? null,
        broker_name: brokerName,
        broker_phone: brokerPhone,
        broker_agency: brokerAgency,
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
