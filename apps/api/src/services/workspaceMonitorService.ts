import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin || supabase;
const DEFAULT_THREAD_PAGE_SIZE = 100;

type MessageRow = {
    id: string;
    remote_jid: string;
    sender?: string | null;
    text?: string | null;
    timestamp?: string | null;
};

type MirrorRow = {
    id: string;
    remote_jid: string;
    sender_name?: string | null;
    sender_jid?: string | null;
    text?: string | null;
    timestamp?: string | null;
    direction?: 'inbound' | 'outbound' | null;
    session_label?: string | null;
};

type GroupRow = {
    group_jid?: string | null;
    group_name?: string | null;
    locality?: string | null;
    city?: string | null;
    category?: string | null;
    tags?: string[] | null;
    member_count?: number | null;
    broadcast_enabled?: boolean | null;
    is_parsing?: boolean | null;
    last_active_at?: string | null;
    session_label?: string | null;
};

type SessionRow = {
    label: string;
    owner_name?: string | null;
    status: string;
    session_data?: { phoneNumber?: string | null } | null;
    last_sync?: string | null;
};

type MonitorQueryContext = {
    groupsData: GroupRow[];
    groupsByJid: Map<string, GroupRow>;
    sessionGroupIds: Set<string>;
    sessions: SessionRow[];
};

type ThreadPageOptions = {
    inboxOnly?: boolean;
    sessionLabel?: string | null;
    chatId: string;
    before?: string | null;
    limit?: number;
};

function isMissingSchemaEntityError(message?: string | null) {
    const normalized = String(message || '').toLowerCase();
    return (
        normalized.includes(`could not find the table 'public.whatsapp_groups'`) ||
        normalized.includes('schema cache') ||
        normalized.includes('does not exist')
    );
}

function normalizePhone(value?: string | null) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 10 ? digits : null;
}

function isOutboundSender(sender?: string | null) {
    const value = String(sender || '').trim().toLowerCase();
    return value === 'ai' || value === 'propai ai' || value.includes('@');
}

function buildDirectLabel(row: MessageRow) {
    if (row.sender && !isOutboundSender(row.sender)) {
        return row.sender;
    }

    const phone = normalizePhone(row.remote_jid?.split('@')[0]);
    return phone ? `+${phone}` : 'Direct contact';
}

export class WorkspaceMonitorService {
    private async loadMessageRows(workspaceOwnerId: string, sessionLabel?: string | null) {
        let mirrorQuery = db
            .from('whatsapp_message_mirror')
            .select('id, remote_jid, sender_name, sender_jid, text, timestamp, direction, session_label')
            .eq('tenant_id', workspaceOwnerId)
            .order('timestamp', { ascending: false });

        if (sessionLabel) {
            mirrorQuery = mirrorQuery.eq('session_label', sessionLabel);
        }

        const mirrorResult = await mirrorQuery;
        if (!mirrorResult.error && Array.isArray(mirrorResult.data)) {
            return (mirrorResult.data as MirrorRow[]).map((row) => ({
                id: row.id,
                remote_jid: row.remote_jid,
                sender: row.direction === 'outbound'
                    ? (row.sender_name || 'Broker')
                    : (row.sender_name || row.sender_jid || null),
                text: row.text || '',
                timestamp: row.timestamp || new Date().toISOString(),
            }));
        }

        const messagesResult = await db
            .from('messages')
            .select('id, remote_jid, sender, text, timestamp')
            .eq('tenant_id', workspaceOwnerId)
            .order('timestamp', { ascending: false });

        if (messagesResult.error) {
            throw messagesResult.error;
        }

        return (messagesResult.data || []) as MessageRow[];
    }

    private async loadChatMessageRows(workspaceOwnerId: string, chatId: string, sessionLabel?: string | null, before?: string | null, limit?: number) {
        let mirrorQuery = db
            .from('whatsapp_message_mirror')
            .select('id, remote_jid, sender_name, sender_jid, text, timestamp, direction, session_label')
            .eq('tenant_id', workspaceOwnerId)
            .eq('remote_jid', chatId)
            .order('timestamp', { ascending: false });

        if (sessionLabel) {
            mirrorQuery = mirrorQuery.eq('session_label', sessionLabel);
        }

        if (before) {
            mirrorQuery = mirrorQuery.lt('timestamp', before);
        }

        if (typeof limit === 'number') {
            mirrorQuery = mirrorQuery.limit(limit);
        }

        const mirrorResult = await mirrorQuery;
        if (!mirrorResult.error && Array.isArray(mirrorResult.data)) {
            return (mirrorResult.data as MirrorRow[]).map((row) => ({
                id: row.id,
                remote_jid: row.remote_jid,
                sender: row.direction === 'outbound'
                    ? (row.sender_name || 'Broker')
                    : (row.sender_name || row.sender_jid || null),
                text: row.text || '',
                timestamp: row.timestamp || new Date().toISOString(),
            }));
        }

        let messagesQuery = db
            .from('messages')
            .select('id, remote_jid, sender, text, timestamp')
            .eq('tenant_id', workspaceOwnerId)
            .eq('remote_jid', chatId)
            .order('timestamp', { ascending: false });

        if (before) {
            messagesQuery = messagesQuery.lt('timestamp', before);
        }

        if (typeof limit === 'number') {
            messagesQuery = messagesQuery.limit(limit);
        }

        const messagesResult = await messagesQuery;
        if (messagesResult.error) {
            throw messagesResult.error;
        }

        return (messagesResult.data || []) as MessageRow[];
    }

