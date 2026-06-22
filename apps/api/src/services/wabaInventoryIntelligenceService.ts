import { supabaseAdmin } from '../config/supabase';
import type { ConversationMessage } from '../memory/conversationMemory';

type StreamTable = 'stream_items_residential' | 'stream_items_commercial';

type AttributedItem = {
    id: string;
    ref_no: string | null;
    table: StreamTable;
    record_type: string | null;
    ingestion_status: string | null;
    locality: string | null;
    city: string | null;
    bhk: string | null;
    configuration: string | null;
    price_label: string | null;
    price_numeric: number | null;
    area_sqft: number | null;
    raw_text: string | null;
    parsed_payload: Record<string, unknown> | null;
    created_at: string | null;
};

function phoneVariants(value: string) {
    const phone = String(value || '').replace(/\D/g, '').slice(-10);
    return phone.length === 10 ? [phone, `91${phone}`, `+91${phone}`] : [];
}

function isInventoryReviewRequest(text: string) {
    return /\b(?:review|check|show|verify|update)\b.{0,32}\b(?:inventory|listing|availability|available)\b|\b(?:inventory|availability)\s*(?:review|check)\b/i.test(text);
}

function isGreeting(text: string) {
    return /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|start)$/i.test(text.trim());
}

function lastAssistantReply(history: ConversationMessage[]) {
    return [...history].reverse().find((entry) => entry.role === 'assistant')?.content || '';
}

function normaliseBhk(value: unknown) {
    const match = String(value || '').match(/(\d(?:\.5)?)\s*(?:bhk)?/i);
    return match?.[1] || null;
}

function missingFields(item: AttributedItem) {
    const fields: string[] = [];
    if (!item.locality) fields.push('locality');
    if (!item.price_label && !item.price_numeric) fields.push('price');
    if (!(item.bhk || item.configuration)) fields.push(item.table === 'stream_items_commercial' ? 'space type' : 'configuration');
    if (!item.area_sqft) fields.push('area');
    return fields;
}

function discrepancies(item: AttributedItem) {
    const issues: string[] = [];
    const rawBhk = normaliseBhk(item.raw_text);
    const storedBhk = normaliseBhk(item.bhk || item.configuration);
    if (rawBhk && storedBhk && rawBhk !== storedBhk) {
        issues.push(`message says ${rawBhk} BHK; saved record says ${storedBhk} BHK`);
    }

    const payload = item.parsed_payload || {};
    const payloadBhk = normaliseBhk(payload.bhk || payload.configuration);
    if (payloadBhk && storedBhk && payloadBhk !== storedBhk) {
        issues.push(`parsed details say ${payloadBhk} BHK; saved record says ${storedBhk} BHK`);
    }
    return issues;
}

function hasInventoryReviewPrompt(text: string) {
    return /Inventory review:/i.test(text);
}

function statusInstructions() {
    return 'Reply ALL ACTIVE, ALL INACTIVE, or e.g. L-0001 ACTIVE / L-0002 INACTIVE.';
}

export class WabaInventoryIntelligenceService {
    async maybeHandle(input: {
        remoteJid: string;
        text: string;
        isFirstContact: boolean;
        isKnownBroker: boolean;
        history: ConversationMessage[];
    }): Promise<string | null> {
        if (!input.isKnownBroker || !supabaseAdmin) return null;

        const previousReply = lastAssistantReply(input.history);
        const statusReply = await this.tryHandleAvailabilityReply(input.remoteJid, input.text, previousReply);
        if (statusReply) return statusReply;

        // A broker should see this automatically once when they first speak to
        // Pulse. Later reviews are explicit, so normal WhatsApp work is never
        // interrupted by repeated inventory reminders.
        if (!((input.isFirstContact && isGreeting(input.text)) || isInventoryReviewRequest(input.text))) {
            return null;
        }

        const items = await this.findAttributedItems(input.remoteJid);
        const listings = items.filter((item) => item.record_type === 'listing');
        const requirements = items.filter((item) => item.record_type === 'requirement');
        if (listings.length === 0 && requirements.length === 0) return null;

        const activeListings = listings.filter((item) => item.ingestion_status !== 'expired' && item.ingestion_status !== 'suppressed');
        const incomplete = listings
            .map((item) => ({ item, fields: missingFields(item) }))
            .filter(({ fields }) => fields.length > 0);
        const conflicts = listings
            .map((item) => ({ item, issues: discrepancies(item) }))
            .filter(({ issues }) => issues.length > 0);

        const parts = [
            `Inventory review: I found ${listings.length} listing${listings.length === 1 ? '' : 's'} and ${requirements.length} requirement${requirements.length === 1 ? '' : 's'} previously posted from this WhatsApp number.`,
            activeListings.length > 0
                ? `${activeListings.length} listing${activeListings.length === 1 ? '' : 's'} need an availability check. ${statusInstructions()}`
                : 'Your attributed listings are currently marked inactive or expired. Send a fresh listing anytime to reactivate inventory.',
        ];

        if (incomplete.length > 0) {
            parts.push(`Missing details: ${incomplete.slice(0, 3).map(({ item, fields }) => `${item.ref_no || 'listing'} (${fields.join(', ')})`).join('; ')}.`);
        }
        if (conflicts.length > 0) {
            parts.push(`Data check: ${conflicts.slice(0, 2).map(({ item, issues }) => `${item.ref_no || 'listing'} — ${issues[0]}`).join('; ')}.`);
        }
        parts.push('Only records whose source number matches this chat are included; other market inventory is not treated as yours.');
        return parts.join('\n\n');
    }

