import crypto from 'crypto';
import { supabase, supabaseAdmin } from '../config/supabase';
import { processWhatsAppSessionEvent } from '../channel-events/processors/processWhatsAppSessionEvent';
import { whatsappHealthService } from './whatsappHealthService';
import { whatsappThreadService } from './whatsappThreadService';
import { getPhoneOwnership } from './phoneOwnershipService';

const db = supabaseAdmin || supabase;
const SESSION_LABEL = 'Evolution API';

type EvolutionWebhookPayload = {
    event?: string;
    instance?: string;
    data?: Record<string, unknown>;
};

function normalizeDigits(value?: string | null): string {
    return String(value || '').split('').filter((c) => c >= '0' && c <= '9').join('');
}

function toIso(value?: string | number | null): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
        const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
        return new Date(milliseconds).toISOString();
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    }
    return new Date().toISOString();
}

function extractInstanceName(rawInstance?: string): { workspaceOwnerId: string; sessionLabel: string } | null {
    const name = String(rawInstance || '').trim();
    if (!name.startsWith('propai_')) return null;
    const parts = name.split('_');
    if (parts.length < 3) return null;
    const workspaceOwnerId = parts.slice(1, -1).join('_');
    const sessionLabel = parts.slice(-1)[0];
    return { workspaceOwnerId, sessionLabel };
}

function buildRemoteJid(jid?: string): string {
    const cleaned = String(jid || '').trim();
    if (!cleaned) return '';
    if (cleaned.includes('@')) return cleaned;
    const digits = normalizeDigits(cleaned);
    if (!digits) return '';
    return `${digits}@s.whatsapp.net`;
}

async function resolveTenantFromPhone(phone: string): Promise<string | null> {
    const normalized = normalizeDigits(phone);
    if (!normalized) return null;
    const { data: bc } = await supabaseAdmin!
        .from('broker_contacts')
        .select('tenant_id')
        .eq('phone', normalized)
        .maybeSingle();
    if (bc?.tenant_id) return bc.tenant_id;
    return (await getPhoneOwnership(normalized))?.canonicalOwnerId || null;
}

class EvolutionWebhookService {
    validateSignature(rawBody: string, signature: string | null): boolean {
        if (!signature) return false;
        const apiKey = String(process.env.EVOLUTION_API_KEY || '');
        if (!apiKey) return false;
        const expected = crypto
            .createHmac('sha256', apiKey)
            .update(rawBody)
            .digest('hex');
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    }

    async handleWebhook(payload: EvolutionWebhookPayload, rawBody: string): Promise<{ ok: boolean; message: string }> {
        const event = String(payload?.event || '').trim();
        const instance = String(payload?.instance || '').trim();
        const data = payload?.data || {};

        if (!event) {
            return { ok: false, message: 'Missing event type' };
        }

        const instanceInfo = extractInstanceName(instance);
        if (!instanceInfo) {
            return { ok: false, message: `Unknown instance: ${instance}` };
        }

        const { workspaceOwnerId, sessionLabel } = instanceInfo;

        switch (event) {
            case 'MESSAGES_UPSERT':
                await this.handleMessagesUpsert(workspaceOwnerId, sessionLabel, data);
                return { ok: true, message: 'Message processed' };
            case 'CONNECTION_UPDATE':
                await this.handleConnectionUpdate(workspaceOwnerId, sessionLabel, data);
                return { ok: true, message: 'Connection update processed' };
            case 'QRCODE_UPDATED':
                await this.handleQrCodeUpdate(workspaceOwnerId, sessionLabel, data);
                return { ok: true, message: 'QR code updated' };
            default:
                return { ok: true, message: `Event ${event} ignored` };
        }
    }

