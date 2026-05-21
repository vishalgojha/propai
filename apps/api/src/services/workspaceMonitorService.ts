import { supabase, supabaseAdmin } from '../config/supabase';
import { liveMonitorService } from './liveMonitorService';
import { whatsappPresenceService } from './whatsappPresenceService';

const db = supabaseAdmin || supabase;
const DEFAULT_THREAD_PAGE_SIZE = 100;

type MessageRow = {
    id: string;
    remote_jid: string;
    sender?: string | null;
    text?: string | null;
    timestamp?: string | null;
    title?: string | null;
    participantsCount?: number | null;
};

type MonitorRow = MessageRow & {
    direction?: 'inbound' | 'outbound' | null;
};

type ThreadSnippet = {
    text?: string | null;
    sender?: string | null;
    direction?: 'inbound' | 'outbound' | null;
    timestamp?: string | null;
};

type ChatRecord = {
    id: string;
    remoteJid: string;
    type: 'group' | 'direct';
    title: string;
    preview: string;
    lastMessageAt: string;
    sender: string | null;
    locality: string | null;
    city: string | null;
    category: string | null;
    tags: string[];
    participantsCount: number;
    broadcastEnabled: boolean;
    isParsing?: boolean;
    messageCount: number;
    recentMessages: ThreadSnippet[];
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
    classification?: string | null;
    visibility_status?: string | null;
    business_confidence?: number | null;
    last_active_at?: string | null;
    session_label?: string | null;
};

type SessionRow = {
    label: string;
    owner_name?: string | null;
    status: string;
    session_data?: { phoneNumber?: string | null; chatTitles?: Record<string, string | null> | null } | null;
    last_sync?: string | null;
};

type MonitorQueryContext = {
    groupsData: GroupRow[];
    groupsByJid: Map<string, GroupRow>;
    sessionGroupIds: Set<string>;
    directTitlesByJid: Map<string, string>;
    sessions: SessionRow[];
};

type ThreadPageOptions = {
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

function getDirectPhoneFromJid(value?: string | null) {
    const jid = String(value || '').trim().toLowerCase();
    if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@c.us') && !jid.endsWith('@lid')) {
        return null;
    }

    const localPart = jid.split('@')[0] || '';
    const deviceSeparatorIndex = localPart.indexOf(':');
    const phoneCandidate = deviceSeparatorIndex >= 0 ? localPart.slice(0, deviceSeparatorIndex) : localPart;
    return normalizePhone(phoneCandidate);
}

function isOutboundSender(sender?: string | null) {
    const value = String(sender || '').trim().toLowerCase();
    return value === 'ai' || value === 'propai ai' || value.includes('@');
}

function buildDirectLabel(row: MessageRow) {
    if (row.sender && !isOutboundSender(row.sender)) {
        return row.sender;
    }

    const phone = getDirectPhoneFromJid(row.remote_jid);
    return phone ? `+${phone}` : 'Direct contact';
}

export class WorkspaceMonitorService {
    private async loadMessageRows(workspaceOwnerId: string, sessionLabel?: string | null): Promise<MonitorRow[]> {
        const liveRows = liveMonitorService.getSessionRows(workspaceOwnerId, sessionLabel);
        if (liveRows.length > 0) {
            return liveRows as MonitorRow[];
        }

        const messagesResult = await db
            .from('messages')
            .select('id, remote_jid, sender, text, timestamp')
            .eq('tenant_id', workspaceOwnerId)
            .order('timestamp', { ascending: false });

        if (messagesResult.error) {
            throw messagesResult.error;
        }

        return (messagesResult.data || []) as MonitorRow[];
    }

    private async loadChatMessageRows(
        workspaceOwnerId: string,
        chatId: string,
        sessionLabel?: string | null,
        before?: string | null,
        limit?: number,
    ): Promise<MonitorRow[]> {
        const liveRows = liveMonitorService.getChatRows(workspaceOwnerId, chatId, sessionLabel, before, limit);
        if (liveRows.length > 0) {
            return liveRows as unknown as MonitorRow[];
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

        return (messagesResult.data || []) as MonitorRow[];
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
                    .select('group_jid, group_name, locality, city, category, tags, member_count, broadcast_enabled, is_parsing, classification, visibility_status, business_confidence, last_active_at, session_label')
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
            directTitlesByJid: new Map<string, string>(
                ((sessionsResult.data || []) as SessionRow[])
                    .flatMap((session) => {
                        const chatTitles = session.session_data?.chatTitles;
                        if (!chatTitles || typeof chatTitles !== 'object') return [];
                        return Object.entries(chatTitles)
                            .map(([jid, title]) => [String(jid || '').trim(), String(title || '').trim()] as const)
                            .filter(([jid, title]) => Boolean(jid) && Boolean(title));
                    }),
            ),
            sessions: (sessionsResult.data || []) as SessionRow[],
        };
    }

    private shouldIncludeRow(
        row: MessageRow,
        sessionLabel: string | null | undefined,
        context: MonitorQueryContext,
    ) {
        const remoteJid = String(row.remote_jid || '');
        const isGroup = remoteJid.endsWith('@g.us');

        if (sessionLabel && isGroup && context.sessionGroupIds.size > 0 && !context.sessionGroupIds.has(remoteJid)) {
            return false;
        }

        return true;
    }

