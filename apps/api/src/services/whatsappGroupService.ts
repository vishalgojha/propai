import { supabase, supabaseAdmin } from '../config/supabase';
import { parseIndianLocation } from '../utils/locationParser';
import { brokerContactSyncService } from './brokerContactSyncService';

type SupportedCategory = 'broker' | 'rental' | 'sale' | 'commercial' | 'mixed' | 'other';

export type RawGroupInput = {
    id: string;
    name: string;
    participantsCount?: number;
    participantJids?: string[];
};

type GroupListFilters = {
    onlyBroadcastEnabled?: boolean;
    includeArchived?: boolean;
    sessionLabel?: string;
};

export type GroupClassification = 'business' | 'personal' | 'unknown';
type GroupVisibilityStatus = 'visible' | 'hidden';

const db = supabaseAdmin || supabase;

const PERSONAL_GROUP_KEYWORDS = [
    'family', 'sfg', 'friends', 'crypto', 'school',
    'college', 'personal', 'fun', 'news', 'politics',
    'gaming', 'memes', 'music', 'movie', 'travel',
    'food', 'cooking', 'sports', 'fitness', 'health',
    'birthday', 'trip', 'vacation', 'wedding', 'cousins',
    'alumni', 'batch', 'class', 'parents', 'kitty',
];

const BUSINESS_GROUP_KEYWORDS = [
    'broker', 'brokers', 'realtor', 'realtors', 'estate', 'realty', 'reality',
    'inventory', 'requirement', 'requirements', 'client', 'buyers',
    'seller', 'sellers', 'rent', 'rental', 'lease', 'sale', 'resale',
    'commercial', 'office', 'shop', 'warehouse', 'flat', 'flats',
    'apartment', 'apartments', 'villa', 'plot', 'plots', 'bhk',
    'property', 'properties', 'channel partner', 'cp', 'deals',
];

const COMPACT_BUSINESS_KEYWORDS = new Set([
    'broker',
    'brokers',
    'realtor',
    'realtors',
    'estate',
    'realty',
    'reality',
    'property',
    'properties',
]);

function scoreKeywordHits(normalized: string, keywords: string[]) {
    const compact = normalized.replace(/\s+/g, '');

    return keywords.reduce((score, keyword) => {
        const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (pattern.test(normalized)) return score + 1;

        const compactKeyword = keyword.replace(/\s+/g, '');
        if (COMPACT_BUSINESS_KEYWORDS.has(keyword) && compact.includes(compactKeyword)) {
            return score + 1;
        }

        return score;
    }, 0);
}

function classifyGroup(name: string, locality?: string | null, category?: string | null) {
    const normalized = normalizeName(name);
    const businessHits = scoreKeywordHits(normalized, BUSINESS_GROUP_KEYWORDS);
    const personalHits = scoreKeywordHits(normalized, PERSONAL_GROUP_KEYWORDS);
    const localityBonus = locality ? 1 : 0;
    const categoryBonus = category && category !== 'other' ? 1 : 0;
    const businessScore = businessHits + localityBonus + categoryBonus;

    if (personalHits >= 1 && businessHits === 0) {
        return {
            classification: 'personal' as GroupClassification,
            confidence: Math.min(100, 70 + personalHits * 10),
            visibilityStatus: 'hidden' as GroupVisibilityStatus,
        };
    }

    if (businessScore >= 2) {
        return {
            classification: 'business' as GroupClassification,
            confidence: Math.min(100, 60 + businessScore * 10),
            visibilityStatus: 'visible' as GroupVisibilityStatus,
        };
    }

    return {
        classification: 'unknown' as GroupClassification,
        confidence: Math.max(35, businessHits > 0 ? 45 + businessHits * 5 : 40),
        visibilityStatus: 'hidden' as GroupVisibilityStatus,
    };
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

function normalizeParticipantJid(value?: string | null) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const atIndex = raw.indexOf('@');
    return atIndex >= 0 ? raw : `${raw}@s.whatsapp.net`;
}

