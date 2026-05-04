import { supabase } from '../config/supabase';

type ParseConsentDecisionInput = {
    tenantId: string;
    sessionLabel?: string | null;
    remoteJid: string;
    displayName?: string | null;
    timestamp?: string | null;
};

type DiscoveredGroup = {
    id: string;
    name: string;
    participantsCount?: number;
};

export type WhatsAppGroupCategory = 'real_estate' | 'family' | 'work' | 'other';

function normalizePhone(value?: string | null) {
    return String(value || '').split('').filter((c) => c >= '0' && c <= '9').join('');
}

function isMissingTableError(error: any) {
    const message = String(error?.message || '').toLowerCase();
    return error?.code === '42P01' || message.includes('could not find the table') || message.includes('does not exist');
}

const REAL_ESTATE_PATTERNS = [
    /\bbroker(?:s|age)?\b/i,
    /\bproperty\b/i,
    /\brealty\b/i,
    /\brealtor\b/i,
    /\binventory\b/i,
    /\blisting(?:s)?\b/i,
    /\bproject(?:s)?\b/i,
    /\bsite visit\b/i,
    /\bpossession\b/i,
    /\bdeveloper\b/i,
    /\bbuilder\b/i,
    /\bsale\b/i,
    /\brent\b/i,
    /\blease\b/i,
    /\bdeal(?:s)?\b/i,
    /\bflat(?:s)?\b/i,
    /\bapartment(?:s)?\b/i,
    /\bcommercial\b/i,
    /\boffice space\b/i,
    /\bshop\b/i,
    /\bplot(?:s)?\b/i,
    /\bland\b/i,
    /\bloc(?:ality|ation)?\b/i,
    /\bandheri\b/i,
    /\bbandra\b/i,
    /\bpowai\b/i,
    /\bthane\b/i,
    /\bborivali\b/i,
    /\bmulund\b/i,
    /\bchembur\b/i,
    /\bnavi mumbai\b/i,
];

const FAMILY_PATTERNS = [
    /\bfamily\b/i,
    /\bhome\b/i,
    /\brelatives?\b/i,
    /\bcousins?\b/i,
    /\bsiblings?\b/i,
    /\bmom\b/i,
    /\bdad\b/i,
    /\bparents?\b/i,
    /\buncle\b/i,
    /\baunt(?:y|ie)?\b/i,
    /\bbhai\b/i,
    /\bbehen\b/i,
    /\bshaadi\b/i,
    /\bmarriage\b/i,
];

const WORK_PATTERNS = [
    /\bteam\b/i,
    /\boffice\b/i,
    /\bwork\b/i,
    /\bcompany\b/i,
    /\bcorp\b/i,
    /\binc\b/i,
    /\bpvt\b/i,
    /\bltd\b/i,
    /\bllp\b/i,
    /\bops\b/i,
    /\boperation(?:s)?\b/i,
    /\badmin\b/i,
    /\bhr\b/i,
    /\baccounts?\b/i,
    /\bfinance\b/i,
    /\bsales team\b/i,
    /\bmarketing\b/i,
    /\bstaff\b/i,
    /\bbranch\b/i,
];

export function classifyWhatsAppGroupCategory(name?: string | null): WhatsAppGroupCategory {
    const value = String(name || '').trim();
    if (!value) return 'other';
    if (REAL_ESTATE_PATTERNS.some((pattern) => pattern.test(value))) return 'real_estate';
    if (FAMILY_PATTERNS.some((pattern) => pattern.test(value))) return 'family';
    if (WORK_PATTERNS.some((pattern) => pattern.test(value))) return 'work';
    return 'other';
}

class WhatsAppParseConsentService {
    async getDecision(input: ParseConsentDecisionInput) {
        const tenantId = String(input.tenantId || '').trim();
        const remoteJid = String(input.remoteJid || '').trim();

        if (!tenantId || !remoteJid) {
            return { allowed: false, targetType: 'unknown' as const, reason: 'missing_target' };
        }

        if (remoteJid.endsWith('@g.us')) {
            await this.upsertGroupDirectoryEntry({
                tenantId,
                sessionLabel: input.sessionLabel || null,
                groupJid: remoteJid,
                groupName: input.displayName || remoteJid,
                timestamp: input.timestamp,
            });

            const { data, error } = await supabase
                .from('whatsapp_groups')
                .select('parse_enabled')
                .eq('tenant_id', tenantId)
                .eq('group_jid', remoteJid)
                .maybeSingle();

            if (error) {
                if (isMissingTableError(error)) {
                    return { allowed: false, targetType: 'group' as const, reason: 'consent_table_missing' };
                }
                throw error;
            }

            return {
                allowed: Boolean(data?.parse_enabled),
                targetType: 'group' as const,
                reason: data?.parse_enabled ? 'group_watched' : 'group_private',
            };
        }

        const dmRecord = await this.upsertDmDirectoryEntry(input);
        return {
            allowed: Boolean(dmRecord?.parse_enabled),
            targetType: 'dm' as const,
            reason: dmRecord?.parse_enabled ? 'dm_watched' : 'dm_private',
        };
    }

