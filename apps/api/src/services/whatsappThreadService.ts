import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin || supabase;
const DEFAULT_SESSION_KEY = 'workspace';

type UpsertThreadMessageInput = {
    tenantId: string;
    sessionLabel?: string | null;
    remoteJid: string;
    sender?: string | null;
    text?: string | null;
    timestamp?: string | null;
};

export type WhatsAppThreadRow = {
    remote_jid: string;
    session_label?: string | null;
    chat_type?: 'direct' | 'group' | string | null;
    title?: string | null;
    preview?: string | null;
    message_count?: number | null;
    inbound_count?: number | null;
    outbound_count?: number | null;
    last_message_at?: string | null;
    last_inbound_at?: string | null;
    last_outbound_at?: string | null;
    last_sender?: string | null;
    phone_number?: string | null;
};

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
    return value === 'ai' || value === 'propai ai' || value.includes('@') || value.includes('broker') || value.includes('workspace');
}

function buildDirectTitle(remoteJid: string, sender?: string | null) {
    const normalizedSender = String(sender || '').trim();
    if (normalizedSender && !isOutboundSender(normalizedSender)) {
        return normalizedSender;
    }

    const phone = getDirectPhoneFromJid(remoteJid);
    return phone ? `+${phone}` : 'Direct contact';
}

function isMissingThreadsTableError(message?: string | null) {
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('whatsapp_threads') && (normalized.includes('does not exist') || normalized.includes('schema cache'));
}

class WhatsAppThreadService {
    async upsertFromMessage(input: UpsertThreadMessageInput) {
        const remoteJid = String(input.remoteJid || '').trim();
        if (!input.tenantId || !remoteJid) {
            return;
        }

        const timestamp = input.timestamp || new Date().toISOString();
        const sessionKey = String(input.sessionLabel || DEFAULT_SESSION_KEY);
        const direct = !remoteJid.endsWith('@g.us');
        const nextPreview = String(input.text || '').trim();
        const nextSender = input.sender || null;
        const nextTitle = direct ? buildDirectTitle(remoteJid, nextSender) : 'WhatsApp group';
        const phoneNumber = direct ? getDirectPhoneFromJid(remoteJid) : null;

        const { data: existing, error: existingError } = await db
            .from('whatsapp_threads')
            .select('message_count, inbound_count, outbound_count, last_message_at, last_inbound_at, last_outbound_at, title')
            .eq('tenant_id', input.tenantId)
            .eq('session_label', sessionKey)
            .eq('remote_jid', remoteJid)
            .maybeSingle();

        if (existingError && !isMissingThreadsTableError(existingError.message)) {
            throw existingError;
        }

        if (existingError && isMissingThreadsTableError(existingError.message)) {
            return;
        }

        const isOutbound = isOutboundSender(nextSender);
        const payload = {
            tenant_id: input.tenantId,
            session_label: sessionKey,
            remote_jid: remoteJid,
            chat_type: direct ? 'direct' : 'group',
            title: String(existing?.title || nextTitle || '').trim() || nextTitle,
            preview: nextPreview || null,
            message_count: Number(existing?.message_count || 0) + 1,
            inbound_count: Number(existing?.inbound_count || 0) + (isOutbound ? 0 : 1),
            outbound_count: Number(existing?.outbound_count || 0) + (isOutbound ? 1 : 0),
            last_message_at: timestamp,
            last_inbound_at: isOutbound ? existing?.last_inbound_at || null : timestamp,
            last_outbound_at: isOutbound ? timestamp : existing?.last_outbound_at || null,
            last_sender: nextSender,
            phone_number: phoneNumber,
            updated_at: new Date().toISOString(),
        };

        const { error } = await db
            .from('whatsapp_threads')
            .upsert(payload, { onConflict: 'tenant_id,session_label,remote_jid' });

        if (error && !isMissingThreadsTableError(error.message)) {
            throw error;
        }
    }

    async listThreads(tenantId: string, sessionLabel?: string | null): Promise<WhatsAppThreadRow[]> {
        let query = db
            .from('whatsapp_threads')
            .select('remote_jid, session_label, chat_type, title, preview, message_count, inbound_count, outbound_count, last_message_at, last_inbound_at, last_outbound_at, last_sender, phone_number')
            .eq('tenant_id', tenantId)
            .order('last_message_at', { ascending: false });

        if (sessionLabel) {
            query = query.eq('session_label', String(sessionLabel || DEFAULT_SESSION_KEY));
        }

        const { data, error } = await query;
        if (error) {
            if (isMissingThreadsTableError(error.message)) {
                return [];
            }
            throw error;
        }

        return (data || []) as WhatsAppThreadRow[];
    }
}

export const whatsappThreadService = new WhatsAppThreadService();