function storedPositiveNumber(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function chunkArray<T>(values: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}

export function countLikelyBrokerSignals(group: RawGroupInput, locality?: string | null, category?: string | null) {
    const normalized = normalizeName(group.name || '');
    let score = 0;

    if (scoreKeywordHits(normalized, BUSINESS_GROUP_KEYWORDS) > 0) score += 35;
    if (category === 'broker' || category === 'rental' || category === 'sale' || category === 'commercial') score += 20;
    if (locality) score += 15;
    if (Number(group.participantsCount || 0) >= 40) score += 10;
    if (Number(group.participantsCount || 0) >= 100) score += 5;

    return Math.min(100, score);
}

export function countNoiseSignals(group: RawGroupInput, classification: GroupClassification, category?: string | null) {
    const normalized = normalizeName(group.name || '');
    let score = 0;

    if (classification === 'personal') score += 45;
    if (scoreKeywordHits(normalized, PERSONAL_GROUP_KEYWORDS) > 0) score += 25;
    if (category === 'other') score += 10;
    if (Number(group.participantsCount || 0) > 250) score += 10;
    if (/media|promo|offer|youtube|instagram|politics|crypto|meme/.test(normalized)) score += 20;

    return Math.min(100, score);
}

async function getSessionAuditState(tenantId: string, sessionLabel: string) {
    const { data } = await db
        .from('whatsapp_sessions')
        .select('session_data')
        .eq('tenant_id', tenantId)
        .eq('label', sessionLabel)
        .maybeSingle();

    const sessionData = data?.session_data && typeof data.session_data === 'object'
        ? data.session_data as Record<string, unknown>
        : {};

    return {
        isPending: sessionData.groupAuditPending === true,
        isCompleted: typeof sessionData.groupAuditCompletedAt === 'string' && String(sessionData.groupAuditCompletedAt).trim().length > 0,
    };
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
        const auditState = await getSessionAuditState(tenantId, sessionLabel);
        const existingByGroupJid = new Map<string, any>();
        const groupIds = uniqueGroups.map((group) => group.id).filter(Boolean);
        const skippedExistingLookupGroupIds = new Set<string>();

        for (const chunk of chunkArray(groupIds, 200)) {
            const { data: existingRows, error: existingError } = await db
                .from('whatsapp_groups')
                .select('group_jid,locality, city, category, tags, broadcast_enabled, is_archived, is_parsing, classification, visibility_status, business_confidence, participant_count, member_count, participant_jids, duplicate_overlap_score, signal_score, noise_score, audit_recommendation')
                .eq('workspace_id', tenantId)
                .in('group_jid', chunk);

            if (existingError) {
                console.error('[WhatsAppGroupService] Failed to fetch existing groups for sync batch', existingError);
                failedCount += chunk.length;
                chunk.forEach((groupId) => skippedExistingLookupGroupIds.add(groupId));
                continue;
            }

            for (const row of existingRows || []) {
                existingByGroupJid.set(String(row.group_jid || ''), row);
            }
        }

        const payloads: Array<{
            groupId: string;
            payload: Record<string, unknown>;
            seedConfig: boolean;
        }> = [];

        for (const group of uniqueGroups) {
            try {
                if (skippedExistingLookupGroupIds.has(group.id)) {
                    continue;
                }

                const parsedLocation = parseIndianLocation(group.name || '');
                const inferredLocality = parsedLocation?.locality || null;
                const inferredCity = parsedLocation?.city && parsedLocation.city !== 'Unknown' ? parsedLocation.city : null;
                const inferredCategory = inferCategory(group.name || '');
                const inferredTags = inferTags(group.name || '', inferredLocality, inferredCategory);
                const autoClassification = classifyGroup(group.name || '', inferredLocality, inferredCategory);
                const participantJids = Array.isArray(group.participantJids)
                    ? uniqueStrings(group.participantJids.map((participant) => normalizeParticipantJid(participant)))
                    : [];
                const signalScore = countLikelyBrokerSignals(group, inferredLocality, inferredCategory);
                const noiseScore = countNoiseSignals(group, autoClassification.classification, inferredCategory);
                const recommendation = autoClassification.classification === 'business' && signalScore >= 45 && noiseScore < 45
                    ? 'parse'
                    : autoClassification.classification === 'personal' || noiseScore >= 70
                        ? 'ignore'
                        : 'review';
                const existing = existingByGroupJid.get(group.id) || null;

                const hasLiveParticipantCount = typeof group.participantsCount === 'number' && Number.isFinite(group.participantsCount);
                const participantCount = hasLiveParticipantCount
                    ? Number(group.participantsCount)
                    : Number(existing?.member_count || existing?.participant_count || participantJids.length || 0);
                const storedParticipantJids = Array.isArray(existing?.participant_jids) ? existing.participant_jids : [];
                const nextParticipantJids = participantJids.length > 0 ? participantJids : storedParticipantJids;

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
                    participant_count: participantCount,
                    member_count: participantCount,
                    participant_jids: nextParticipantJids,
                    is_parsing: typeof existing?.is_parsing === 'boolean'
                        ? existing.is_parsing
                        : true,
                    classification: String(existing?.classification || '').trim() || autoClassification.classification,
                    visibility_status: String(existing?.visibility_status || '').trim() || autoClassification.visibilityStatus,
                    business_confidence: typeof existing?.business_confidence === 'number'
                        ? existing.business_confidence
                        : autoClassification.confidence,
                    duplicate_overlap_score: Number(existing?.duplicate_overlap_score || 0),
                    signal_score: storedPositiveNumber(existing?.signal_score, signalScore),
                    noise_score: storedPositiveNumber(existing?.noise_score, noiseScore),
                    audit_recommendation: String(existing?.audit_recommendation || recommendation),
                    last_message_at: now,
                    last_active_at: now,
                    broadcast_enabled: typeof existing?.broadcast_enabled === 'boolean' ? existing.broadcast_enabled : true,
                    is_archived: typeof existing?.is_archived === 'boolean' ? existing.is_archived : false,
                    updated_at: now,
                };

                payloads.push({
                    groupId: group.id,
                    payload,
                    seedConfig: !existing,
                });
            } catch (groupError: unknown) {
                console.error('[WhatsAppGroupService] Unexpected error syncing group', group.id, groupError);
                failedCount++;
            }
        }

        const seededGroupConfigs: Array<{ group_id: string; tenant_id: string; behavior: string }> = [];
        for (const chunk of chunkArray(payloads, 200)) {
            const { error } = await db
                .from('whatsapp_groups')
                .upsert(chunk.map((entry) => entry.payload), { onConflict: 'workspace_id,group_jid' });

            if (error) {
                console.error('[WhatsAppGroupService] Failed to upsert group sync batch', error);
                failedCount += chunk.length;
                continue;
            }

            syncedCount += chunk.length;
            for (const entry of chunk) {
                if (entry.seedConfig) {
                    seededGroupConfigs.push({
                        group_id: entry.groupId,
                        tenant_id: tenantId,
                        behavior: entry.payload.audit_recommendation === 'ignore' ? 'Ignore' : 'Listen',
                    });
                }
            }
        }

        for (const chunk of chunkArray(seededGroupConfigs, 200)) {
            const { error } = await db
                .from('group_configs')
                .upsert(chunk, { onConflict: 'group_id' });

            if (error) {
                console.error('[WhatsAppGroupService] Failed to seed group config sync batch', error);
            }
        }

        if (syncedCount > 0) {
            try {
                await brokerContactSyncService.syncFromStoredGroups(tenantId, {
                    sessionLabel,
                    minOverlap: 2,
                });
            } catch (syncError) {
                console.error('[WhatsAppGroupService] Failed to sync broker contacts from stored groups', syncError);
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

        if (filters.sessionLabel) {
            query = query.eq('session_label', filters.sessionLabel);
        }

        const { data, error } = await query;
        if (error) {
            throw error;
        }

        const groupRows = data || [];
        const groupIds = groupRows.map((row: any) => String(row.group_jid || '')).filter(Boolean);

        const behaviorMap = new Map<string, string>();
        if (groupIds.length > 0) {
            const chunkSize = 200;
            for (let i = 0; i < groupIds.length; i += chunkSize) {
                const chunk = groupIds.slice(i, i + chunkSize);
                const { data: configs } = await db
                    .from('group_configs')
                    .select('group_id, behavior')
                    .eq('tenant_id', tenantId)
                    .in('group_id', chunk);

                for (const row of configs || []) {
                    if (row?.group_id) {
                        behaviorMap.set(String(row.group_id), String(row.behavior || ''));
                    }
                }
            }
        }

        return groupRows.map((row: any) => {
            const groupId = String(row.group_jid || '');
            const behavior = behaviorMap.get(groupId) || 'Listen';
            return {
                id: groupId,
                groupJid: groupId,
                name: row.group_name,
                normalizedName: row.normalized_name,
                locality: row.locality || null,
                city: row.city || null,
                category: row.category || 'other',
                tags: Array.isArray(row.tags) ? row.tags : [],
                participantsCount: Number(row.member_count || 0),
                participantJids: Array.isArray(row.participant_jids) ? row.participant_jids : [],
                broadcastEnabled: Boolean(row.broadcast_enabled),
                isArchived: Boolean(row.is_archived),
                isParsing: behavior === 'Listen' || behavior === 'AutoReply',
                classification: row.classification || 'unknown',
                visibilityStatus: row.visibility_status || 'visible',
                businessConfidence: Number(row.business_confidence || 0),
                duplicateOverlapScore: Number(row.duplicate_overlap_score || 0),
                signalScore: Number(row.signal_score || 0),
                noiseScore: Number(row.noise_score || 0),
                auditRecommendation: String(row.audit_recommendation || 'review'),
                lastActiveAt: row.last_active_at || null,
                sessionLabel: row.session_label || null,
                behavior,
            };
        });
    }

    async registerManagedGroup(tenantId: string, input: {
        sessionLabel: string;
        groupJid: string;
        groupName?: string | null;
        participantJids?: string[] | null;
    }) {
        const now = new Date().toISOString();
        const groupName = String(input.groupName || input.groupJid || '').trim();
        const parsedLocation = parseIndianLocation(groupName);
        const inferredLocality = parsedLocation?.locality || null;
        const inferredCity = parsedLocation?.city && parsedLocation.city !== 'Unknown' ? parsedLocation.city : null;
        const inferredCategory = inferCategory(groupName);
        const inferredTags = inferTags(groupName, inferredLocality, inferredCategory);
        const autoClassification = classifyGroup(groupName, inferredLocality, inferredCategory);
        const participantJids = uniqueStrings((input.participantJids || []).map((participant) => normalizeParticipantJid(participant)));
        const payload = {
            workspace_id: tenantId,
            session_id: `${tenantId}:${input.sessionLabel}`,
            tenant_id: tenantId,
            session_label: input.sessionLabel,
            group_jid: input.groupJid,
            group_name: groupName || input.groupJid,
            normalized_name: normalizeName(groupName || input.groupJid),
            locality: inferredLocality,
            city: inferredCity,
            category: inferredCategory,
            tags: inferredTags,
            participant_count: participantJids.length || null,
            member_count: participantJids.length || null,
            participant_jids: participantJids,
            is_parsing: true,
            classification: autoClassification.classification,
            visibility_status: autoClassification.visibilityStatus,
            business_confidence: autoClassification.confidence,
            duplicate_overlap_score: 0,
            signal_score: countLikelyBrokerSignals({ id: input.groupJid, name: groupName, participantsCount: participantJids.length }, inferredLocality, inferredCategory),
            noise_score: countNoiseSignals({ id: input.groupJid, name: groupName, participantsCount: participantJids.length }, autoClassification.classification, inferredCategory),
            audit_recommendation: autoClassification.classification === 'business' ? 'parse' : 'review',
            last_message_at: now,
            last_active_at: now,
            broadcast_enabled: true,
            is_archived: false,
            updated_at: now,
        };

        const { data, error } = await db
            .from('whatsapp_groups')
            .upsert(payload, { onConflict: 'workspace_id,group_jid' })
            .select('*')
            .single();

        if (error) {
            throw error;
        }

        return data;
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
        classification?: GroupClassification | null;
        visibilityStatus?: GroupVisibilityStatus | null;
    }) {
        const groupName = String(updates.groupName || groupJid || '').trim() || groupJid;
        const payload: Record<string, unknown> = {
            workspace_id: tenantId,
            tenant_id: tenantId,
            group_jid: groupJid,
            group_name: groupName,
            normalized_name: normalizeName(groupName || groupJid),
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
        if (updates.classification !== undefined) payload.classification = updates.classification;
        if (updates.visibilityStatus !== undefined) payload.visibility_status = updates.visibilityStatus;

        const { data, error } = await db
            .from('whatsapp_groups')
            .upsert(payload, { onConflict: 'workspace_id,group_jid' })
            .select('*')
            .single();

        if (error) {
            throw error;
        }

        return data;
    }
}

export const whatsappGroupService = new WhatsAppGroupService();