    private buildChatRecord(
        row: MessageRow,
        groupMeta?: GroupRow,
        liveMeta?: { title?: string; participantsCount?: number } | null,
    ): ChatRecord {
        const remoteJid = String(row.remote_jid || '');
        const isGroup = remoteJid.endsWith('@g.us');
        const title = isGroup
            ? String(groupMeta?.group_name || liveMeta?.title || row.title || 'WhatsApp group')
            : String(row.title || liveMeta?.title || buildDirectLabel(row));
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
            participantsCount: Number(groupMeta?.member_count || liveMeta?.participantsCount || row.participantsCount || 0),
            broadcastEnabled: Boolean(groupMeta?.broadcast_enabled),
            isParsing: groupMeta ? Boolean(groupMeta?.is_parsing) : undefined,
            messageCount: 0,
            recentMessages: [] as ThreadSnippet[],
        };
    }

    private buildSummaryPayload(chats: Array<Record<string, unknown>>, sessions: SessionRow[], totalMessages: number) {
        const activeSessions = sessions.filter((session) => session.status === 'connected');
        const sanitizedChats = chats.map(({ recentMessages, ...chat }) => chat);

        return {
            summary: {
                totalChats: sanitizedChats.length,
                directChats: sanitizedChats.filter((chat) => chat.type === 'direct').length,
                groupChats: sanitizedChats.filter((chat) => chat.type === 'group').length,
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
            chats: sanitizedChats,
        };
    }

    async getMonitorOverview(workspaceOwnerId: string, sessionLabel?: string | null) {
        const context = await this.buildContext(workspaceOwnerId, sessionLabel);
        const rows = await this.loadMessageRows(workspaceOwnerId, sessionLabel);
        const chatsMap = new Map<string, ChatRecord>();
        let totalMessages = 0;

        for (const row of rows) {
            if (!this.shouldIncludeRow(row, sessionLabel, context)) {
                continue;
            }

            totalMessages += 1;
            const remoteJid = String(row.remote_jid || '');
            const liveMeta = liveMonitorService.getChatMeta(workspaceOwnerId, remoteJid, sessionLabel);
            const groupMeta = context.groupsByJid.get(remoteJid);
            if (!remoteJid.endsWith('@g.us') && !liveMeta?.title) {
                const directTitle = context.directTitlesByJid.get(remoteJid);
                if (directTitle) {
                    row.title = directTitle;
                }
            }
            const chatRecord = chatsMap.get(remoteJid) || this.buildChatRecord(row, groupMeta, liveMeta);

            chatRecord.messageCount += 1;
            if (chatRecord.recentMessages.length < 6) {
                chatRecord.recentMessages.push({
                    text: String(row.text || '').trim(),
                    sender: row.sender || null,
                    direction: isOutboundSender(row.sender) ? 'outbound' : 'inbound',
                    timestamp: row.timestamp || new Date().toISOString(),
                });
            }
            if (remoteJid.endsWith('@g.us')) {
                chatRecord.title = String(groupMeta?.group_name || liveMeta?.title || row.title || chatRecord.title || 'WhatsApp group');
            }
            if (!chatRecord.participantsCount) {
                chatRecord.participantsCount = Number(groupMeta?.member_count || liveMeta?.participantsCount || row.participantsCount || 0);
            }
            if (new Date(row.timestamp || 0).getTime() >= new Date(chatRecord.lastMessageAt).getTime()) {
                chatRecord.preview = String(row.text || '').trim();
                chatRecord.lastMessageAt = row.timestamp || new Date().toISOString();
                chatRecord.sender = row.sender || null;
            }

            chatsMap.set(remoteJid, chatRecord);
        }

        const chats = Array.from(chatsMap.values()).sort((left, right) => {
            return new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime();
        });

        return this.buildSummaryPayload(chats, context.sessions, totalMessages);
    }

    async getChatMessages(workspaceOwnerId: string, options: ThreadPageOptions) {
        const { sessionLabel, chatId } = options;
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

        if (!this.shouldIncludeRow(targetRow, sessionLabel, context)) {
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
        const liveMeta = liveMonitorService.getChatMeta(workspaceOwnerId, chatId, sessionLabel);
        const directTitle = !isGroup ? context.directTitlesByJid.get(chatId) || null : null;
        const title = isGroup ? groupMeta?.group_name || liveMeta?.title || 'WhatsApp group' : null;
        const messages = pageRows
            .slice()
            .reverse()
            .map((row) => ({
                id: row.id,
                chatId,
                remoteJid: chatId,
                type: isGroup ? 'group' : 'direct',
                title: title || String(directTitle || row.title || liveMeta?.title || buildDirectLabel(row)),
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

    async getMonitorData(workspaceOwnerId: string, sessionLabel?: string | null) {
        const [overview, presence] = await Promise.all([
            this.getMonitorOverview(workspaceOwnerId, sessionLabel),
            whatsappPresenceService.getPresenceStatus(workspaceOwnerId, sessionLabel).catch(() => ({
                summary: {
                    recentEvents: 0,
                    sessionsTracked: 0,
                    connectedSessions: 0,
                    qrRequiredSessions: 0,
                    disconnectedSessions: 0,
                    stalledSessions: 0,
                },
                sessions: [],
                recentEvents: [],
            })),
        ]);
        return {
            ...overview,
            presence,
            messages: [],
        };
    }
}

export const workspaceMonitorService = new WorkspaceMonitorService();
