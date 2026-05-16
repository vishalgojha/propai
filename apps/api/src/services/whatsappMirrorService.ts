import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin || supabase;
const MIRROR_MESSAGE_LIMIT = 500;

type MessageRow = {
    id: string;
    remote_jid: string;
    sender?: string | null;
    text?: string | null;
    timestamp?: string | null;
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

export class WhatsappMirrorService {
    async getMirrorData(workspaceOwnerId: string, inboxOnly = false, sessionLabel?: string | null) {
        const [messagesResult, sessionsResult] = await Promise.all([
            db
                .from('messages')
                .select('id, remote_jid, sender, text, timestamp')
                .eq('tenant_id', workspaceOwnerId)
                .order('timestamp', { ascending: false })
                .limit(MIRROR_MESSAGE_LIMIT),
            db
                .from('whatsapp_sessions')
                .select('label, owner_name, status, session_data, last_sync')
                .eq('tenant_id', workspaceOwnerId)
                .order('last_sync', { ascending: false }),
        ]);

        if (messagesResult.error) throw messagesResult.error;
        if (sessionsResult.error) throw sessionsResult.error;

        let groupsData: any[] = [];
        let groupsQuery = db
            .from('whatsapp_groups')
            .select('group_jid, group_name, locality, city, category, tags, member_count, broadcast_enabled, is_parsing, last_active_at, session_label')
            .eq('tenant_id', workspaceOwnerId)
            .eq('is_archived', false);

        if (sessionLabel) {
            groupsQuery = groupsQuery.eq('session_label', sessionLabel);
        }

        const groupsResult = await groupsQuery;

        if (groupsResult.error) {
            const message = String(groupsResult.error.message || '');
            if (!isMissingSchemaEntityError(message)) {
                throw groupsResult.error;
            }
        } else {
            groupsData = groupsResult.data || [];
        }

        const groupsByJid = new Map<string, any>(
            groupsData.map((group: any) => [group.group_jid, group]),
        );

        const rows = ((messagesResult.data || []) as MessageRow[]).sort((left, right) => {
            return new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime();
        });

        const sessionGroupIds = new Set<string>(
            groupsData.map((group: any) => String(group.group_jid || '')).filter(Boolean),
        );

        const filteredRows = rows.filter((row) => {
            const remoteJid = String(row.remote_jid || '');
            const isGroup = remoteJid.endsWith('@g.us');

            if (inboxOnly && isGroup) {
                return false;
            }

            if (sessionLabel && isGroup) {
                if (sessionGroupIds.size > 0 && !sessionGroupIds.has(remoteJid)) {
                    return false;
                }
            }

            return true;
        });

        const chatsMap = new Map<string, any>();
        const messages = filteredRows
            .slice()
            .reverse()
            .map((row) => {
                const remoteJid = String(row.remote_jid || '');
                const isGroup = remoteJid.endsWith('@g.us');
                const groupMeta = groupsByJid.get(remoteJid);
                const title = isGroup
                    ? groupMeta?.group_name || 'WhatsApp group'
                    : buildDirectLabel(row);
                const messageText = String(row.text || '').trim();
                const timestamp = row.timestamp || new Date().toISOString();
                const direction = isOutboundSender(row.sender) ? 'outbound' : 'inbound';

                const existing = chatsMap.get(remoteJid);
                const chatRecord = existing || {
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

                chatRecord.messageCount += 1;
                if (new Date(timestamp).getTime() >= new Date(chatRecord.lastMessageAt).getTime()) {
                    chatRecord.preview = messageText;
                    chatRecord.lastMessageAt = timestamp;
                    chatRecord.sender = row.sender || null;
                }

                chatsMap.set(remoteJid, chatRecord);

                return {
                    id: row.id,
                    chatId: remoteJid,
                    remoteJid,
                    type: isGroup ? 'group' : 'direct',
                    title,
                    text: messageText,
                    sender: row.sender || null,
                    direction,
                    timestamp,
                };
            });

        for (const group of groupsData) {
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

        const activeSessions = (sessionsResult.data || []).filter((session: any) => session.status === 'connected');

        return {
            summary: {
                totalChats: chats.length,
                directChats: chats.filter((chat) => chat.type === 'direct').length,
                groupChats: chats.filter((chat) => chat.type === 'group').length,
                totalMessages: messages.length,
                connectedSessions: activeSessions.length,
            },
            sessions: (sessionsResult.data || []).map((session: any) => ({
                label: session.label,
                ownerName: session.owner_name || null,
                status: session.status,
                phoneNumber: session.session_data?.phoneNumber || null,
                lastSync: session.last_sync || null,
            })),
            chats,
            messages,
        };
    }
}

export const whatsappMirrorService = new WhatsappMirrorService();
