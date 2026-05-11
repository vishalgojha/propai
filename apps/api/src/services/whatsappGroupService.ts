import { supabase, supabaseAdmin } from '../config/supabase';
import { parseIndianLocation } from '../utils/locationParser';

type SupportedCategory = 'broker' | 'rental' | 'sale' | 'commercial' | 'mixed' | 'other';

type RawGroupInput = {
    id: string;
    name: string;
    participantsCount?: number;
};

type GroupListFilters = {
    onlyBroadcastEnabled?: boolean;
    includeArchived?: boolean;
};

const db = supabaseAdmin || supabase;

const NON_REAL_ESTATE_KEYWORDS = [
    'family', 'sfg', 'friends', 'crypto', 'school',
    'college', 'personal', 'fun', 'news', 'politics',
    'gaming', 'memes', 'music', 'movie', 'travel',
    'food', 'cooking', 'sports', 'fitness', 'health',
];

function isLikelyRealEstate(name: string): boolean {
    const normalized = String(name || '').toLowerCase();
    return !NON_REAL_ESTATE_KEYWORDS.some((kw) => {
        const pattern = new RegExp(`\\b${kw}\\b`, 'i');
        return pattern.test(normalized);
    });
}

function normalizeName(value: string) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function uniqueStrings(values: Array<string | null | undefined>) {
    return Array.from(
        new Set(values.map((value) => String(value || '').trim()).filter(Boolean)),
    );
}

function inferCategory(name: string): SupportedCategory {
    const normalized = normalizeName(name);
    if (/\b(commercial|office|shop|retail|warehouse)\b/.test(normalized)) return 'commercial';

    const hasRental = /\b(rent|rental|lease|tenant)\b/.test(normalized);
    const hasSale = /\b(sale|resale|outright|buy)\b/.test(normalized);
    const hasBroker = /\b(broker|brokers|realtor|realtors|agent|agents|estate)\b/.test(normalized);

    if (hasRental && !hasSale) return 'rental';
    if (hasSale && !hasRental) return 'sale';
    if (hasBroker) return 'broker';
    if (hasRental && hasSale) return 'mixed';
    return 'other';
}

function inferTags(name: string, locality?: string | null, category?: string | null) {
    const normalized = normalizeName(name);
    const tags = new Set<string>();

    if (locality) tags.add(locality.toLowerCase());
    if (category) tags.add(category.toLowerCase());
    if (/\bbroker|brokers|realtor|realtors|agent|agents\b/.test(normalized)) tags.add('broker');
    if (/\brent|rental|lease|tenant\b/.test(normalized)) tags.add('rental');
    if (/\bsale|resale|outright|buy\b/.test(normalized)) tags.add('sale');
    if (/\bcommercial|office|shop|retail|warehouse\b/.test(normalized)) tags.add('commercial');
    if (/\bresidential|society|apartment|tower\b/.test(normalized)) tags.add('residential');

    return Array.from(tags);
}

