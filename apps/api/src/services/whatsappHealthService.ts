import { supabase, supabaseAdmin } from '../config/supabase';
import { getWhatsAppGateway } from '../channel-gateways/whatsapp/whatsappGatewayRegistry';
import { notificationService } from './notificationService';

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
    countReceived?: boolean;
    timestamp?: string | null;
};

type HeartbeatSessionSnapshot = {
    tenantId: string;
    label: string;
    status?: string;
    ownerName?: string | null;
    phoneNumber?: string | null;
    reconnectAttempts?: number | null;
    isReconnecting?: boolean | null;
};

type HeartbeatSessionManager = {
    getAllSessions(): HeartbeatSessionSnapshot[];
    rehydratePersistedSessions?: () => Promise<void>;
    forceReconnect?: (tenantId: string, sessionKey?: string) => Promise<unknown>;
    createSession(
        tenantId: string,
        onQR: (qr: string) => void,
        onConnectionUpdate: (status: string) => void,
        options?: {
            usePairingCode?: string;
            phoneNumber?: string;
            label?: string;
            ownerName?: string;
            skipLimitCheck?: boolean;
            freshAuth?: boolean;
        },
    ): Promise<unknown>;
};

const DAY_MS = 86_400_000;
const STALE_MS = DAY_MS * 7;
const HOUR_MS = 3_600_000;

const db = supabaseAdmin || supabase;
const PARSED_HISTORY_SESSION_LABEL = 'parsed-history';
const PARSED_HISTORY_CACHE_MS = 60_000;
const PARSED_HISTORY_PAGE_SIZE = 1000;
const PARSED_HISTORY_MAX_ROWS_PER_TABLE = 10_000;
const HIDDEN_EVENT_TYPES = new Set([
    'group_message_parse_only',
    'group_message_broadcast_parse_failed',
]);

type EventLogSessionField = 'session_label' | 'session_id';

function asIso(value?: string | null) {
    const parsed = value ? new Date(value) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalizePhoneNumber(value?: string | null) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const withoutDevice = raw.includes(':') ? raw.slice(0, raw.indexOf(':')) : raw;
    const withoutJid = withoutDevice.includes('@') ? withoutDevice.slice(0, withoutDevice.indexOf('@')) : withoutDevice;
    return withoutJid.split('').filter((char) => char >= '0' && char <= '9').join('');
}

function safeRatio(success: number, failed: number) {
    const total = success + failed;
    if (total <= 0) {
        return 100;
    }

    return Math.round((success / total) * 100);
}

function formatElapsedForAlert(valueMs?: number | null) {
    if (!Number.isFinite(valueMs) || (valueMs || 0) <= 0) {
        return null;
    }

    const totalMinutes = Math.round((valueMs || 0) / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours <= 0) {
        return `${minutes}m`;
    }

    if (minutes === 0) {
        return `${hours}h`;
    }

    return `${hours}h ${minutes}m`;
}