    private async buildContext(workspaceOwnerId: string, sessionLabel?: string | null): Promise<MonitorQueryContext> {
        const [sessionsResult, groupsResult] = await Promise.all([
            db
                .from('whatsapp_sessions')
                .select('label, owner_name, status, session_data, last_sync')
                .eq('tenant_id', workspaceOwnerId)
                .order('last_sync', { ascending: false }),
            (() => {
                let query = db
                    .from('whatsapp_groups')
                    .select('group_jid, group_name, locality, city, category, tags, member_count, broadcast_enabled, is_parsing, last_active_at, session_label')
                    .eq('tenant_id', workspaceOwnerId)
                    .eq('is_archived', false);

                if (sessionLabel) {
                    query = query.eq('session_label', sessionLabel);
                }

                return query;
            })(),
        ]);

        if (sessionsResult.error) throw sessionsResult.error;

        let groupsData: GroupRow[] = [];
        if (groupsResult.error) {
            const message = String(groupsResult.error.message || '');
            if (!isMissingSchemaEntityError(message)) {
                throw groupsResult.error;
            }
        } else {
            groupsData = (groupsResult.data || []) as GroupRow[];
        }

        return {
            groupsData,
            groupsByJid: new Map<string, GroupRow>(
                groupsData.map((group) => [String(group.group_jid || ''), group]),
            ),
            sessionGroupIds: new Set<string>(
                groupsData.map((group) => String(group.group_jid || '')).filter(Boolean),
            ),
            sessions: (sessionsResult.data || []) as SessionRow[],
        };
    }

    private shouldIncludeRow(
        row: MessageRow,
        inboxOnly: boolean,
        sessionLabel: string | null | undefined,
        context: MonitorQueryContext,
    ) {
        const remoteJid = String(row.remote_jid || '');
        const isGroup = remoteJid.endsWith('@g.us');

        if (inboxOnly && isGroup) {
            return false;
        }

        if (!inboxOnly && !isGroup) {
            return false;
        }

        if (sessionLabel && isGroup && context.sessionGroupIds.size > 0 && !context.sessionGroupIds.has(remoteJid)) {
            return false;
        }

        return true;
    }

    private buildChatRecord(row: MessageRow, groupMeta?: GroupRow) {
        const remoteJid = String(row.remote_jid || '');
        const isGroup = remoteJid.endsWith('@g.us');
        const title = isGroup ? groupMeta?.group_name || 'WhatsApp group' : buildDirectLabel(row);
        const messageText = String(row.text || '').trim();
        const timestamp = row.timestamp || new Date().toISOString();

        return {
            id: remoteJid,
            remoteJid,
            type: isGroup ? 'group' : 'direct',
            title,
            preview: messageText,
            lastMessageAt: timestamp,
            sender: row.sender || null,
            locality: groupMeta?.locality || null,
            city: groupMeta?.city || null,
            category: groupMeta?.category || null,
            tags: Array.isArray(groupMeta?.tags) ? groupMeta.tags : [],
            participantsCount: Number(groupMeta?.member_count || 0),
            broadcastEnabled: Boolean(groupMeta?.broadcast_enabled),
            isParsing: groupMeta ? Boolean(groupMeta?.is_parsing) : undefined,
            messageCount: 0,
        };
    }

    private buildSummaryPayload(chats: any[], sessions: SessionRow[], totalMessages: number) {
        const activeSessions = sessions.filter((session) => session.status === 'connected');

        return {
            summary: {
                totalChats: chats.length,
                directChats: chats.filter((chat) => chat.type === 'direct').length,
                groupChats: chats.filter((chat) => chat.type === 'group').length,
                totalMessages,
                connectedSessions: activeSessions.length,
            },
            sessions: sessions.map((session) => ({
                label: session.label,
                ownerName: session.owner_name || null,
                status: session.status,
                phoneNumber: session.session_data?.phoneNumber || null,
                lastSync: session.last_sync || null,
            })),
            chats,
        };
    }