export class WhatsAppGroupService {
    async syncGroups(tenantId: string, sessionLabel: string, groups: RawGroupInput[]) {
        const uniqueGroups = Array.from(
            new Map((groups || []).filter((group) => group?.id).map((group) => [group.id, group])).values(),
        );
        const now = new Date().toISOString();
        const sessionId = `${tenantId}:${sessionLabel}`;
        let syncedCount = 0;
        let failedCount = 0;

        for (const group of uniqueGroups) {
            try {
                const parsedLocation = parseIndianLocation(group.name || '');
                const inferredLocality = parsedLocation?.locality || null;
                const inferredCity = parsedLocation?.city && parsedLocation.city !== 'Unknown' ? parsedLocation.city : null;
                const inferredCategory = inferCategory(group.name || '');
                const inferredTags = inferTags(group.name || '', inferredLocality, inferredCategory);

                const { data: existing, error: existingError } = await db
                    .from('whatsapp_groups')
                    .select('locality, city, category, tags, broadcast_enabled, is_archived, is_parsing')
                    .eq('workspace_id', tenantId)
                    .eq('group_jid', group.id)
                    .maybeSingle();

                if (existingError) {
                    console.error('[WhatsAppGroupService] Failed to fetch existing group', group.id, existingError);
                    failedCount++;
                    continue;
                }

                const isRealEstate = isLikelyRealEstate(group.name || '');
                const payload = {
                    workspace_id: tenantId,
                    session_id: sessionId,
                    tenant_id: tenantId,
                    session_label: sessionLabel,
                    group_jid: group.id,
                    group_name: group.name || group.id,
                    normalized_name: normalizeName(group.name || group.id),
                    locality: existing?.locality || inferredLocality,
                    city: existing?.city || inferredCity,
                    category: existing?.category || inferredCategory,
                    tags: uniqueStrings([...(existing?.tags || []), ...inferredTags]),
                    participant_count: Number(group.participantsCount || 0),
                    member_count: Number(group.participantsCount || 0),
                    is_parsing: typeof existing?.is_parsing === 'boolean' ? existing.is_parsing : isRealEstate,
                    last_message_at: now,
                    last_active_at: now,
                    broadcast_enabled: typeof existing?.broadcast_enabled === 'boolean' ? existing.broadcast_enabled : true,
                    is_archived: typeof existing?.is_archived === 'boolean' ? existing.is_archived : false,
                    updated_at: now,
                };

                const { error } = await db
                    .from('whatsapp_groups')
                    .upsert(payload, { onConflict: 'workspace_id,group_jid' });

                if (error) {
                    console.error('[WhatsAppGroupService] Failed to upsert group', group.id, error);
                    failedCount++;
                    continue;
                }

                syncedCount++;
            } catch (groupError: unknown) {
                console.error('[WhatsAppGroupService] Unexpected error syncing group', group.id, groupError);
                failedCount++;
            }
        }

        return { total: uniqueGroups.length, synced: syncedCount, failed: failedCount };
    }

    async listGroups(tenantId: string, filters: GroupListFilters = {}) {
        let query = db
            .from('whatsapp_groups')
            .select('*')
            .eq('workspace_id', tenantId)
            .order('broadcast_enabled', { ascending: false })
            .order('last_active_at', { ascending: false, nullsFirst: false });

        if (!filters.includeArchived) {
            query = query.eq('is_archived', false);
        }

        if (filters.onlyBroadcastEnabled) {
            query = query.eq('broadcast_enabled', true);
        }

        const { data, error } = await query;
        if (error) {
            throw error;
        }

        return (data || []).map((row: any) => ({
            id: row.group_jid,
            groupJid: row.group_jid,
            name: row.group_name,
            normalizedName: row.normalized_name,
            locality: row.locality || null,
            city: row.city || null,
            category: row.category || 'other',
            tags: Array.isArray(row.tags) ? row.tags : [],
            participantsCount: Number(row.member_count || 0),
            broadcastEnabled: Boolean(row.broadcast_enabled),
            isArchived: Boolean(row.is_archived),
            isParsing: Boolean(row.is_parsing),
            lastActiveAt: row.last_active_at || null,
            sessionLabel: row.session_label || null,
        }));
    }

    async updateGroup(tenantId: string, groupJid: string, updates: {
        groupName?: string | null;
        locality?: string | null;
        city?: string | null;
        category?: string | null;
        tags?: string[] | null;
        broadcastEnabled?: boolean;
        isArchived?: boolean;
        isParsing?: boolean;
    }) {
        const payload: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };

        if (updates.groupName !== undefined) {
            payload.group_name = updates.groupName;
            payload.normalized_name = normalizeName(updates.groupName || '');
        }
        if (updates.locality !== undefined) payload.locality = updates.locality;
        if (updates.city !== undefined) payload.city = updates.city;
        if (updates.category !== undefined) payload.category = updates.category;
        if (updates.tags !== undefined) payload.tags = uniqueStrings(updates.tags || []);
        if (updates.broadcastEnabled !== undefined) payload.broadcast_enabled = updates.broadcastEnabled;
        if (updates.isArchived !== undefined) payload.is_archived = updates.isArchived;
        if (updates.isParsing !== undefined) payload.is_parsing = updates.isParsing;

        const { data, error } = await db
            .from('whatsapp_groups')
            .update(payload)
            .eq('workspace_id', tenantId)
            .eq('group_jid', groupJid)
            .select('*')
            .single();

        if (error) {
            throw error;
        }

        return data;
    }
}

export const whatsappGroupService = new WhatsAppGroupService();
