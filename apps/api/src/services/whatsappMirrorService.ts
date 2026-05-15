import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin ?? supabase;

type MirrorDirection = 'inbound' | 'outbound';

type PersistMirrorMessageInput = {
    tenantId: string;
    sessionLabel?: string | null;
    remoteJid: string;
    senderJid?: string | null;
    senderName?: string | null;
    text?: string | null;
    timestamp?: string | null;
    direction: MirrorDirection;
    messageKey?: string | null;
    messageType?: string | null;
    isRevoked?: boolean;
    rawPayload?: unknown;
};

type MirrorRow = {
    id: string;
    session_label?: string | null;
    remote_jid: string;
    sender_jid?: string | null;
    sender_name?: string | null;
    text?: string | null;
    timestamp?: string | null;
    direction: MirrorDirection;
    is_revoked?: boolean | null;
};

function normalizeComparablePhone(value?: string | null) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
}

function buildSenderLabel(row: MirrorRow) {
    const senderName = String(row.sender_name || '').trim();
    if (senderName) return senderName;

    const senderPhone = normalizeComparablePhone(row.sender_jid?.split('@')[0] || '');
    if (senderPhone) return `+${senderPhone}`;

    const remotePhone = normalizeComparablePhone(row.remote_jid?.split('@')[0] || '');
    return remotePhone ? `+${remotePhone}` : 'Direct contact';
}

function inferMessageType(rawPayload?: unknown) {
    const message = (rawPayload as { message?: Record<string, unknown> } | undefined)?.message;
    if (!message || typeof message !== 'object') return 'text';
    if ('conversation' in message || 'extendedTextMessage' in message) return 'text';
    if ('imageMessage' in message) return 'image';
    if ('videoMessage' in message) return 'video';
    if ('documentMessage' in message) return 'document';
    if ('audioMessage' in message) return 'audio';
    if ('stickerMessage' in message) return 'sticker';
    return 'unknown';
}

export class WhatsAppMirrorService {
    async persistMessage(input: PersistMirrorMessageInput) {
        const payload = {
            tenant_id: input.tenantId,
            session_label: input.sessionLabel || null,
            message_key: String(input.messageKey || '').trim() || null,
            remote_jid: input.remoteJid,
            chat_type: input.remoteJid.endsWith('@g.us') ? 'group' : 'direct',
            sender_jid: input.senderJid || null,
            sender_name: input.senderName || null,
            text: String(input.text || ''),
            timestamp: input.timestamp || new Date().toISOString(),
            direction: input.direction,
            message_type: input.messageType || inferMessageType(input.rawPayload),
            is_revoked: Boolean(input.isRevoked),
            raw_payload: input.rawPayload ?? null,
            updated_at: new Date().toISOString(),
        };

        const messageKey = payload.message_key;
        if (!messageKey) {
            const { error } = await db.from('whatsapp_message_mirror').insert(payload);
            if (error) throw error;
            return;
        }

        const { error } = await db
            .from('whatsapp_message_mirror')
            .upsert(payload, { onConflict: 'tenant_id,message_key' });

        if (error) throw error;
    }

    async markMessageRevoked(input: { tenantId: string; messageKey: string; remoteJid?: string | null }) {
        let query = db
            .from('whatsapp_message_mirror')
            .update({
                is_revoked: true,
                text: '[This message was deleted]',
                updated_at: new Date().toISOString(),
            })
            .eq('tenant_id', input.tenantId)
            .eq('message_key', input.messageKey);

        if (input.remoteJid) {
            query = query.eq('remote_jid', input.remoteJid);
        }

        const { error } = await query;
        if (error) throw error;
    }

    async getMirrorData(tenantId: string, inboxOnly = false, sessionLabel?: string | null) {
        const [messagesResult, sessionsResult, groupsResult] = await Promise.all([
            (() => {
                let query = db
                    .from('whatsapp_message_mirror')
                    .select('id, session_label, remote_jid, sender_jid, sender_name, text, timestamp, direction, is_revoked')
                    .eq('tenant_id', tenantId)
                    .order('timestamp', { ascending: false })
                    .limit(2000);
                if (sessionLabel) {
                    query = query.eq('session_label', sessionLabel);
                }
                return query;
            })(),
            db
                .from('whatsapp_sessions')
                .select('label, owner_name, status, session_data, last_sync')
                .eq('tenant_id', tenantId)
                .order('last_sync', { ascending: false }),
            db
                .from('whatsapp_groups')
                .select('group_jid, group_name, locality, city, category, tags, member_count, broadcast_enabled, is_parsing, session_label')
                .eq('tenant_id', tenantId)
                .eq('is_archived', false),
        ]);

        if (messagesResult.error) throw messagesResult.error;
        if (sessionsResult.error) throw sessionsResult.error;
        if (groupsResult.error) throw groupsResult.error;

        const groupsByJid = new Map<string, any>((groupsResult.data || []).map((group: any) => [String(group.group_jid || ''), group]));
        const rows = ((messagesResult.data || []) as MirrorRow[]).filter((row) => {
            const isGroup = String(row.remote_jid || '').endsWith('@g.us');
            return !(inboxOnly && isGroup);
        });

        const chatsMap = new Map<string, any>();
        const messages = rows
            .slice()
            .reverse()
            .map((row) => {
                const remoteJid = String(row.remote_jid || '');
                const isGroup = remoteJid.endsWith('@g.us');
                const groupMeta = groupsByJid.get(remoteJid);
                const text = String(row.text || '').trim() || (row.is_revoked ? '[This message was deleted]' : '');
                const timestamp = row.timestamp || new Date().toISOString();
                const title = isGroup
                    ? String(groupMeta?.group_name || row.sender_name || 'WhatsApp group')
                    : buildSenderLabel(row);
                const existing = chatsMap.get(remoteJid) || {
                    id: remoteJid,
                    remoteJid,
                    type: isGroup ? 'group' : 'direct',
                    title,
                    preview: text,
                    lastMessageAt: timestamp,
                    sender: row.sender_name || row.sender_jid || null,
                    locality: groupMeta?.locality || null,
                    city: groupMeta?.city || null,
                    category: groupMeta?.category || null,
                    tags: Array.isArray(groupMeta?.tags) ? groupMeta.tags : [],
                    participantsCount: Number(groupMeta?.member_count || 0),
                    broadcastEnabled: Boolean(groupMeta?.broadcast_enabled),
                    isParsing: groupMeta ? Boolean(groupMeta?.is_parsing) : undefined,
                    messageCount: 0,
                };

                existing.messageCount += 1;
                if (new Date(timestamp).getTime() >= new Date(existing.lastMessageAt).getTime()) {
                    existing.preview = text;
                    existing.lastMessageAt = timestamp;
                    existing.sender = row.sender_name || row.sender_jid || null;
                }

                chatsMap.set(remoteJid, existing);

                return {
                    id: row.id,
                    chatId: remoteJid,
                    remoteJid,
                    type: isGroup ? 'group' : 'direct',
                    title,
                    text,
                    sender: row.sender_name || row.sender_jid || null,
                    direction: row.direction,
                    timestamp,
                };
            });

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

export const whatsappMirrorService = new WhatsAppMirrorService();
