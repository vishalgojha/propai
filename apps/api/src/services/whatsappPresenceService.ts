import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin || supabase;
const RECENT_WINDOW_HOURS = 24;
const STALE_AFTER_MINUTES = 15;

export type PresenceEventInput = {
    workspaceOwnerId: string;
    actorUserId?: string | null;
    sessionLabel?: string | null;
    source?: string | null;
    eventType: string;
    status: string;
    remoteJid?: string | null;
    tabId?: string | null;
    url?: string | null;
    observedAt?: string | null;
    metadata?: Record<string, unknown> | null;
};

type PresenceEventRow = {
    session_label?: string | null;
    source?: string | null;
    event_type?: string | null;
    status?: string | null;
    remote_jid?: string | null;
    tab_id?: string | null;
    url?: string | null;
    metadata?: Record<string, unknown> | null;
    observed_at?: string | null;
    created_at?: string | null;
};

function normalizeObservedAt(value?: string | null) {
    if (!value) return new Date().toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalizeSessionLabel(value?: string | null) {
    const normalized = String(value || '').trim();
    return normalized || 'default';
}

function isPresenceStale(observedAt?: string | null) {
    const time = new Date(String(observedAt || '')).getTime();
    if (!Number.isFinite(time)) return true;
    return Date.now() - time > STALE_AFTER_MINUTES * 60 * 1000;
}

export class WhatsAppPresenceService {
    async recordEvent(input: PresenceEventInput) {
        const observedAt = normalizeObservedAt(input.observedAt);
        const payload = {
            workspace_owner_id: input.workspaceOwnerId,
            actor_user_id: input.actorUserId || null,
            session_label: normalizeSessionLabel(input.sessionLabel),
            source: String(input.source || 'extension').trim() || 'extension',
            event_type: String(input.eventType || '').trim() || 'presence_signal_seen',
            status: String(input.status || '').trim() || 'unknown',
            remote_jid: input.remoteJid || null,
            tab_id: input.tabId || null,
            url: input.url || null,
            metadata: input.metadata || {},
            observed_at: observedAt,
            created_at: new Date().toISOString(),
        };

        const { error } = await db
            .from('whatsapp_presence_events')
            .insert(payload);

        if (error) {
            throw error;
        }

        return payload;
    }

    async getPresenceStatus(workspaceOwnerId: string, sessionLabel?: string | null) {
        const since = new Date(Date.now() - RECENT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
        let query = db
            .from('whatsapp_presence_events')
            .select('session_label, source, event_type, status, remote_jid, tab_id, url, metadata, observed_at, created_at')
            .eq('workspace_owner_id', workspaceOwnerId)
            .gte('observed_at', since)
            .order('observed_at', { ascending: false })
            .limit(250);

        if (sessionLabel) {
            query = query.eq('session_label', sessionLabel);
        }

        const { data, error } = await query;
        if (error) {
            throw error;
        }

        const rows = (data || []) as PresenceEventRow[];
        const latestBySession = new Map<string, PresenceEventRow>();
        for (const row of rows) {
            const key = normalizeSessionLabel(row.session_label);
            if (!latestBySession.has(key)) {
                latestBySession.set(key, row);
            }
        }

        const sessions = Array.from(latestBySession.entries()).map(([label, row]) => {
            const stale = isPresenceStale(row.observed_at);
            return {
                sessionLabel: label,
                status: stale && row.status === 'connected' ? 'stale' : String(row.status || 'unknown'),
                stale,
                source: row.source || 'extension',
                lastEventType: row.event_type || 'presence_signal_seen',
                lastObservedAt: row.observed_at || row.created_at || null,
                url: row.url || null,
                metadata: row.metadata || {},
            };
        }).sort((left, right) => new Date(String(right.lastObservedAt || 0)).getTime() - new Date(String(left.lastObservedAt || 0)).getTime());

        return {
            summary: {
                recentEvents: rows.length,
                sessionsTracked: sessions.length,
                connectedSessions: sessions.filter((session) => session.status === 'connected').length,
                qrRequiredSessions: sessions.filter((session) => session.status === 'qr_required').length,
                disconnectedSessions: sessions.filter((session) => session.status === 'disconnected').length,
                stalledSessions: sessions.filter((session) => session.status === 'stale' || session.status === 'stalled').length,
            },
            sessions,
            recentEvents: rows.slice(0, 20).map((row) => ({
                sessionLabel: normalizeSessionLabel(row.session_label),
                eventType: row.event_type || 'presence_signal_seen',
                status: row.status || 'unknown',
                observedAt: row.observed_at || row.created_at || null,
                source: row.source || 'extension',
                url: row.url || null,
            })),
        };
    }
}

export const whatsappPresenceService = new WhatsAppPresenceService();