    private async handleMessagesUpsert(tenantId: string, sessionLabel: string, data: Record<string, unknown>) {
        const key = (data?.key || {}) as Record<string, unknown>;
        const message = (data?.message || {}) as Record<string, unknown>;
        const remoteJid = String(key?.remoteJid || key?.remoteJid || '');
        const fromMe = Boolean(key?.fromMe);
        const messageId = String(key?.id || crypto.randomUUID());
        const messageTimestamp = (data?.messageTimestamp ?? data?.timestamp ?? null) as string | number | null;
        const pushName = String(data?.pushName || '').trim();

        if (fromMe) return;

        const msg = message as Record<string, unknown>;
        const extTextMsg = (msg?.extendedTextMessage || {}) as Record<string, unknown>;
        const imgMsg = (msg?.imageMessage || {}) as Record<string, unknown>;
        const vidMsg = (msg?.videoMessage || {}) as Record<string, unknown>;
        const text = String(
            msg?.conversation
            || extTextMsg?.text
            || imgMsg?.caption
            || vidMsg?.caption
            || '',
        ).trim();

        if (!text && !remoteJid) return;

        const timestamp = toIso(messageTimestamp);
        const remoteJidFull = buildRemoteJid(remoteJid);
        if (!remoteJidFull) return;

        const senderName = pushName || remoteJid;
        const dataTenantId = await resolveTenantFromPhone(remoteJid) || tenantId;

        const groupJid = remoteJid.includes('@g.us') ? remoteJid : null;
        const senderJid = remoteJid.includes('@s.whatsapp.net') ? remoteJid : null;

        try {
            await db.from('evolution_raw_messages').insert({
                tenant_id: dataTenantId,
                session_label: sessionLabel,
                remote_jid: remoteJidFull,
                sender: senderName,
                text_content: text,
                raw_payload: data,
                message_id: messageId,
                source_group_jid: groupJid,
                sender_jid: senderJid,
                is_parsed: false,
            });
        } catch (error) {
            console.warn('[EvolutionWebhookService] Failed to persist raw message', error);
        }

        await whatsappHealthService.recordMessageMetrics({
            tenantId: dataTenantId,
            sessionLabel,
            remoteJid: remoteJidFull,
            parsed: false,
            failed: false,
            countReceived: true,
            timestamp,
        }).catch(() => undefined);
    }

    private async handleConnectionUpdate(tenantId: string, sessionLabel: string, data: Record<string, unknown>) {
        const state = String(data?.state || '').toLowerCase();
        let status: 'connected' | 'connecting' | 'disconnected';
        if (state === 'open') {
            status = 'connected';
        } else if (state === 'connecting' || state === 'syncing') {
            status = 'connecting';
        } else {
            status = 'disconnected';
        }

        await processWhatsAppSessionEvent({
            tenantId,
            sessionLabel,
            phoneNumber: String(data?.phone || data?.number || ''),
            ownerName: String(data?.name || data?.pushName || ''),
            status,
        });
    }

    private async handleQrCodeUpdate(tenantId: string, sessionLabel: string, data: Record<string, unknown>) {
        const qrBase64 = String(data?.base64 || data?.qrcode || data?.qr || '').trim();
        if (!qrBase64) return;

        const sessionId = `${tenantId}:${sessionLabel}`;
        const { data: existing } = await db
            .from('whatsapp_sessions')
            .select('session_data')
            .eq('session_id', sessionId)
            .maybeSingle();

        const sessionData = (existing?.session_data || {}) as Record<string, unknown>;
        sessionData.connectionArtifact = {
            mode: 'qr',
            format: 'text',
            value: qrBase64,
        };
        sessionData.connectionArtifactUpdatedAt = new Date().toISOString();
        sessionData.qr = qrBase64;
        sessionData.qrUpdatedAt = new Date().toISOString();
        sessionData.status = 'connecting';

        await db.from('whatsapp_sessions').upsert({
            session_id: sessionId,
            tenant_id: tenantId,
            label: sessionLabel,
            status: 'connecting',
            session_data: sessionData,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'session_id' });
    }
}

export const evolutionWebhookService = new EvolutionWebhookService();