    async listTargets(tenantId: string) {
        const [{ data: groupRows, error: groupsError }, { data: dmRows, error: dmsError }] = await Promise.all([
            supabase
                .from('whatsapp_groups')
                .select('group_jid, group_name, session_label, member_count, parse_enabled, last_active_at, consent_updated_at, category')
                .eq('tenant_id', tenantId)
                .order('last_active_at', { ascending: false, nullsFirst: false }),
            supabase
                .from('whatsapp_dm_permissions')
                .select('remote_jid, display_name, normalized_phone, session_label, parse_enabled, last_message_at, consent_updated_at')
                .eq('tenant_id', tenantId)
                .order('last_message_at', { ascending: false, nullsFirst: false })
                .limit(200),
        ]);

        if (groupsError && !isMissingTableError(groupsError)) throw groupsError;
        if (dmsError && !isMissingTableError(dmsError)) throw dmsError;

        return {
            groups: (groupRows || []).map((row: any) => ({
                id: String(row.group_jid || ''),
                name: String(row.group_name || row.group_jid || 'Unknown group'),
                participantsCount: Number(row.member_count || 0),
                parseEnabled: Boolean(row.parse_enabled),
                lastActiveAt: row.last_active_at || null,
                category: row.category || classifyWhatsAppGroupCategory(row.group_name),
            })),
            dms: (dmRows || []).map((row: any) => ({
                id: String(row.remote_jid || ''),
                remoteJid: String(row.remote_jid || ''),
                displayName: String(row.display_name || row.normalized_phone || row.remote_jid || 'Unknown contact'),
                normalizedPhone: row.normalized_phone || null,
                parseEnabled: Boolean(row.parse_enabled),
                lastMessageAt: row.last_message_at || null,
            })),
        };
    }