function buildIngestionStallAlertSignature(input: {
    lastInboundAt?: string | null;
    disconnectReason?: string | null;
    autoReconnectBlocked?: boolean;
}) {
    return [
        String(input.lastInboundAt || 'none').trim() || 'none',
        String(input.disconnectReason || '').trim().toLowerCase() || 'none',
        input.autoReconnectBlocked ? 'blocked' : 'open',
    ].join('|');
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

function isMissingEventLogSessionLabelError(error: unknown) {
    const err = error as { code?: string; message?: string; details?: string; hint?: string } | null;
    const message = [
        err?.message,
        err?.details,
        err?.hint,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    return (String(err?.code || '') === 'PGRST204' || String(err?.code || '') === '42703') &&
        message.includes('session_label');
}

function isMissingGroupHealthColumnError(error: unknown, column: string) {
    const err = error as { code?: string; message?: string; details?: string; hint?: string } | null;
    const message = [
        err?.message,
        err?.details,
        err?.hint,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    return (String(err?.code || '') === 'PGRST204' || String(err?.code || '') === '42703') &&
        message.includes(column.toLowerCase());
}

export class WhatsAppHealthService {
    private eventLogSessionField: EventLogSessionField = 'session_label';
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private heartbeatRunning = false;
    private heartbeatLoopActive = false;
    private readonly heartbeatLogAt = new Map<string, number>();
    private readonly heartbeatRehydrateAt = new Map<string, number>();
    private readonly parsedHistoryGroupsCache = new Map<string, { expiresAt: number; rows: any[] }>();
    private readonly heartbeatIntervalMs = Number(process.env.WHATSAPP_HEALTH_HEARTBEAT_MS || 2_500);
    private readonly heartbeatReconnectAfterMs = Number(process.env.WHATSAPP_HEALTH_RECONNECT_AFTER_MS || 5_000);
    private readonly heartbeatRehydrateAfterMs = Number(process.env.WHATSAPP_HEALTH_REHYDRATE_AFTER_MS || 5 * 60_000);
    private readonly heartbeatConnectedStallAfterMs = Number(process.env.WHATSAPP_HEALTH_CONNECTED_STALL_AFTER_MS || 6 * HOUR_MS);
    private readonly healthWarningAfterMs = Number(process.env.WHATSAPP_HEALTH_WARNING_AFTER_MS || 6 * HOUR_MS);
    private readonly healthCriticalAfterMs = Number(process.env.WHATSAPP_HEALTH_CRITICAL_AFTER_MS || 12 * HOUR_MS);

    startHeartbeatLoop(sessionManager: HeartbeatSessionManager) {
        if (this.heartbeatTimer) {
            return;
        }

        this.heartbeatLoopActive = true;
        const scheduleNextSweep = (delayMs: number) => {
            if (!this.heartbeatLoopActive) {
                return;
            }

            if (this.heartbeatTimer) {
                clearTimeout(this.heartbeatTimer);
            }

            this.heartbeatTimer = setTimeout(() => {
                if (!this.heartbeatLoopActive) {
                    return;
                }

                void this.runHeartbeatSweep(sessionManager).catch((error) => {
                    console.warn('[WhatsAppHealthService] Heartbeat sweep failed', error);
                }).finally(() => {
                    scheduleNextSweep(this.getHumanHeartbeatDelay());
                });
            }, delayMs);

            if (typeof this.heartbeatTimer.unref === 'function') {
                this.heartbeatTimer.unref();
            }
        };

        void this.runHeartbeatSweep(sessionManager).catch((error) => {
            console.warn('[WhatsAppHealthService] Initial heartbeat sweep failed', error);
        }).finally(() => {
            scheduleNextSweep(this.getHumanHeartbeatDelay());
        });
    }

    stopHeartbeatLoop() {
        this.heartbeatLoopActive = false;
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private async upsertGroupHealthRecord(primaryPayload: Record<string, unknown>, compatPayload: Record<string, unknown>) {
        const result = await db
            .from('whatsapp_group_health')
            .upsert(primaryPayload, { onConflict: 'tenant_id,session_label,group_id' });

        if (!result.error) {
            return;
        }

        if (![
            'is_active',
            'last_group_sync_at',
            'last_parsed_at',
            'messages_received_24h',
            'messages_parsed_24h',
            'messages_failed_24h',
        ].some((column) => isMissingGroupHealthColumnError(result.error, column))) {
            throw result.error;
        }

        const { error: compatError } = await db
            .from('whatsapp_group_health')
            .upsert(compatPayload, { onConflict: 'tenant_id,session_label,group_id' });

        if (compatError) {
            throw compatError;
        }
    }

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
                await this.upsertGroupHealthRecord(
                    {
                        tenant_id: tenantId,
                        session_label: sessionLabel,
                        group_id: group.id,
                        group_name: group.name || group.id,
                        is_active: true,
                        last_group_sync_at: now,
                        updated_at: now,
                    },
                    {
                        tenant_id: tenantId,
                        session_label: sessionLabel,
                        group_id: group.id,
                        group_name: group.name || group.id,
                        status: 'active',
                        last_sync_at: now,
                        updated_at: now,
                    },
                );

                syncedCount++;
            } catch (groupError: unknown) {
                console.error('[WhatsAppHealthService] Unexpected error syncing group health', group.id, groupError);
                failedCount++;
            }
        }

        const syncedIds = new Set(uniqueGroups.map((g) => g.id));
        const { data: existingGroups } = await db
            .from('whatsapp_group_health')
            .select('group_id')
            .eq('tenant_id', tenantId)
            .eq('session_label', sessionLabel);
        const staleIds = (existingGroups || [])
            .map((r: any) => String(r.group_id || ''))
            .filter((id: string) => id && !syncedIds.has(id));
        for (const staleId of staleIds) {
            await db
                .from('whatsapp_group_health')
                .update({ is_active: false, updated_at: now })
                .eq('tenant_id', tenantId)
                .eq('session_label', sessionLabel)
                .eq('group_id', staleId);
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

        const shouldCountReceived = input.countReceived !== false;
        const nextReceived = Number(existingHealth?.messages_received_24h || 0) + (shouldCountReceived ? 1 : 0);
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

        const groupReceived = Number(existingGroup?.messages_received_24h || 0) + (shouldCountReceived ? 1 : 0);
        const groupParsed = Number(existingGroup?.messages_parsed_24h || 0) + (input.parsed ? 1 : 0);
        const groupFailed = Number(existingGroup?.messages_failed_24h || 0) + (input.failed ? 1 : 0);
        const nextStatus = deriveGroupStatus(timestamp, groupFailed);

        await this.upsertGroupHealthRecord(
            {
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
            },
            {
                tenant_id: input.tenantId,
                session_label: input.sessionLabel,
                group_id: groupId,
                group_name: existingGroup?.group_name || groupId,
                status: nextStatus,
                last_message_at: timestamp,
                last_sync_at: timestamp,
                updated_at: new Date().toISOString(),
            },
        );
    }

    async getHealth(tenantId: string) {
        const [healthResult, sessionMetaResult] = await Promise.all([
            db
                .from('whatsapp_ingestion_health')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('updated_at', { ascending: false }),
            db
                .from('whatsapp_sessions')
                .select('label, session_data')
                .eq('tenant_id', tenantId),
        ]);
        const { data, error } = healthResult;

        if (error) {
            throw error;
        }

        if (sessionMetaResult.error && this.shouldLogHeartbeat(`get_health_session_meta_failed:${tenantId}`, 10 * 60_000)) {
            console.warn('[WhatsAppHealthService] Could not load WhatsApp session metadata for health response', {
                tenantId,
                error: sessionMetaResult.error,
            });
        }

        const sessionMetaMap = new Map(
            ((Array.isArray(sessionMetaResult.data) ? sessionMetaResult.data : []) as Array<{
                label?: string | null;
                session_data?: Record<string, unknown> | null;
            }>).map((row) => {
                const sessionData = (row.session_data && typeof row.session_data === 'object')
                    ? row.session_data as Record<string, unknown>
                    : {};
                return [
                    String(row.label || '').trim(),
                    {
                        disconnectReason: String(sessionData.disconnectReason || '').trim() || null,
                        autoReconnectBlocked: Boolean(sessionData.autoReconnectBlocked),
                        autoReconnectBlockedAt: String(sessionData.autoReconnectBlockedAt || '').trim() || null,
                    },
                ] as const;
            }),
        );

        const sessions = (data || []).map((row: any) => ({
            ...(sessionMetaMap.get(String(row.session_label || '').trim()) || {
                disconnectReason: null,
                autoReconnectBlocked: false,
                autoReconnectBlockedAt: null,
            }),
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

        const replayStats = await this.getReplayStats24h(tenantId);

        return {
            sessions: sessionsWithReconnect,
            summary: {
                ...summary,
                parserSuccessRate: safeRatio(summary.messagesParsed24h, summary.messagesFailed24h),
                healthState: this.deriveAggregateHealthState(sessions),
                totalSessions: sessions.length,
                reconnectingSessions: sessionsWithReconnect.filter(s => s.isReconnecting).length,
                replayBacklog24h: replayStats.pendingMessages24h,
                replayCompleted24h: replayStats.completedMessages24h,
                replayFailed24h: replayStats.failedMessages24h,
            },
        };
    }

    async getGroupHealth(tenantId: string) {
        const { data, error } = await db
            .from('whatsapp_group_health')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .order('updated_at', { ascending: false });

        if (error) {
            throw error;
        }

        const groupIds = (data || []).map((row: any) => String(row.group_id || '')).filter(Boolean);
        const parsingMap = new Map<string, { isParsing: boolean; behavior: string | null }>();

        if (groupIds.length > 0) {
            const { data: configs } = await db
                .from('group_configs')
                .select('group_id, behavior')
                .eq('tenant_id', tenantId)
                .in('group_id', groupIds);

            const { data: groupRows } = await db
                .from('whatsapp_groups')
                .select('group_jid, is_parsing')
                .eq('workspace_id', tenantId)
                .in('group_jid', groupIds);

            for (const row of groupRows || []) {
                parsingMap.set(String(row.group_jid || ''), {
                    isParsing: Boolean(row.is_parsing),
                    behavior: null,
                });
            }

            for (const row of configs || []) {
                const groupId = String(row.group_id || '');
                const current = parsingMap.get(groupId) || { isParsing: false, behavior: null };
                parsingMap.set(groupId, {
                    isParsing: row.behavior === 'Listen' || row.behavior === 'AutoReply',
                    behavior: String(row.behavior || ''),
                });
                if (current.isParsing && !row.behavior) {
                    parsingMap.set(groupId, current);
                }
            }
        }

        const liveRows = (data || []).map((row: any) => {
            const parsingState = parsingMap.get(String(row.group_id || '')) || { isParsing: false, behavior: 'Ignore' };
            return ({
            id: row.id,
            sessionLabel: row.session_label,
            groupId: row.group_id,
            groupName: row.group_name,
            lastGroupSyncAt: row.last_group_sync_at || row.last_sync_at || null,
            lastMessageAt: row.last_message_at,
            lastParsedAt: row.last_parsed_at || null,
            messagesReceived24h: Number(row.messages_received_24h || 0),
            messagesParsed24h: Number(row.messages_parsed_24h || 0),
            messagesFailed24h: Number(row.messages_failed_24h || 0),
            status: row.status || 'unknown',
            isParsing: parsingState.isParsing,
            behavior: parsingState.behavior,
        });
        });

        const parsedHistoryRows = await this.getParsedHistoryGroupHealth(tenantId, liveRows);
        return [...liveRows, ...parsedHistoryRows];
    }

    private async getParsedHistoryGroupHealth(tenantId: string, liveRows: any[]) {
        const cached = this.parsedHistoryGroupsCache.get(tenantId);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.rows;
        }

        const liveGroupIds = new Set(
            liveRows
                .map((row) => String(row.groupId || '').trim())
                .filter(Boolean),
        );
        const grouped = new Map<string, {
            groupId: string;
            groupName: string;
            sessionLabel: string;
            total: number;
            latest: string | null;
        }>();

        for (const table of ['stream_items', 'stream_items_residential', 'stream_items_commercial'] as const) {
            const rows = await this.fetchParsedHistoryGroupRows(table, tenantId);
            for (const row of rows) {
                const groupId = String(row.source_group_id || row.source_thread_jid || '').trim();
                if (!groupId || liveGroupIds.has(groupId)) {
                    continue;
                }

                const groupName = String(row.source_group_name || '').trim() || groupId;
                const sessionLabel = String(row.session_label || '').trim() || PARSED_HISTORY_SESSION_LABEL;
                const key = `${sessionLabel}:${groupId}`;
                const current = grouped.get(key) || {
                    groupId,
                    groupName,
                    sessionLabel,
                    total: 0,
                    latest: null,
                };

                current.total += 1;
                const createdAt = String(row.created_at || '').trim() || null;
                if (createdAt && (!current.latest || createdAt > current.latest)) {
                    current.latest = createdAt;
                }
                if ((!current.groupName || current.groupName === current.groupId) && groupName) {
                    current.groupName = groupName;
                }

                grouped.set(key, current);
            }
        }

        const rows = Array.from(grouped.values())
            .sort((left, right) => String(right.latest || '').localeCompare(String(left.latest || '')))
            .map((group) => ({
                id: `parsed-history:${group.sessionLabel}:${group.groupId}`,
                sessionLabel: group.sessionLabel,
                groupId: group.groupId,
                groupName: group.groupName,
                lastGroupSyncAt: null,
                lastMessageAt: group.latest,
                lastParsedAt: group.latest,
                messagesReceived24h: group.total,
                messagesParsed24h: group.total,
                messagesFailed24h: 0,
                status: 'parsed_history',
                isParsing: true,
                behavior: 'Parsed history',
                source: 'parsed_history',
            }));

        this.parsedHistoryGroupsCache.set(tenantId, {
            expiresAt: Date.now() + PARSED_HISTORY_CACHE_MS,
            rows,
        });

        return rows;
    }

    private async fetchParsedHistoryGroupRows(table: 'stream_items' | 'stream_items_residential' | 'stream_items_commercial', tenantId: string) {
        const rows: any[] = [];

        for (let from = 0; from < PARSED_HISTORY_MAX_ROWS_PER_TABLE; from += PARSED_HISTORY_PAGE_SIZE) {
            const to = from + PARSED_HISTORY_PAGE_SIZE - 1;
            const { data, error } = await db
                .from(table)
                .select('session_label, source_group_id, source_thread_jid, source_group_name, created_at')
                .eq('tenant_id', tenantId)
                .not('source_group_id', 'is', null)
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) {
                const message = String(error.message || '').toLowerCase();
                if (message.includes('does not exist') || message.includes('schema cache')) {
                    return rows;
                }
                throw error;
            }

            const page = Array.isArray(data) ? data : [];
            rows.push(...page);
            if (page.length < PARSED_HISTORY_PAGE_SIZE) {
                break;
            }
        }

        return rows;
    }

    async getEvents(tenantId: string, limit = 30) {
        const { data, error } = await this.readEventRows(tenantId, limit);

        if (error) {
            throw error;
        }

        return (data || [])
            .filter((row: any) => !HIDDEN_EVENT_TYPES.has(String(row.event_type || '')))
            .map((row: any) => ({
                id: row.id,
                sessionLabel: row.session_label || row.session_id || null,
                eventType: row.event_type,
                message: row.message,
                metadata: row.metadata || {},
                createdAt: row.created_at,
            }));
    }

    async appendEvent(tenantId: string, sessionLabel: string, eventType: string, message: string, metadata: Record<string, unknown> = {}) {
        await this.logEvent(tenantId, sessionLabel, eventType, message, metadata);
    }

    private shouldLogHeartbeat(key: string, cooldownMs: number) {
        const now = Date.now();
        const lastAt = this.heartbeatLogAt.get(key) || 0;
        if (now - lastAt < cooldownMs) {
            return false;
        }

        this.heartbeatLogAt.set(key, now);
        return true;
    }

    private async maybeRehydrateMissingSessions(sessionManager: HeartbeatSessionManager) {
        if (typeof sessionManager.rehydratePersistedSessions !== 'function') {
            return;
        }

        const liveSessions = sessionManager.getAllSessions();
        if (liveSessions.length > 0) {
            return;
        }

        const now = Date.now();
        const lastAt = this.heartbeatRehydrateAt.get('missing_sessions') || 0;
        if (now - lastAt < this.heartbeatRehydrateAfterMs) {
            return;
        }

        this.heartbeatRehydrateAt.set('missing_sessions', now);
        if (this.shouldLogHeartbeat('heartbeat_rehydrate_missing_sessions', 10 * 60_000)) {
            console.warn('[WhatsAppHealthService] No live WhatsApp sessions found; attempting to rehydrate persisted sessions.');
        }

        try {
            await sessionManager.rehydratePersistedSessions();
        } catch (error) {
            if (this.shouldLogHeartbeat('heartbeat_rehydrate_missing_sessions_failed', 10 * 60_000)) {
                console.warn('[WhatsAppHealthService] Rehydrating persisted WhatsApp sessions failed', error);
            }
        }
    }

    private async runHeartbeatSweep(sessionManager: HeartbeatSessionManager) {
        if (this.heartbeatRunning) {
            return;
        }

        this.heartbeatRunning = true;
        try {
            await this.maybeRehydrateMissingSessions(sessionManager);
            const [sessionResult, healthResult] = await Promise.all([
                db
                    .from('whatsapp_sessions')
                    .select('tenant_id, label, status, owner_name, updated_at, session_data, creds, keys')
                    .not('tenant_id', 'is', null),
                db
                    .from('whatsapp_ingestion_health')
                    .select('tenant_id, session_label, group_count, active_groups_24h, last_inbound_message_at')
                    .not('tenant_id', 'is', null),
            ]);
            const { data, error } = sessionResult;

            if (error) {
                if (this.shouldLogHeartbeat('heartbeat_sweep_load_error', 5 * 60_000)) {
                    console.warn('[WhatsAppHealthService] Heartbeat sweep could not load persisted sessions', error);
                }
                return;
            }

            if (healthResult.error && this.shouldLogHeartbeat('heartbeat_health_load_error', 5 * 60_000)) {
                console.warn('[WhatsAppHealthService] Heartbeat sweep could not load ingestion health rows', healthResult.error);
            }

            const healthMap = new Map(
                ((Array.isArray(healthResult.data) ? healthResult.data : []) as Array<{
                    tenant_id?: string | null;
                    session_label?: string | null;
                    group_count?: number | null;
                    active_groups_24h?: number | null;
                    last_inbound_message_at?: string | null;
                }>).map((row) => [
                    `${String(row.tenant_id || '').trim()}:${String(row.session_label || '').trim()}`,
                    row,
                ]),
            );

            const liveSessions = new Map(
                sessionManager.getAllSessions().map((session) => [
                    `${session.tenantId}:${session.label}`,
                    session,
                ]),
            );
            const now = Date.now();

            for (const row of (data || []) as Array<{
                tenant_id?: string | null;
                label?: string | null;
                status?: string | null;
                owner_name?: string | null;
                updated_at?: string | null;
                session_data?: Record<string, unknown> | null;
                creds?: unknown;
                keys?: unknown;
            }>) {
                const tenantId = String(row.tenant_id || '').trim();
                const sessionLabel = String(row.label || '').trim();
                if (!tenantId || !sessionLabel) {
                    continue;
                }

                const liveSession = liveSessions.get(`${tenantId}:${sessionLabel}`);
                const liveStatus = String(liveSession?.status || '').trim().toLowerCase();
                const dbStatus = String(row.status || 'disconnected').trim().toLowerCase();
                const updatedAtMs = row.updated_at ? new Date(row.updated_at).getTime() : NaN;
                const ageMs = Number.isFinite(updatedAtMs) ? Math.max(0, now - updatedAtMs) : Number.MAX_SAFE_INTEGER;
                const sessionData = (row.session_data && typeof row.session_data === 'object') ? row.session_data as Record<string, unknown> : {};
                const pendingConnect = (sessionData.pendingConnect && typeof sessionData.pendingConnect === 'object')
                    ? sessionData.pendingConnect as Record<string, unknown>
                    : null;
                const disconnectReason = String(sessionData.disconnectReason || '').trim().toLowerCase();
                const autoReconnectBlocked = Boolean(sessionData.autoReconnectBlocked) || disconnectReason === 'replaced';
                const staleEnough = ageMs >= this.heartbeatReconnectAfterMs;
                const healthRow = healthMap.get(`${tenantId}:${sessionLabel}`);
                const groupCount = Number(healthRow?.group_count || 0);
                const activeGroups24h = Number(healthRow?.active_groups_24h || 0);
                const lastInboundAt = healthRow?.last_inbound_message_at ? new Date(healthRow.last_inbound_message_at).getTime() : NaN;
                const hasInboundHistory = Number.isFinite(lastInboundAt);
                const lastInboundAgeMs = hasInboundHistory ? Math.max(0, now - lastInboundAt) : null;
                const expectsTraffic = groupCount > 0 || activeGroups24h > 0;
                const stallDetected = expectsTraffic && hasInboundHistory && (lastInboundAgeMs || 0) >= this.heartbeatConnectedStallAfterMs;
                const connectedButStalled =
                    liveStatus === 'connected' &&
                    !autoReconnectBlocked &&
                    !liveSession?.isReconnecting &&
                    stallDetected;

                if (pendingConnect && !autoReconnectBlocked) {
                    const mode = pendingConnect.mode === 'pairing' ? 'pairing' : 'qr';
                    const pendingPhone = normalizePhoneNumber(String(pendingConnect.phoneNumber || sessionData.phoneNumber || sessionData.displayPhoneNumber || '').trim());
                    const pendingOwnerName = String(pendingConnect.ownerName || row.owner_name || sessionData.ownerName || '').trim();
                    const requestedAt = String(pendingConnect.requestedAt || '').trim();
                    const requestedAtMs = requestedAt ? new Date(requestedAt).getTime() : NaN;
                    const requestAgeMs = Number.isFinite(requestedAtMs) ? Math.max(0, now - requestedAtMs) : ageMs;

                    if (!liveSession || liveStatus === 'disconnected' || liveStatus === 'connecting' || liveStatus === 'reconnecting') {
                        if (this.shouldLogHeartbeat(`heartbeat_connect_request:${tenantId}:${sessionLabel}`, 30_000)) {
                            await this.appendEvent(
                                tenantId,
                                sessionLabel,
                                'heartbeat_connect_request',
                                `Worker is starting queued WhatsApp ${mode} connection for ${sessionLabel}.`,
                                {
                                    mode,
                                    requestAgeMs,
                                    liveStatus: liveStatus || null,
                                },
                            );
                        }

                        await sessionManager.createSession(tenantId, () => {}, () => {}, {
                            label: sessionLabel,
                            ownerName: pendingOwnerName || undefined,
                            phoneNumber: pendingPhone || undefined,
                            usePairingCode: mode === 'pairing' ? pendingPhone || undefined : undefined,
                            skipLimitCheck: true,
                            freshAuth: true,
                        });
                        continue;
                    }
                }

                if (!row.creds || !row.keys) {
                    continue;
                }

                if (stallDetected && this.shouldLogHeartbeat(`ingestion_stalled:${tenantId}:${sessionLabel}`, 30 * 60_000)) {
                    await this.appendEvent(
                        tenantId,
                        sessionLabel,
                        'ingestion_stalled',
                        `No inbound WhatsApp messages have landed for ${sessionLabel} past the stall threshold.`,
                        {
                            liveStatus: liveStatus || null,
                            groupCount,
                            activeGroups24h,
                            lastInboundAgeMs,
                            disconnectReason: disconnectReason || null,
                            autoReconnectBlocked,
                        },
                    );
                    await this.sendIngestionStalledPush({
                        tenantId,
                        sessionLabel,
                        phoneNumber: String(row.session_data?.phoneNumber || row.session_data?.displayPhoneNumber || '').trim() || null,
                        disconnectReason: disconnectReason || null,
                        autoReconnectBlocked,
                        activeGroups24h,
                        groupCount,
                        lastInboundAgeMs,
                        lastInboundAt: healthRow?.last_inbound_message_at || null,
                    });
                }

                if (connectedButStalled && typeof sessionManager.forceReconnect === 'function') {
                    if (this.shouldLogHeartbeat(`heartbeat_restart_stalled_connected:${tenantId}:${sessionLabel}`, 30 * 60_000)) {
                        await this.appendEvent(
                            tenantId,
                            sessionLabel,
                            'heartbeat_restart_stalled_connected',
                            `Heartbeat is restarting a connected but stalled WhatsApp session for ${sessionLabel}.`,
                            {
                                liveStatus,
                                groupCount,
                                activeGroups24h,
                                lastInboundAgeMs,
                            },
                        );
                    }

                    await sessionManager.forceReconnect(tenantId, sessionLabel);
                    continue;
                }

                if (liveStatus === 'connected' || dbStatus === 'connected' && !staleEnough) {
                    continue;
                }

                if ((liveStatus === 'connecting' || dbStatus === 'connecting') && !staleEnough) {
                    continue;
                }

                if (liveSession?.isReconnecting && !staleEnough) {
                    continue;
                }

                if (liveStatus === 'disconnected' && !staleEnough) {
                    continue;
                }

                try {
                    if (liveSession && liveStatus === 'disconnected' && staleEnough) {
                        if (this.shouldLogHeartbeat(`heartbeat_restart_disconnected:${tenantId}:${sessionLabel}`, 15 * 60_000)) {
                            await this.appendEvent(
                                tenantId,
                                sessionLabel,
                                'heartbeat_restart_disconnected',
                                `Heartbeat is restarting a disconnected WhatsApp session for ${sessionLabel}.`,
                                {
                                    previousStatus: dbStatus,
                                    liveStatus: liveStatus || null,
                                    ageMs,
                                    disconnectReason: disconnectReason || null,
                                    autoReconnectBlocked,
                                },
                            );
                        }

                        await sessionManager.createSession(tenantId, () => {}, () => {}, {
                            label: sessionLabel,
                            ownerName: String(row.owner_name || row.session_data?.ownerName || '').trim() || undefined,
                            phoneNumber: String(row.session_data?.phoneNumber || row.session_data?.displayPhoneNumber || '').trim() || undefined,
                            skipLimitCheck: true,
                        });
                        continue;
                    }

                    if (liveSession) {
                        if (this.shouldLogHeartbeat(`heartbeat_observed_stale:${tenantId}:${sessionLabel}`, 15 * 60_000)) {
                            await this.appendEvent(
                                tenantId,
                                sessionLabel,
                                'heartbeat_observed_stale',
                                `Heartbeat observed a stale WhatsApp row for ${sessionLabel} but left the live client alone.`,
                                {
                                    previousStatus: dbStatus,
                                    liveStatus: liveStatus || null,
                                    ageMs,
                                    disconnectReason: disconnectReason || null,
                                    autoReconnectBlocked,
                                },
                            );
                        }
                        continue;
                    }

                    if (this.shouldLogHeartbeat(`heartbeat_rehydrate:${tenantId}:${sessionLabel}`, 15 * 60_000)) {
                        await this.appendEvent(
                            tenantId,
                            sessionLabel,
                            'heartbeat_rehydrate',
                            `Heartbeat is rehydrating an offline WhatsApp session for ${sessionLabel}.`,
                            {
                                previousStatus: dbStatus,
                                liveStatus: liveStatus || null,
                                ageMs,
                                disconnectReason: disconnectReason || null,
                                autoReconnectBlocked,
                            },
                        );
                    }

                    await sessionManager.createSession(tenantId, () => {}, () => {}, {
                        label: sessionLabel,
                        ownerName: String(row.owner_name || row.session_data?.ownerName || '').trim() || undefined,
                        phoneNumber: String(row.session_data?.phoneNumber || row.session_data?.displayPhoneNumber || '').trim() || undefined,
                        skipLimitCheck: true,
                    });
                } catch (error) {
                    if (this.shouldLogHeartbeat(`heartbeat_rehydrate_failed:${tenantId}:${sessionLabel}`, 10 * 60_000)) {
                        console.warn('[WhatsAppHealthService] Heartbeat rehydrate failed', {
                            tenantId,
                            sessionLabel,
                            error,
                        });
                    }

                    if (this.shouldLogHeartbeat(`heartbeat_rehydrate_failed_event:${tenantId}:${sessionLabel}`, 10 * 60_000)) {
                        await this.appendEvent(
                            tenantId,
                            sessionLabel,
                            'heartbeat_rehydrate_failed',
                            `Heartbeat could not rehydrate WhatsApp session ${sessionLabel}.`,
                            {
                                previousStatus: dbStatus,
                                liveStatus: liveStatus || null,
                                ageMs,
                                error: error instanceof Error ? error.message : String(error || 'Unknown error'),
                            },
                        );
                    }
                }
            }
        } finally {
            this.heartbeatRunning = false;
        }
    }

    private getHumanHeartbeatDelay() {
        const base = Math.max(1_500, this.heartbeatIntervalMs);
        return this.withJitter(base, 0.3, 1_500);
    }

    private getHumanReconnectDelay(ageMs: number, reconnectAttempts: number) {
        const ageFactor = ageMs >= DAY_MS ? 1.15 : ageMs >= 60_000 ? 0.85 : 0.55;
        const attemptFactor = Math.max(0, reconnectAttempts) * 450;
        const base = Math.min(8_000, 900 + attemptFactor + Math.round(ageFactor * 900));
        return this.withJitter(base, 0.35, 750);
    }

    private withJitter(baseMs: number, spreadRatio: number, minimumMs: number) {
        const spread = Math.max(0, Math.round(baseMs * spreadRatio));
        const offset = Math.round((Math.random() * (spread * 2)) - spread);
        return Math.max(minimumMs, baseMs + offset);
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

        const { error } = await this.insertEventRow(tenantId, sessionLabel, eventType, message, metadata);

        if (error) {
            console.error('[WhatsAppHealthService] Failed to log event:', error);
        }
    }

    private async readEventRows(tenantId: string, limit: number) {
        let result = await db
            .from('whatsapp_event_logs')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (result.error && this.eventLogSessionField === 'session_label' && isMissingEventLogSessionLabelError(result.error)) {
            this.eventLogSessionField = 'session_id';
            result = await db
                .from('whatsapp_event_logs')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
                .limit(limit);
        }

        return result;
    }

    private async insertEventRow(tenantId: string, sessionLabel: string, eventType: string, message: string, metadata: Record<string, unknown>) {
        let result = await db
            .from('whatsapp_event_logs')
            .insert({
                tenant_id: tenantId,
                [this.eventLogSessionField]: sessionLabel,
                event_type: eventType,
                message,
                metadata,
            });

        if (result.error && this.eventLogSessionField === 'session_label' && isMissingEventLogSessionLabelError(result.error)) {
            this.eventLogSessionField = 'session_id';
            result = await db
                .from('whatsapp_event_logs')
                .insert({
                    tenant_id: tenantId,
                    session_id: sessionLabel,
                    event_type: eventType,
                    message,
                    metadata,
                });
        }

        return result;
    }

    private deriveHealthState(row: any) {
        if (getConnectionStatus(row) !== 'connected') {
            return 'critical';
        }

        const lastInboundAt = row.last_inbound_message_at ? new Date(row.last_inbound_message_at).getTime() : NaN;
        const hasInboundHistory = Number.isFinite(lastInboundAt);
        const lastInboundAge = hasInboundHistory ? Date.now() - lastInboundAt : Number.MAX_SAFE_INTEGER;
        const groupCount = Number(row.group_count || 0);
        const activeGroups24h = Number(row.active_groups_24h || 0);
        const expectsTraffic = groupCount > 0 || activeGroups24h > 0;

        if (row.messages_failed_24h > 0) {
            return 'warning';
        }

        if (!row.last_inbound_message_at) {
            return 'warning';
        }

        if (expectsTraffic && lastInboundAge > this.healthCriticalAfterMs) {
            return 'critical';
        }

        if (expectsTraffic && lastInboundAge > this.healthWarningAfterMs) {
            return 'warning';
        }

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

    private async getReplayStats24h(tenantId: string) {
        const cutoff = new Date(Date.now() - DAY_MS).toISOString();
        const [eventResult, rawDumpResult, streamResults] = await Promise.all([
            db
                .from('whatsapp_event_logs')
                .select('event_type, metadata, created_at')
                .eq('tenant_id', tenantId)
                .gte('created_at', cutoff)
                .in('event_type', ['history_replay_completed', 'history_replay_failed']),
            db
                .from('raw_dump')
                .select('id, gate_status, received_at')
                .eq('workspace_id', tenantId)
                .gte('received_at', cutoff)
                .eq('gate_status', 'passed'),
            Promise.all([
                db.from('stream_items').select('source_message_id').eq('tenant_id', tenantId).gte('created_at', cutoff),
                db.from('stream_items_residential').select('source_message_id').eq('tenant_id', tenantId).gte('created_at', cutoff),
                db.from('stream_items_commercial').select('source_message_id').eq('tenant_id', tenantId).gte('created_at', cutoff),
            ]),
        ]);

        const eventData = !eventResult.error && Array.isArray(eventResult.data) ? eventResult.data : [];
        const rawDumpData = !rawDumpResult.error && Array.isArray(rawDumpResult.data) ? rawDumpResult.data : [];
        const streamRows = streamResults.flatMap((result) => (!result.error && Array.isArray(result.data) ? result.data : []));

        const sumCount = (rows: any[], type: string) => rows
            .filter((row) => String(row?.event_type || '') === type)
            .reduce((total, row) => {
                const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
                const rawCount = Number(metadata.messageCount ?? metadata.message_count ?? 0);
                return total + (Number.isFinite(rawCount) ? rawCount : 0);
            }, 0);

        const parsedSourceIds = new Set(
            streamRows
                .map((row: any) => String(row?.source_message_id || '').trim())
                .filter(Boolean),
        );

        const pendingMessages24h = rawDumpData
            .map((row: any) => String(row?.id || '').trim())
            .filter(Boolean)
            .filter((rawId) => !parsedSourceIds.has(rawId)).length;

        return {
            completedMessages24h: sumCount(eventData, 'history_replay_completed'),
            failedMessages24h: sumCount(eventData, 'history_replay_failed'),
            pendingMessages24h,
        };
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

    private async sendIngestionStalledPush(input: {
        tenantId: string;
        sessionLabel: string;
        phoneNumber?: string | null;
        disconnectReason?: string | null;
        autoReconnectBlocked?: boolean;
        activeGroups24h?: number;
        groupCount?: number;
        lastInboundAgeMs?: number | null;
        lastInboundAt?: string | null;
    }) {
        const { data: sessionRow, error: sessionError } = await db
            .from('whatsapp_sessions')
            .select('session_data')
            .eq('tenant_id', input.tenantId)
            .eq('label', input.sessionLabel)
            .maybeSingle();

        if (sessionError && this.shouldLogHeartbeat(`ingestion_stalled_push_session_load_failed:${input.tenantId}:${input.sessionLabel}`, 30 * 60_000)) {
            console.warn('[WhatsAppHealthService] Failed to load session row before stalled push notification', {
                tenantId: input.tenantId,
                sessionLabel: input.sessionLabel,
                error: sessionError,
            });
        }

        const sessionData = (sessionRow?.session_data && typeof sessionRow.session_data === 'object')
            ? sessionRow.session_data as Record<string, unknown>
            : {};
        const alertSignature = buildIngestionStallAlertSignature({
            lastInboundAt: input.lastInboundAt || null,
            disconnectReason: input.disconnectReason || null,
            autoReconnectBlocked: Boolean(input.autoReconnectBlocked),
        });
        const lastAlertSignature = String(sessionData.lastIngestionStallAlertSignature || '').trim();
        const lastAlertDelivery = String(sessionData.lastIngestionStallAlertDelivery || '').trim().toLowerCase();

        if (lastAlertSignature === alertSignature && lastAlertDelivery === 'sent') {
            return;
        }

        const title = input.disconnectReason === 'replaced'
            ? 'WhatsApp session replaced'
            : 'WhatsApp ingestion stalled';
        const subject = input.phoneNumber || input.sessionLabel;
        const elapsed = formatElapsedForAlert(input.lastInboundAgeMs);
        const trafficScope = input.activeGroups24h && input.activeGroups24h > 0
            ? `${input.activeGroups24h} active groups today`
            : input.groupCount && input.groupCount > 0
                ? `${input.groupCount} known groups`
                : null;
        const reason = input.disconnectReason
            ? `Reason: ${input.disconnectReason.replace(/_/g, ' ')}.`
            : '';

        const parts = [
            `${subject} is not receiving fresh WhatsApp messages${elapsed ? ` for ${elapsed}` : ''}.`,
            trafficScope ? `${trafficScope}.` : '',
            input.autoReconnectBlocked ? 'Auto-reconnect is blocked.' : '',
            reason,
        ].filter(Boolean);

        try {
            const delivery = await notificationService.sendToTenant(
                input.tenantId,
                title,
                parts.join(' '),
                {
                    tenantId: input.tenantId,
                    label: input.sessionLabel,
                    phoneNumber: input.phoneNumber || null,
                    action: input.disconnectReason === 'replaced' ? 'whatsapp_conflict' : 'whatsapp_reconnect',
                    status: 'stalled',
                    disconnectReason: input.disconnectReason || null,
                    autoReconnectBlocked: Boolean(input.autoReconnectBlocked),
                },
            );

            const nextSessionData = {
                ...sessionData,
                lastIngestionStallAlertSignature: alertSignature,
                lastIngestionStallAlertDelivery: delivery.sent > 0 ? 'sent' : (delivery.skipped ? 'skipped' : 'no_subscriptions'),
                lastIngestionStallAlertAt: new Date().toISOString(),
            };

            const { error: updateError } = await db
                .from('whatsapp_sessions')
                .update({ session_data: nextSessionData })
                .eq('tenant_id', input.tenantId)
                .eq('label', input.sessionLabel);

            if (updateError && this.shouldLogHeartbeat(`ingestion_stalled_push_marker_failed:${input.tenantId}:${input.sessionLabel}`, 30 * 60_000)) {
                console.warn('[WhatsAppHealthService] Failed to persist stalled push marker', {
                    tenantId: input.tenantId,
                    sessionLabel: input.sessionLabel,
                    error: updateError,
                });
            }
        } catch (error) {
            if (this.shouldLogHeartbeat(`ingestion_stalled_push_failed:${input.tenantId}:${input.sessionLabel}`, 30 * 60_000)) {
                console.warn('[WhatsAppHealthService] Failed to send ingestion stalled push notification', {
                    tenantId: input.tenantId,
                    sessionLabel: input.sessionLabel,
                    error,
                });
            }
        }
    }
}

export const whatsappHealthService = new WhatsAppHealthService();
