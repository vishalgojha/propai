import crypto from 'crypto';
import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin ?? supabase;

type MirrorDirection = 'inbound' | 'outbound';
type MirrorChatType = 'group' | 'direct';

type MirrorPayload = {
    tenantId: string;
    sessionLabel?: string | null;
    remoteJid: string;
    text: string;
    direction: MirrorDirection;
    senderJid?: string | null;
    senderName?: string | null;
    messageKey?: string | null;
    messageType?: string | null;
    timestamp?: string | null;
    rawPayload?: unknown;
};

function trimOrNull(value?: string | null) {
    const normalized = String(value || '').trim();
    return normalized || null;
}

function inferChatType(remoteJid: string): MirrorChatType {
    return remoteJid.endsWith('@g.us') ? 'group' : 'direct';
}

function buildFallbackMessageKey(payload: MirrorPayload) {
    const digest = crypto
        .createHash('sha1')
        .update([
            payload.tenantId,
            payload.sessionLabel || '',
            payload.remoteJid,
            payload.direction,
            payload.text,
            payload.timestamp || '',
        ].join('|'))
        .digest('hex');

    return `fallback:${digest}`;
}

class WhatsappMessageMirrorService {
    async append(payload: MirrorPayload) {
        const remoteJid = String(payload.remoteJid || '').trim();
        const text = String(payload.text || '').trim();
        if (!payload.tenantId || !remoteJid) {
            return;
        }

        const timestamp = payload.timestamp || new Date().toISOString();
        const messageKey = trimOrNull(payload.messageKey) || buildFallbackMessageKey({ ...payload, timestamp });

        const { error } = await db
            .from('whatsapp_message_mirror')
            .upsert({
                tenant_id: payload.tenantId,
                session_label: trimOrNull(payload.sessionLabel),
                message_key: messageKey,
                remote_jid: remoteJid,
                chat_type: inferChatType(remoteJid),
                sender_jid: trimOrNull(payload.senderJid),
                sender_name: trimOrNull(payload.senderName),
                text,
                timestamp,
                direction: payload.direction,
                message_type: trimOrNull(payload.messageType) || 'text',
                raw_payload: payload.rawPayload ?? null,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'tenant_id,message_key' });

        if (error) {
            throw error;
        }
    }

    async markRevoked(tenantId: string, messageKey?: string | null) {
        const normalizedKey = trimOrNull(messageKey);
        if (!tenantId || !normalizedKey) {
            return;
        }

        const { error } = await db
            .from('whatsapp_message_mirror')
            .update({
                text: '[This message was deleted]',
                is_revoked: true,
                updated_at: new Date().toISOString(),
            })
            .eq('tenant_id', tenantId)
            .eq('message_key', normalizedKey);

        if (error) {
            throw error;
        }
    }
}

export const whatsappMessageMirrorService = new WhatsappMessageMirrorService();