    async updateGroupConsent(tenantId: string, groupJid: string, parseEnabled: boolean) {
        const { data, error } = await supabase
            .from('whatsapp_groups')
            .update({
                parse_enabled: parseEnabled,
                consent_updated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('tenant_id', tenantId)
            .eq('group_jid', groupJid)
            .select('group_jid, parse_enabled, consent_updated_at')
            .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('WhatsApp group not found');

        if (parseEnabled) {
            const { error: configError } = await supabase
                .from('group_configs')
                .upsert({
                    group_id: groupJid,
                    tenant_id: tenantId,
                    behavior: 'Listen',
                });

            if (configError) throw configError;
        }

        return data;
    }

    async updateDmConsent(tenantId: string, remoteJid: string, parseEnabled: boolean) {
        await this.upsertDmDirectoryEntry({ tenantId, remoteJid, timestamp: new Date().toISOString() });

        const { data, error } = await supabase
            .from('whatsapp_dm_permissions')
            .update({
                parse_enabled: parseEnabled,
                consent_updated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('tenant_id', tenantId)
            .eq('remote_jid', remoteJid)
            .select('remote_jid, parse_enabled, consent_updated_at')
            .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('WhatsApp DM not found');
        return data;
    }

    async updateConsentBatch(input: {
        tenantId: string;
        targetType: 'group' | 'dm';
        remoteJids: string[];
        parseEnabled: boolean;
    }) {
        const remoteJids = Array.from(new Set(input.remoteJids.map((value) => String(value || '').trim()).filter(Boolean)));
        if (remoteJids.length === 0) {
            return [];
        }

        if (input.targetType === 'group') {
            const now = new Date().toISOString();
            const { data, error } = await supabase
                .from('whatsapp_groups')
                .update({
                    parse_enabled: input.parseEnabled,
                    consent_updated_at: now,
                    updated_at: now,
                })
                .eq('tenant_id', input.tenantId)
                .in('group_jid', remoteJids)
                .select('group_jid, parse_enabled, consent_updated_at');

            if (error) throw error;

            if (input.parseEnabled) {
                const { error: configError } = await supabase
                    .from('group_configs')
                    .upsert(
                        remoteJids.map((groupJid) => ({
                            group_id: groupJid,
                            tenant_id: input.tenantId,
                            behavior: 'Listen',
                        })),
                        { onConflict: 'tenant_id,group_id' }
                    );

                if (configError) throw configError;
            }

            return data || [];
        }

        await Promise.all(remoteJids.map((remoteJid) => this.upsertDmDirectoryEntry({
            tenantId: input.tenantId,
            remoteJid,
            timestamp: new Date().toISOString(),
        })));

        const now = new Date().toISOString();
        const { data, error } = await supabase
            .from('whatsapp_dm_permissions')
            .update({
                parse_enabled: input.parseEnabled,
                consent_updated_at: now,
                updated_at: now,
            })
            .eq('tenant_id', input.tenantId)
            .in('remote_jid', remoteJids)
            .select('remote_jid, parse_enabled, consent_updated_at');

        if (error) throw error;
        return data || [];
    }

    async syncGroups(tenantId: string, sessionLabel: string | null, groups: DiscoveredGroup[]) {
        for (const group of groups) {
            await this.upsertGroupDirectoryEntry({
                tenantId,
                sessionLabel,
                groupJid: group.id,
                groupName: group.name,
                memberCount: group.participantsCount,
            });
        }
    }

    private async upsertGroupDirectoryEntry(input: {
        tenantId: string;
        sessionLabel?: string | null;
        groupJid: string;
        groupName?: string | null;
        memberCount?: number | null;
        timestamp?: string | null;
    }) {
        const groupJid = String(input.groupJid || '').trim();
        if (!groupJid) return null;

        const { data: existing, error: existingError } = await supabase
            .from('whatsapp_groups')
            .select('parse_enabled, category')
            .eq('tenant_id', input.tenantId)
            .eq('group_jid', groupJid)
            .maybeSingle();

        if (existingError) {
            if (isMissingTableError(existingError)) return null;
            throw existingError;
        }

        const category = existing?.category || classifyWhatsAppGroupCategory(input.groupName || groupJid);

        const { data, error } = await supabase
            .from('whatsapp_groups')
            .upsert({
                tenant_id: input.tenantId,
                session_label: input.sessionLabel || null,
                group_jid: groupJid,
                group_name: input.groupName || groupJid,
                member_count: input.memberCount || 0,
                parse_enabled: typeof existing?.parse_enabled === 'boolean' ? existing.parse_enabled : false,
                category,
                last_active_at: input.timestamp || new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'tenant_id,group_jid' })
            .select('group_jid, parse_enabled, category')
            .maybeSingle();

        if (error) {
            if (isMissingTableError(error)) return null;
            throw error;
        }

        return data;
    }

    private async upsertDmDirectoryEntry(input: ParseConsentDecisionInput) {
        const remoteJid = String(input.remoteJid || '').trim();
        if (!remoteJid || remoteJid.endsWith('@g.us')) return null;

        const timestamp = input.timestamp || new Date().toISOString();
        const { data: existing, error: existingError } = await supabase
            .from('whatsapp_dm_permissions')
            .select('parse_enabled, display_name, normalized_phone, session_label')
            .eq('tenant_id', input.tenantId)
            .eq('remote_jid', remoteJid)
            .maybeSingle();

        if (existingError) {
            if (isMissingTableError(existingError)) return null;
            throw existingError;
        }

        const { data, error } = await supabase
            .from('whatsapp_dm_permissions')
            .upsert({
                tenant_id: input.tenantId,
                session_label: input.sessionLabel || existing?.session_label || null,
                remote_jid: remoteJid,
                display_name: input.displayName || existing?.display_name || null,
                normalized_phone: existing?.normalized_phone || normalizePhone(remoteJid),
                parse_enabled: typeof existing?.parse_enabled === 'boolean' ? existing.parse_enabled : false,
                last_message_at: timestamp,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'tenant_id,remote_jid' })
            .select('remote_jid, parse_enabled')
            .maybeSingle();

        if (error) {
            if (isMissingTableError(error)) return null;
            throw error;
        }

        return data;
    }
}

export const whatsappParseConsentService = new WhatsAppParseConsentService();
