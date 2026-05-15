import { supabase, supabaseAdmin } from '../config/supabase';
import { getWhatsAppGateway } from '../channel-gateways/whatsapp/whatsappGatewayRegistry';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

type ConnectionSnapshotInput = {
    tenantId: string;
    sessionLabel: string;
    phoneNumber?: string | null;
    ownerName?: string | null;
    status: ConnectionStatus;
};

type GroupSnapshotInput = {
    id: string;
    name: string;
};

type MessageMetricsInput = {
    tenantId: string;
    sessionLabel: string;
    remoteJid: string;
    parsed: boolean;
    failed?: boolean;
    timestamp?: string | null;
};

const DAY_MS = 86_400_000;
const STALE_MS = DAY_MS * 7;

const db = supabaseAdmin || supabase;

function asIso(value?: string | null) {
    const parsed = value ? new Date(value) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function safeRatio(success: number, failed: number) {
    const total = success + failed;
    if (total <= 0) {
        return 100;
    }

    return Math.round((success / total) * 100);
}

function getConnectionStatus(row: any) {
    return String(row?.connection_status || row?.status || 'disconnected');
}

function deriveGroupStatus(lastMessageAt?: string | null, failedCount = 0) {
    if (failedCount > 0) {
        return 'error';
    }

    if (!lastMessageAt) {
        return 'quiet';
    }

    const ageMs = Date.now() - new Date(lastMessageAt).getTime();
    if (ageMs > STALE_MS) {
        return 'stale';
    }

    if (ageMs > DAY_MS) {
        return 'quiet';
    }

    return 'active';
}

export class WhatsAppHealthService {
    async upsertConnectionSnapshot(input: ConnectionSnapshotInput) {
        if (input.tenantId === 'system') {
            return;
        }

        const now = new Date().toISOString();
        let existing: any = null;
        try {
            const { data } = await db
                .from('whatsapp_ingestion_health')
                .select('*')
                .eq('tenant_id', input.tenantId)
                .eq('session_label', input.sessionLabel)
                .maybeSingle();
            existing = data;
        } catch {
            existing = null;
        }

        const detailedPayload: Record<string, unknown> = {
            tenant_id: input.tenantId,
            session_label: input.sessionLabel,
            phone_number: input.phoneNumber || null,
            owner_name: input.ownerName || null,
            connection_status: input.status,
            last_seen_at: now,
            updated_at: now,
        };

        if (input.status === 'connected') {
            detailedPayload.connected_at = existing?.connected_at || now;
        }

        const compatPayload: Record<string, unknown> = {
            tenant_id: input.tenantId,
            status: input.status,
            last_event_at: now,
            last_error: null,
            processed_count: 0,
            failed_count: 0,
            updated_at: now,
        };

        const { error } = await db
            .from('whatsapp_ingestion_health')
            .upsert(detailedPayload, { onConflict: 'tenant_id,session_label' });

        if (error) {
            const { error: compatError } = await db
                .from('whatsapp_ingestion_health')
                .upsert(compatPayload, { onConflict: 'tenant_id' });

            if (compatError) {
                throw compatError;
            }
        }

        await this.logEvent(input.tenantId, input.sessionLabel, input.status, this.describeConnectionEvent(input));
    }

    async syncGroups(tenantId: string, sessionLabel: string, groups: GroupSnapshotInput[]) {
        if (tenantId === 'system') {
            return;
        }

        const now = new Date().toISOString();
        const uniqueGroups = Array.from(new Map((groups || []).map((group) => [group.id, group])).values());
        let syncedCount = 0;
        let failedCount = 0;

        for (const group of uniqueGroups) {
            try {
                const { error } = await db
                    .from('whatsapp_group_health')
                    .upsert({
                        tenant_id: tenantId,
                        session_label: sessionLabel,
                        group_id: group.id,
                        group_name: group.name || group.id,
                        is_active: true,
                        last_group_sync_at: now,
                        updated_at: now,
                    }, { onConflict: 'tenant_id,session_label,group_id' });

                if (error) {
                    console.error('[WhatsAppHealthService] Failed to upsert group health', group.id, error);
                    failedCount++;
                    continue;
                }

                syncedCount++;
            } catch (groupError: unknown) {
                console.error('[WhatsAppHealthService] Unexpected error syncing group health', group.id, groupError);
                failedCount++;
            }
        }

        const activeGroups24h = await this.countActiveGroups24h(tenantId, sessionLabel).catch(() => 0);
        const detailedPayload = {
                tenant_id: tenantId,
                session_label: sessionLabel,
                group_count: uniqueGroups.length,
                active_groups_24h: activeGroups24h,
                last_group_sync_at: now,
                updated_at: now,
            };
        const compatPayload = {
            tenant_id: tenantId,
            status: 'connected',
            last_event_at: now,
            last_error: null,
            processed_count: activeGroups24h,
            failed_count: 0,
            updated_at: now,
        };

        const { error: healthError } = await db
            .from('whatsapp_ingestion_health')
            .upsert(detailedPayload, { onConflict: 'tenant_id,session_label' });

        if (healthError) {
            const { error: compatError } = await db
                .from('whatsapp_ingestion_health')
                .upsert(compatPayload, { onConflict: 'tenant_id' });

            if (compatError) {
                throw compatError;
            }
        }

        await this.logEvent(
            tenantId,
            sessionLabel,
            'group_sync',
            `Synced ${uniqueGroups.length} WhatsApp groups for this workspace.`,
            { groupCount: uniqueGroups.length },
        );
    }

    async recordMessageMetrics(input: MessageMetricsInput) {
        if (input.tenantId === 'system') {
            return;
        }

        const timestamp = asIso(input.timestamp);
        const groupId = input.remoteJid.endsWith('@g.us') ? input.remoteJid : null;

        let existingHealth: any = null;
        try {
            const { data } = await db
                .from('whatsapp_ingestion_health')
                .select('messages_received_24h, messages_parsed_24h, messages_failed_24h')
                .eq('tenant_id', input.tenantId)
                .eq('session_label', input.sessionLabel)
                .maybeSingle();
            existingHealth = data;
        } catch {
            existingHealth = null;
        }

        const nextReceived = Number(existingHealth?.messages_received_24h || 0) + 1;
        const nextParsed = Number(existingHealth?.messages_parsed_24h || 0) + (input.parsed ? 1 : 0);
        const nextFailed = Number(existingHealth?.messages_failed_24h || 0) + (input.failed ? 1 : 0);

        const detailedPayload = {
                tenant_id: input.tenantId,
                session_label: input.sessionLabel,
                messages_received_24h: nextReceived,
                messages_parsed_24h: nextParsed,
                messages_failed_24h: nextFailed,
                last_inbound_message_at: timestamp,
                last_parsed_message_at: input.parsed ? timestamp : undefined,
                last_parser_error_at: input.failed ? timestamp : undefined,
                parser_success_rate: safeRatio(nextParsed, nextFailed),
                active_groups_24h: await this.countActiveGroups24h(input.tenantId, input.sessionLabel, groupId || undefined, timestamp).catch(() => 0),
                updated_at: new Date().toISOString(),
            };
        const compatPayload = {
            tenant_id: input.tenantId,
            status: input.failed ? 'disconnected' : 'connected',
            last_event_at: timestamp,
            last_error: input.failed ? 'message parsing failed' : null,
            processed_count: nextParsed,
            failed_count: nextFailed,
            updated_at: new Date().toISOString(),
        };

        const { error: healthError } = await db
            .from('whatsapp_ingestion_health')
            .upsert(detailedPayload, { onConflict: 'tenant_id,session_label' });

        if (healthError) {
            const { error: compatError } = await db
                .from('whatsapp_ingestion_health')
                .upsert(compatPayload, { onConflict: 'tenant_id' });

            if (compatError) {
                throw compatError;
            }
        }

        if (!groupId) {
            return;
        }

        let existingGroup: any = null;
        try {
            const { data } = await db
                .from('whatsapp_group_health')
                .select('messages_received_24h, messages_parsed_24h, messages_failed_24h, group_name')
                .eq('tenant_id', input.tenantId)
                .eq('session_label', input.sessionLabel)
                .eq('group_id', groupId)
                .maybeSingle();
            existingGroup = data;
        } catch {
            existingGroup = null;
        }

        const groupReceived = Number(existingGroup?.messages_received_24h || 0) + 1;
        const groupParsed = Number(existingGroup?.messages_parsed_24h || 0) + (input.parsed ? 1 : 0);
        const groupFailed = Number(existingGroup?.messages_failed_24h || 0) + (input.failed ? 1 : 0);
        const nextStatus = deriveGroupStatus(timestamp, groupFailed);

        const { error: groupError } = await db
            .from('whatsapp_group_health')
            .upsert({
                tenant_id: input.tenantId,
                session_label: input.sessionLabel,
                group_id: groupId,
                group_name: existingGroup?.group_name || groupId,
                is_active: true,
                last_message_at: timestamp,
                last_parsed_at: input.parsed ? timestamp : undefined,
                messages_received_24h: groupReceived,
                messages_parsed_24h: groupParsed,
                messages_failed_24h: groupFailed,
                status: nextStatus,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'tenant_id,session_label,group_id' });

        if (groupError) {
            throw groupError;
        }
    }

    async getHealth(tenantId: string) {
        const { data, error } = await db
            .from('whatsapp_ingestion_health')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('updated_at', { ascending: false });

        if (error) {
            throw error;
        }

        const sessions = (data || []).map((row: any) => ({
            sessionLabel: row.session_label,
            phoneNumber: row.phone_number,
            ownerName: row.owner_name,
            connectionStatus: getConnectionStatus(row),
            connectedAt: row.connected_at,
            lastSeenAt: row.last_seen_at || row.last_event_at,
            lastGroupSyncAt: row.last_group_sync_at || row.last_event_at,
            groupCount: Number(row.group_count || 0),
            activeGroups24h: Number(row.active_groups_24h || 0),
            messagesReceived24h: Number(row.messages_received_24h || row.processed_count || 0),
            messagesParsed24h: Number(row.messages_parsed_24h || row.processed_count || 0),
            messagesFailed24h: Number(row.messages_failed_24h || row.failed_count || 0),
            lastInboundMessageAt: row.last_inbound_message_at,
            lastParsedMessageAt: row.last_parsed_message_at,
            lastParserErrorAt: row.last_parser_error_at,
            parserSuccessRate: Number(row.parser_success_rate || safeRatio(Number(row.processed_count || 0), Number(row.failed_count || 0))),
            healthState: this.deriveHealthState(row),
        }));

        const summary = sessions.reduce((acc, session) => {
            acc.groupCount += session.groupCount;
            acc.activeGroups24h += session.activeGroups24h;
            acc.messagesReceived24h += session.messagesReceived24h;
            acc.messagesParsed24h += session.messagesParsed24h;
            acc.messagesFailed24h += session.messagesFailed24h;
            return acc;
        }, {
            groupCount: 0,
            activeGroups24h: 0,
            messagesReceived24h: 0,
            messagesParsed24h: 0,
            messagesFailed24h: 0,
        });

        const liveSessions = await getWhatsAppGateway(tenantId).getSessions(tenantId);
        const sessionsWithReconnect = sessions.map(session => {
            const liveSession = liveSessions.find((s: any) => s.label === session.sessionLabel);
            return {
                ...session,
                reconnectAttempts: liveSession?.reconnectAttempts || 0,
                isReconnecting: liveSession?.isReconnecting || false,
            };
        });

        return {
            sessions: sessionsWithReconnect,
            summary: {
                ...summary,
                parserSuccessRate: safeRatio(summary.messagesParsed24h, summary.messagesFailed24h),
                healthState: this.deriveAggregateHealthState(sessions),
                totalSessions: sessions.length,
                reconnectingSessions: sessionsWithReconnect.filter(s => s.isReconnecting).length,
            },
        };
    }

    async getGroupHealth(tenantId: string) {
        const { data, error } = await db
            .from('whatsapp_group_health')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('updated_at', { ascending: false });

        if (error) {
            throw error;
        }

        return (data || []).map((row: any) => ({
            id: row.id,
            sessionLabel: row.session_label,
            groupId: row.group_id,
            groupName: row.group_name,
            lastGroupSyncAt: row.last_group_sync_at,
            lastMessageAt: row.last_message_at,
            lastParsedAt: row.last_parsed_at,
            messagesReceived24h: Number(row.messages_received_24h || 0),
            messagesParsed24h: Number(row.messages_parsed_24h || 0),
            messagesFailed24h: Number(row.messages_failed_24h || 0),
            status: row.status,
        }));
    }

    async getEvents(tenantId: string, limit = 30) {
        const { data, error } = await db
            .from('whatsapp_event_logs')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            throw error;
        }

        return (data || []).map((row: any) => ({
            id: row.id,
            sessionLabel: row.session_label,
            eventType: row.event_type,
            message: row.message,
            metadata: row.metadata || {},
            createdAt: row.created_at,
        }));
    }

    async appendEvent(tenantId: string, sessionLabel: string, eventType: string, message: string, metadata: Record<string, unknown> = {}) {
        await this.logEvent(tenantId, sessionLabel, eventType, message, metadata);
    }

    private async countActiveGroups24h(tenantId: string, sessionLabel: string, ensureGroupId?: string, ensureTimestamp?: string) {
        const cutoff = new Date(Date.now() - DAY_MS).toISOString();
        const { data, error } = await db
            .from('whatsapp_group_health')
            .select('group_id, last_message_at')
            .eq('tenant_id', tenantId)
            .eq('session_label', sessionLabel);

        if (error) {
            throw error;
        }

        const active = new Set<string>();
        for (const row of data || []) {
            if (row.last_message_at && new Date(row.last_message_at).toISOString() >= cutoff) {
                active.add(row.group_id);
            }
        }

        if (ensureGroupId && ensureTimestamp && new Date(ensureTimestamp).toISOString() >= cutoff) {
            active.add(ensureGroupId);
        }

        return active.size;
    }

    private async logEvent(tenantId: string, sessionLabel: string, eventType: string, message: string, metadata: Record<string, unknown> = {}) {
        if (tenantId === 'system') {
            return;
        }

        const { error } = await db
            .from('whatsapp_event_logs')
            .insert({
                tenant_id: tenantId,
                session_label: sessionLabel,
                event_type: eventType,
                message,
                metadata,
            });

        if (error) {
            console.error('[WhatsAppHealthService] Failed to log event:', error);
        }
    }

    private deriveHealthState(row: any) {
        if (getConnectionStatus(row) !== 'connected') {
            return 'critical';
        }

        if (row.messages_failed_24h > 0) {
            return 'warning';
        }

        if (!row.last_inbound_message_at) {
            return 'warning';
        }

        const lastInboundAge = Date.now() - new Date(row.last_inbound_message_at).getTime();
        if (lastInboundAge > DAY_MS) {
            return 'warning';
        }

        return 'healthy';
    }

    private deriveAggregateHealthState(sessions: Array<{ healthState: string }>) {
        if (sessions.some((session) => session.healthState === 'critical')) {
            return 'critical';
        }
        if (sessions.some((session) => session.healthState === 'warning')) {
            return 'warning';
        }
        return sessions.length > 0 ? 'healthy' : 'warning';
    }

    private describeConnectionEvent(input: ConnectionSnapshotInput) {
        if (input.status === 'connected') {
            return `WhatsApp connected for ${input.phoneNumber || input.sessionLabel}.`;
        }

        if (input.status === 'connecting') {
            return `WhatsApp QR/session is preparing for ${input.phoneNumber || input.sessionLabel}.`;
        }

        return `WhatsApp disconnected for ${input.phoneNumber || input.sessionLabel}.`;
    }
}

export const whatsappHealthService = new WhatsAppHealthService();