    private async findAttributedItems(remoteJid: string): Promise<AttributedItem[]> {
        const variants = phoneVariants(remoteJid);
        if (variants.length === 0 || !supabaseAdmin) return [];

        const [residential, commercial] = await Promise.all([
            supabaseAdmin
                .from('stream_items_residential')
                .select('id, ref_no, record_type, ingestion_status, locality, city, bhk, configuration, price_label, price_numeric, area_sqft, raw_text, parsed_payload, created_at')
                .in('source_phone', variants)
                .order('created_at', { ascending: false })
                .limit(500),
            supabaseAdmin
                .from('stream_items_commercial')
                .select('id, ref_no, record_type, ingestion_status, locality, city, configuration, price_label, price_numeric, area_sqft, raw_text, parsed_payload, created_at')
                .in('source_phone', variants)
                .order('created_at', { ascending: false })
                .limit(500),
        ]);
        if (residential.error) console.warn('[WabaInventoryIntelligence] Residential lookup failed', residential.error.message);
        if (commercial.error) console.warn('[WabaInventoryIntelligence] Commercial lookup failed', commercial.error.message);

        return [
            ...((residential.data || []).map((item: any) => ({ ...item, table: 'stream_items_residential' as const }))),
            ...((commercial.data || []).map((item: any) => ({ ...item, bhk: item.configuration, table: 'stream_items_commercial' as const }))),
        ];
    }

    private async tryHandleAvailabilityReply(remoteJid: string, text: string, previousReply: string): Promise<string | null> {
        if (!hasInventoryReviewPrompt(previousReply)) return null;
        const normalized = text.trim().toUpperCase();
        const items = await this.findAttributedItems(remoteJid);
        const listings = items.filter((item) => item.record_type === 'listing');
        if (listings.length === 0) return null;

        if (/^ALL\s+ACTIVE$/.test(normalized)) {
            await this.updateAvailability(listings, 'active');
            return `Marked ${listings.length} listing${listings.length === 1 ? '' : 's'} active. I will use those for matches.`;
        }
        if (/^ALL\s+INACTIVE$/.test(normalized)) {
            await this.updateAvailability(listings, 'inactive');
            return `Marked ${listings.length} listing${listings.length === 1 ? '' : 's'} inactive and removed them from active matching.`;
        }

        const selections = [...text.matchAll(/\b(L-\d+)\s*(?:is\s*)?(ACTIVE|INACTIVE)\b/gi)]
            .map((match) => ({ refNo: match[1].toUpperCase(), status: match[2].toLowerCase() as 'active' | 'inactive' }));
        if (selections.length === 0) return null;

        const selected = listings.filter((item) => selections.some((selection) => selection.refNo === String(item.ref_no || '').toUpperCase()));
        if (selected.length === 0) return 'I could not find those listing references under this WhatsApp number. Please check the reference numbers and try again.';
        await Promise.all([
            this.updateAvailability(selected.filter((item) => selections.some((selection) => selection.refNo === item.ref_no && selection.status === 'active')), 'active'),
            this.updateAvailability(selected.filter((item) => selections.some((selection) => selection.refNo === item.ref_no && selection.status === 'inactive')), 'inactive'),
        ]);
        return `Updated ${selected.map((item) => item.ref_no).filter(Boolean).join(', ')}. Send a corrected post with its reference number whenever you want me to fix missing details.`;
    }

    private async updateAvailability(items: AttributedItem[], status: 'active' | 'inactive') {
        if (!supabaseAdmin || items.length === 0) return;
        const db = supabaseAdmin;
        const now = new Date().toISOString();
        await Promise.all((['stream_items_residential', 'stream_items_commercial'] as const).map(async (table) => {
            const tableItems = items.filter((item) => item.table === table);
            if (tableItems.length === 0) return;
            const { error } = await db
                .from(table)
                .update({
                    ingestion_status: status === 'active' ? 'accepted' : 'expired',
                    expires_at: status === 'active' ? null : now,
                })
                .in('id', tableItems.map((item) => item.id));
            if (error) throw error;

            await Promise.all(tableItems.map(async (item) => {
                const { error: payloadError } = await db
                    .from(table)
                    .update({
                        parsed_payload: {
                            ...(item.parsed_payload || {}),
                            availability_status: status,
                            availability_confirmed_at: now,
                            availability_confirmed_via: 'waba',
                        },
                    })
                    .eq('id', item.id);
                if (payloadError) throw payloadError;
            }));
        }));
    }
}

export const wabaInventoryIntelligenceService = new WabaInventoryIntelligenceService();