    async getMonitorOverview(workspaceOwnerId: string, inboxOnly = false, sessionLabel?: string | null) {
        const context = await this.buildContext(workspaceOwnerId, sessionLabel);
        const rows = await this.loadMessageRows(workspaceOwnerId, sessionLabel);
        const chatsMap = new Map<string, any>();
        let totalMessages = 0;

        for (const row of rows) {
            if (!this.shouldIncludeRow(row, inboxOnly, sessionLabel, context)) {
                continue;
            }

            totalMessages += 1;
            const remoteJid = String(row.remote_jid || '');
            const chatRecord = chatsMap.get(remoteJid) || this.buildChatRecord(row, context.groupsByJid.get(remoteJid));

            chatRecord.messageCount += 1;
            if (new Date(row.timestamp || 0).getTime() >= new Date(chatRecord.lastMessageAt).getTime()) {
                chatRecord.preview = String(row.text || '').trim();
                chatRecord.lastMessageAt = row.timestamp || new Date().toISOString();
                chatRecord.sender = row.sender || null;
            }

            chatsMap.set(remoteJid, chatRecord);
        }

        for (const group of context.groupsData) {
            if (inboxOnly) continue;

            const jid = String(group.group_jid || '');
            if (!jid || chatsMap.has(jid)) continue;

            chatsMap.set(jid, {
                id: jid,
                remoteJid: jid,
                type: 'group',
                title: group.group_name || 'WhatsApp group',
                preview: 'No messages yet',
                lastMessageAt: group.last_active_at || new Date(0).toISOString(),
                sender: null,
                locality: group.locality || null,
                city: group.city || null,
                category: group.category || null,
                tags: Array.isArray(group.tags) ? group.tags : [],
                participantsCount: Number(group.member_count || 0),
                broadcastEnabled: Boolean(group.broadcast_enabled),
                isParsing: Boolean(group.is_parsing),
                messageCount: 0,
            });
        }

        const chats = Array.from(chatsMap.values()).sort((left, right) => {
            return new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime();
        });

        return this.buildSummaryPayload(chats, context.sessions, totalMessages);
    }

    async getChatMessages(workspaceOwnerId: string, options: ThreadPageOptions) {
        const { inboxOnly = false, sessionLabel, chatId } = options;
        const before = typeof options.before === 'string' && options.before.trim() ? options.before.trim() : null;
        const requestedLimit = Number(options.limit || DEFAULT_THREAD_PAGE_SIZE);
        const limit = Number.isFinite(requestedLimit)
            ? Math.max(1, Math.min(requestedLimit, 500))
            : DEFAULT_THREAD_PAGE_SIZE;

        const context = await this.buildContext(workspaceOwnerId, sessionLabel);
        const targetRow: MessageRow = {
            id: '',
            remote_jid: chatId,
            sender: null,
            text: null,
            timestamp: null,
        };

        if (!this.shouldIncludeRow(targetRow, inboxOnly, sessionLabel, context)) {
            return {
                chatId,
                messages: [],
                pagination: {
                    limit,
                    hasMore: false,
                    nextBefore: null,
                },
            };
        }

        const rows = await this.loadChatMessageRows(workspaceOwnerId, chatId, sessionLabel, before, limit + 1);
        const hasMore = rows.length > limit;
        const pageRows = hasMore ? rows.slice(0, limit) : rows;
        const groupMeta = context.groupsByJid.get(chatId);
        const isGroup = chatId.endsWith('@g.us');
        const title = isGroup ? groupMeta?.group_name || 'WhatsApp group' : null;
        const messages = pageRows
            .slice()
            .reverse()
            .map((row) => ({
                id: row.id,
                chatId,
                remoteJid: chatId,
                type: isGroup ? 'group' : 'direct',
                title: title || buildDirectLabel(row),
                text: String(row.text || '').trim(),
                sender: row.sender || null,
                direction: isOutboundSender(row.sender) ? 'outbound' : 'inbound',
                timestamp: row.timestamp || new Date().toISOString(),
            }));

        return {
            chatId,
            messages,
            pagination: {
                limit,
                hasMore,
                nextBefore: pageRows[pageRows.length - 1]?.timestamp || null,
            },
        };
    }

    async getMonitorData(workspaceOwnerId: string, inboxOnly = false, sessionLabel?: string | null) {
        const overview = await this.getMonitorOverview(workspaceOwnerId, inboxOnly, sessionLabel);
        return {
            ...overview,
            messages: [],
        };
    }
}

export const workspaceMonitorService = new WorkspaceMonitorService();
