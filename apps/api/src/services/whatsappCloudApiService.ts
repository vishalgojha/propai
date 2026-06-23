import crypto from 'crypto';
import { spawn } from 'child_process';
import { keyService } from './keyService';
import { whatsappHealthService } from './whatsappHealthService';
import { whatsappThreadService } from './whatsappThreadService';
import { channelService } from './channelService';
import { agentExecutor } from './AgentExecutor';
import { supabase, supabaseAdmin } from '../config/supabase';
import { isOwnerSuperAdminPhone } from '../utils/controllerHelpers';
import { activationCodeService } from './activationCodeService';
import { getPhoneOwnership } from './phoneOwnershipService';
import { env as transformersEnv, pipeline } from '@xenova/transformers';

const db = supabaseAdmin || supabase;
const SESSION_LABEL = 'Official API';
const CLOUD_PROVIDER = 'WhatsAppCloud';

type OfficialApiSessionData = {
    provider?: string;
    mode?: string;
    enabled?: boolean;
    phoneNumberId?: string | null;
    phoneNumber?: string | null;
    businessAccountId?: string | null;
    displayPhoneNumber?: string | null;
    apiVersion?: string | null;
    webhookVerifyTokenSet?: boolean;
    lastInboundAt?: string | null;
    lastOutboundAt?: string | null;
    lastWebhookAt?: string | null;
    pendingConnect?: null;
    connectionArtifact?: null;
    connectionArtifactUpdatedAt?: null;
};

type OfficialApiConfigInput = {
    tenantId: string;
    enabled: boolean;
    phoneNumberId: string;
    businessAccountId?: string | null;
    displayPhoneNumber?: string | null;
    apiVersion?: string | null;
    verifyToken?: string | null;
    accessToken?: string | null;
};

type OfficialApiConfigRow = {
    session_id: string;
    tenant_id: string;
    label: string;
    phone_number?: string | null;
    owner_name?: string | null;
    status: string;
    session_data?: OfficialApiSessionData | null;
    updated_at?: string | null;
    last_sync?: string | null;
};

type WabaCredentialRow = {
    id: string | null;
    tenant_id: string;
    phone_number_id: string;
    phone_number: string;
    business_account_id?: string | null;
    business_account_name?: string | null;
};

type WebhookQueueRow = {
    id: string;
    tenant_id: string;
    waba_credential_id: string | null;
    meta_message_id: string | null;
    meta_contact_wa_id: string | null;
    from_name: string | null;
    message_type: string | null;
    message_body: string | null;
    media_url: string | null;
    media_mime_type: string | null;
    media_sha256: string | null;
    timestamp: string;
    raw_payload: Record<string, any>;
    processed: boolean;
    processing_error: string | null;
    created_at: string;
};

type MetaWebhookPayload = {
    entry?: Array<{
        changes?: Array<{
            value?: {
                metadata?: {
                    phone_number_id?: string;
                    display_phone_number?: string;
                };
                contacts?: Array<{
                    wa_id?: string;
                    profile?: { name?: string };
                }>;
                messages?: Array<Record<string, any>>;
                statuses?: Array<Record<string, any>>;
            };
        }>;
    }>;
};

function normalizeDigits(value?: string | null) {
    return String(value || '').split('').filter((c) => c >= '0' && c <= '9').join('');
}

function toIso(value?: string | number | null) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
        return new Date(milliseconds).toISOString();
    }

    if (typeof value === 'string' && value.trim()) {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) {
            return new Date(parsed).toISOString();
        }
    }

    return new Date().toISOString();
}

function getWebhookVerifyToken() {
    return String(process.env.WHATSAPP_CLOUD_VERIFY_TOKEN || process.env.WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN || '').trim();
}

function getApiVersion() {
    return String(process.env.WHATSAPP_CLOUD_API_VERSION || 'v25.0').trim();
}

function getCloudBaseUrl() {
    return `https://graph.facebook.com/${getApiVersion()}`;
}

function extractText(message: Record<string, any>) {
    return String(
        message?.text?.body
        || message?.text?.content
        || message?.interactive?.button_reply?.title
        || message?.interactive?.list_reply?.title
        || message?.button?.text
        || message?.image?.caption
        || message?.video?.caption
        || message?.document?.caption
        || message?.body
        || '',
    ).trim();
}

type MediaInfo = {
    mediaId: string;
    mimeType: string;
    fileName: string;
    kind: string;
};

const WABA_MEDIA_MSG_TYPES = new Set(['image', 'video', 'document', 'audio', 'sticker']);

function getMediaInfo(message: Record<string, any>): MediaInfo | null {
    const msgType = String(message?.type || '').toLowerCase();
    if (!WABA_MEDIA_MSG_TYPES.has(msgType)) return null;
    const media = message?.[msgType];
    if (!media?.id) return null;
    return {
        mediaId: String(media.id),
        mimeType: String(media.mime_type || 'application/octet-stream'),
        fileName: String(media.filename || `waba_media_${Date.now()}`),
        kind: msgType,
    };
}

const WABA_MEDIA_EXT: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/3gp': '.3gp',
    'application/pdf': '.pdf',
};

const WABA_AUDIO_TRANSCRIPTION_MODEL = String(process.env.WABA_AUDIO_TRANSCRIPTION_MODEL || 'Xenova/whisper-small').trim();
const WABA_AUDIO_TRANSCRIPTION_LANGUAGE = String(process.env.WABA_AUDIO_TRANSCRIPTION_LANGUAGE || '').trim() || null;
const WABA_AUDIO_TRANSCRIPTION_ENABLED = String(process.env.WABA_AUDIO_TRANSCRIPTION_ENABLED || 'true').toLowerCase() !== 'false';
const WABA_AUDIO_TRANSCRIPTION_TIMEOUT_MS = Number(process.env.WABA_AUDIO_TRANSCRIPTION_TIMEOUT_MS || 45_000);

function buildRemoteJid(waId?: string | null) {
    const digits = normalizeDigits(waId);
    return digits ? `${digits}@s.whatsapp.net` : '';
}

function shouldIngestPropertySubmission(text: string) {
    const normalized = String(text || '').trim();
    if (!normalized) return false;

    // Search and chat messages use the agent and existing Stream data. They are not
    // source material for a new listing/requirement record.
    if (/^(?:search|find|show|match|check|what|where|when|why|how|hi|hello|hey|thanks?)\b/i.test(normalized)) {
        return false;
    }

    return /\b(?:for\s+(?:sale|rent|lease)|available|listing|requirement|client\s+(?:needs|looking)|buyer\s+(?:needs|looking)|owner|possession|carpet\s*(?:area)?|built\s*up|sq\.?\s*ft|\d(?:\.5)?\s*bhk\s*(?:[-|,/]?\s*)?(?:@|rs\.?|₹|inr|\d+\s*(?:cr|crore|lac|lakh)))\b/i.test(normalized);
}

export class WhatsAppCloudApiService {
    private readonly providerName = CLOUD_PROVIDER;
    private audioTranscriberPromise: Promise<any> | null = null;

    async getConfig(tenantId: string) {
        const { data, error } = await db
            .from('whatsapp_sessions')
            .select('session_id, tenant_id, label, owner_name, status, session_data, updated_at, last_sync')
            .eq('tenant_id', tenantId)
            .eq('label', SESSION_LABEL)
            .maybeSingle();

        if (error) {
            throw error;
        }

        const row = data as OfficialApiConfigRow | null;
        const sessionData = (row?.session_data && typeof row.session_data === 'object') ? row.session_data : {};
        const hasAccessToken = Boolean(await keyService.getKey(tenantId, this.providerName).catch(() => null));
        const phoneNumberId = String(
            sessionData.phoneNumberId ||
            (sessionData as any).phone_number_id ||
            '',
        ).trim();
        const businessAccountId = String(
            sessionData.businessAccountId ||
            (sessionData as any).business_account_id ||
            '',
        ).trim();
        const displayPhoneNumber = String(
            sessionData.displayPhoneNumber ||
            (sessionData as any).display_phone_number ||
            '',
        ).trim();
        const isCloudConfig = Boolean(
            phoneNumberId ||
            sessionData.provider === 'cloud_api' ||
            sessionData.mode === 'official_api',
        );

        return {
            configured: Boolean(isCloudConfig && phoneNumberId),
            enabled: Boolean(isCloudConfig && phoneNumberId && (sessionData.enabled || row?.status === 'connected')),
            phoneNumberId,
            businessAccountId,
            displayPhoneNumber,
            apiVersion: String(sessionData.apiVersion || getApiVersion()),
            verifyTokenSet: Boolean(sessionData.webhookVerifyTokenSet),
            hasAccessToken,
            webhookUrl: '/api/whatsapp/cloud/webhook',
            row: row
                ? {
                    sessionId: row.session_id,
                    label: row.label,
                    status: row.status,
                    lastSync: row.last_sync || row.updated_at || null,
                }
                : null,
        };
    }

    async saveConfig(input: OfficialApiConfigInput) {
        const now = new Date().toISOString();
        const sessionData: OfficialApiSessionData = {
            provider: 'cloud_api',
            mode: 'official_api',
            enabled: input.enabled,
            phoneNumberId: input.phoneNumberId,
            businessAccountId: input.businessAccountId || null,
            displayPhoneNumber: input.displayPhoneNumber || null,
            apiVersion: input.apiVersion || getApiVersion(),
            webhookVerifyTokenSet: Boolean(input.verifyToken),
            lastInboundAt: null,
            lastOutboundAt: null,
            lastWebhookAt: null,
            pendingConnect: null,
            connectionArtifact: null,
            connectionArtifactUpdatedAt: null,
        };

        const existingAccessToken = input.accessToken
            ? null
            : await keyService.getKey(input.tenantId, this.providerName).catch(() => null);

        if (input.enabled && !input.accessToken && !existingAccessToken) {
            throw new Error('Meta WhatsApp Cloud access token is required before enabling official API config');
        }

        if (input.accessToken) {
            const tokenResult = await keyService.saveKey(input.tenantId, this.providerName, input.accessToken);
            if (!tokenResult.success) {
                throw new Error(tokenResult.error || 'Failed to save WhatsApp Cloud access token');
            }
        }

        const { error } = await db
            .from('whatsapp_sessions')
            .upsert({
                session_id: `${input.tenantId}:${SESSION_LABEL}`,
                tenant_id: input.tenantId,
                label: SESSION_LABEL,
                owner_name: input.displayPhoneNumber || 'Official WhatsApp',
                status: input.enabled ? 'connected' : 'disconnected',
                last_sync: now,
                session_data: sessionData,
                updated_at: now,
            }, { onConflict: 'session_id' });

        if (error) {
            throw error;
        }

        await whatsappHealthService.upsertConnectionSnapshot({
            tenantId: input.tenantId,
            sessionLabel: SESSION_LABEL,
            phoneNumber: input.displayPhoneNumber || null,
            ownerName: 'Official WhatsApp',
            status: input.enabled ? 'connected' : 'disconnected',
        });

        return this.getConfig(input.tenantId);
    }

    async verifyWebhookToken(verifyToken?: string | null) {
        const expected = getWebhookVerifyToken();
        if (!expected) {
            return {
                ok: false,
                status: 503,
                error: 'WHATSAPP_CLOUD_VERIFY_TOKEN is not configured',
            };
        }

        if (String(verifyToken || '').trim() !== expected) {
            return {
                ok: false,
                status: 403,
                error: 'Verification token mismatch',
            };
        }

        return { ok: true, status: 200 };
    }

    async findConfigByPhoneNumberId(phoneNumberId?: string | null, displayPhoneNumber?: string | null) {
        const target = String(phoneNumberId || '').trim();
        const displayTarget = normalizeDigits(displayPhoneNumber || '');
        if (!target && !displayTarget) {
            return null;
        }

        const { data, error } = await db
            .from('whatsapp_sessions')
            .select('session_id, tenant_id, label, owner_name, status, session_data, updated_at, last_sync')
            .eq('label', SESSION_LABEL)
            .not('tenant_id', 'is', null);

        if (error) {
            throw error;
        }

        const rows = Array.isArray(data) ? data as OfficialApiConfigRow[] : [];
        const match = rows.find((row) => {
            const sessionData = (row.session_data && typeof row.session_data === 'object') ? row.session_data : {};
            const rowPhoneNumberId = String(sessionData.phoneNumberId || '').trim();
            const rowDisplayPhone = normalizeDigits(
                String(sessionData.displayPhoneNumber || sessionData.phoneNumber || row.owner_name || '').trim(),
            );
            return (target && rowPhoneNumberId === target) || (displayTarget && rowDisplayPhone === displayTarget);
        });

        return match || null;
    }

    private sessionConfigToCredential(row: OfficialApiConfigRow | null): WabaCredentialRow | null {
        if (!row?.tenant_id) return null;

        const sessionData = (row.session_data && typeof row.session_data === 'object') ? row.session_data : {};
        const phoneNumberId = String(
            sessionData.phoneNumberId ||
            (sessionData as any).phone_number_id ||
            '',
        ).trim();
        if (!phoneNumberId) return null;

        const phoneNumber = String(
            sessionData.displayPhoneNumber ||
            (sessionData as any).display_phone_number ||
            sessionData.phoneNumber ||
            (sessionData as any).phone_number ||
            row.owner_name ||
            '',
        ).trim();

        return {
            id: null,
            tenant_id: row.tenant_id,
            phone_number_id: phoneNumberId,
            phone_number: phoneNumber,
            business_account_id: String(
                sessionData.businessAccountId ||
                (sessionData as any).business_account_id ||
                '',
            ).trim() || null,
            business_account_name: row.owner_name || 'Official WhatsApp',
        };
    }

    async handleWebhook(payload: MetaWebhookPayload) {
        if (process.env.CLOUD_API_WEBHOOK_ENABLED === 'false') {
            return [];
        }
        const entries = Array.isArray(payload?.entry) ? payload.entry : [];
        const results: Array<{ tenantId: string; queued: number; ignored: number }> = [];

        for (const entry of entries) {
            const changes = Array.isArray(entry?.changes) ? entry.changes : [];
            for (const change of changes) {
                const value = change?.value || {};
                const phoneNumberId = String(value?.metadata?.phone_number_id || '').trim();
                const displayPhoneNumber = String(value?.metadata?.display_phone_number || '').trim();
                const credential = await this.findCredentialByPhoneNumberId(phoneNumberId, displayPhoneNumber).catch(() => null);
                if (!credential?.tenant_id || !credential?.phone_number_id) {
                    continue;
                }

                const adminTenantId = String(credential.tenant_id);
                const messages = Array.isArray(value.messages) ? value.messages : [];
                let queued = 0;
                let ignored = 0;

                for (const message of messages) {
                    const messageId = String(message?.id || crypto.randomUUID()).trim();

                    const claimed = await this.claimWebhookMessage({
                        tenantId: adminTenantId,
                        wabaCredentialId: credential.id || null,
                        messageId,
                        from: String(message?.from || ''),
                        senderName: String(value?.contacts?.[0]?.profile?.name || ''),
                        messageType: String(message?.type || 'unknown'),
                        text: extractText(message),
                        timestamp: toIso(message?.timestamp || message?.message_timestamp || null),
                        rawPayload: message,
                    });
                    if (!claimed) {
                        ignored += 1;
                        continue;
                    }
                    queued += 1;
                }

                await whatsappHealthService.upsertConnectionSnapshot({
                    tenantId: adminTenantId,
                    sessionLabel: SESSION_LABEL,
                    phoneNumber: credential.phone_number || displayPhoneNumber || null,
                    ownerName: credential.business_account_name || 'Official WhatsApp',
                    status: 'connected',
                }).catch(() => undefined);

                results.push({ tenantId: adminTenantId, queued, ignored });
            }
        }

        return results;
    }

    async processQueuedWebhookEvents(limit = 10) {
        if (process.env.CLOUD_API_WEBHOOK_ENABLED === 'false') {
            return { processed: 0, replied: 0, ignored: 0 };
        }

        const { data, error } = await db.rpc('claim_webhook_events', { batch_size: limit });

        if (error) {
            console.error('[WhatsAppCloudApiService] claim_webhook_events RPC failed', error);
            return { processed: 0, replied: 0, ignored: 0 };
        }

        const rows = Array.isArray(data) ? data as WebhookQueueRow[] : [];
        let processed = 0;
        let replied = 0;
        let ignored = 0;

        for (const row of rows) {
            try {
                const result = await this.processQueuedWebhookEvent(row);
                processed += 1;
                replied += result.replied ? 1 : 0;
                ignored += result.ignored ? 1 : 0;
            } catch (err) {
                console.error('[WhatsAppCloudApiService] Failed to process queued webhook event', {
                    messageId: row.meta_message_id,
                    error: err,
                });
            }
        }

        return { processed, replied, ignored };
    }

    private async processQueuedWebhookEvent(row: WebhookQueueRow) {
        const credential = row.waba_credential_id
            ? await this.getWabaCredentialById(row.waba_credential_id).catch(() => null)
            : await this.findCredentialByTenantId(row.tenant_id).catch(() => null);
        if (!credential?.tenant_id || !credential?.phone_number_id) {
            await this.markWebhookMessageFailed(row.tenant_id, row.meta_message_id || row.id, new Error('Missing WABA credential reference'));
            return { replied: false, ignored: true };
        }

        const tenantId = credential.tenant_id;
        const phoneNumberId = credential.phone_number_id;
        const sessionLabel = SESSION_LABEL;
        const rawMessage = (row.raw_payload || {}) as Record<string, any>;
        const remoteJid = buildRemoteJid(row.meta_contact_wa_id || rawMessage?.from || null);
        if (!remoteJid) {
            await this.markWebhookMessageFailed(tenantId, row.meta_message_id || row.id, new Error('Missing sender phone'));
            return { replied: false, ignored: true };
        }

        let text = String(row.message_body || extractText(rawMessage) || '').trim();
        const mediaInfo = getMediaInfo(rawMessage);
        let storedMedia: { fileId: string; attachmentCtx: string; transcript?: string | null } | null = null;
        if (mediaInfo) {
            const stored = await this.storeIncomingMedia(tenantId, mediaInfo).catch(() => null);
            storedMedia = stored;
            if (mediaInfo.kind === 'audio' && stored?.transcript) {
                text = text.trim() ? `${stored.transcript}\n\n${text}` : stored.transcript;
            } else if (stored?.attachmentCtx) {
                text = `${text}\n\n---\n${stored.attachmentCtx}\n---`;
            }
            if (!text.trim()) {
                const typeLabel = String(rawMessage?.type || 'file').toLowerCase();
                text = mediaInfo.kind === 'audio'
                    ? '[User sent a voice note]'
                    : `[User sent ${typeLabel === 'image' ? 'an image' : typeLabel === 'video' ? 'a video' : typeLabel === 'document' ? 'a document' : 'a file'}]`;
            }
        }
        if (!text.trim()) {
            await this.markWebhookMessageProcessed(tenantId, row.meta_message_id || row.id);
            return { replied: false, ignored: true };
        }

        const messageId = row.meta_message_id || row.id;
        const timestamp = row.timestamp || toIso(rawMessage?.timestamp || rawMessage?.message_timestamp || null);
        const senderName = String(row.from_name || row.meta_contact_wa_id || remoteJid || 'Client').trim();
        const dataTenantId = await this.resolveTenantFromPhone(remoteJid) || tenantId;

        const { error: inboundInsertError } = await db.from('messages').insert({
            tenant_id: dataTenantId,
            session_label: sessionLabel,
            remote_jid: remoteJid,
            sender: senderName,
            text,
            timestamp,
        });
        if (inboundInsertError) {
            console.warn('[WhatsAppCloudApiService] Failed to persist inbound message', inboundInsertError);
        }

        await whatsappThreadService.upsertFromMessage({
            tenantId: dataTenantId,
            sessionLabel,
            remoteJid,
            sender: senderName,
            text,
            timestamp,
        }).catch((error) => {
            console.warn('[WhatsAppCloudApiService] Failed to update thread row', error);
        });

        await whatsappHealthService.recordMessageMetrics({
            tenantId: dataTenantId,
            sessionLabel,
            remoteJid,
            parsed: false,
            failed: false,
            countReceived: true,
            timestamp,
        }).catch(() => undefined);

        await whatsappHealthService.appendEvent(
            dataTenantId,
            sessionLabel,
            'cloud_inbound_message',
            'Inbound WhatsApp Cloud API message received.',
            {
                phoneNumberId,
                remoteJid,
                messageId,
                displayPhoneNumber: credential.phone_number || null,
            },
        ).catch(() => undefined);

        if (activationCodeService.isActivationCode(text)) {
            const code = text.trim().toUpperCase();
            const codeRow = await activationCodeService.validateCode(code);
            if (codeRow) {
                await activationCodeService.activateCode(code, normalizeDigits(remoteJid));
                if (codeRow.context_type !== 'broker_login') {
                    await activationCodeService.linkBrokerPhone(codeRow.tenant_id, normalizeDigits(remoteJid));
                } else {
                    const { data: profile } = await db
                        .from('profiles')
                        .select('full_name')
                        .eq('id', codeRow.context_id || codeRow.tenant_id)
                        .maybeSingle();
                    const displayName = String(profile?.full_name || '').trim();
                    const greetingName = displayName || 'there';
                    await this.sendTextMessage({
                        tenantId: codeRow.tenant_id,
                        phoneNumberId,
                        to: normalizeDigits(remoteJid),
                        text: `Welcome back, ${greetingName}. You’re logged in to Pulse. Open your browser if it does not switch automatically.`,
                        replyToMessageId: messageId,
                    }).catch((error) => {
                        console.warn('[WhatsAppCloudApiService] Failed to send login confirmation', error);
                    });
                }
            }
            await this.markWebhookMessageProcessed(tenantId, messageId);
            return { replied: false, ignored: false };
        }

        const ingestResult = shouldIngestPropertySubmission(text)
            ? await channelService.ingestMessage(dataTenantId, {
                id: messageId,
                session_label: sessionLabel,
                remote_jid: remoteJid,
                sender: senderName,
                text,
                timestamp,
                created_at: timestamp,
                source: 'whatsapp_cloud',
                sourceGroupId: null,
                sourceGroupName: null,
                senderJid: null,
            } as any).catch((error) => {
                console.warn('[WhatsAppCloudApiService] Stream ingest failed', error);
                return { count: 0, refNos: [] };
            })
            : { count: 0, refNos: [] };

        const ingestedCount = ingestResult.count;
        const refNos = ingestResult.refNos;

        if (ingestedCount > 0) {
            await whatsappHealthService.recordMessageMetrics({
                tenantId: dataTenantId,
                sessionLabel,
                remoteJid,
                parsed: true,
                failed: false,
                countReceived: false,
                timestamp,
            }).catch(() => undefined);
        }

        // If stream saved ref_nos, tell the agent so it can include them in reply
        let agentInputText = text;
        if (refNos.length > 0) {
            const codes = refNos.join(', ');
            agentInputText = `${text}\n\n[Stream saved this as ${codes}. Tell the user the code(s) in your reply.]`;
        }

        // For bare media (photo/video without caption), check if we have a recent listing from this sender
        let isBareMedia = false;
        if (!text.trim() || /^\[User sent (an image|a video|a document|a file|a voice note)\]$/.test(text.trim())) {
            isBareMedia = true;
        }
        if (isBareMedia && storedMedia?.fileId) {
            try {
                const recent = await this.findRecentStreamItem(dataTenantId, remoteJid);
                if (recent) {
                    await this.attachMediaToStreamItem(dataTenantId, recent.id, storedMedia.fileId);
                    agentInputText = `[User sent media — automatically attached to ${recent.ref_no} (${recent.building_name || recent.locality || ''}). Inform the user the media was added.]`;
                }
            } catch {
                agentInputText = `[User sent media. Ask the user what listing this belongs to so you can attach it.]`;
            }
        }

        let agentFailureMessage = '';
        const isAdmin = isOwnerSuperAdminPhone(remoteJid);
        if (isAdmin) {
            agentFailureMessage = '__admin__';
        }
        await this.sendTypingIndicator(tenantId, phoneNumberId, messageId).catch(async (error) => {
            await whatsappHealthService.appendEvent(
                tenantId,
                sessionLabel,
                'cloud_typing_indicator_failed',
                'WhatsApp Cloud API typing indicator failed.',
                { messageId, error: error instanceof Error ? error.message : String(error) },
            ).catch(() => undefined);
        });

        let reply = await agentExecutor.processMessage(tenantId, remoteJid, agentInputText, sessionLabel, undefined, {
            suppressFallbackOnError: true,
            onError: async (error) => {
                agentFailureMessage = error instanceof Error ? error.message : String(error);
                const serializedError = error instanceof Error
                    ? {
                        name: error.name,
                        message: error.message,
                        stack: error.stack,
                    }
                    : { message: String(error) };
                await whatsappHealthService.appendEvent(
                    dataTenantId,
                    sessionLabel,
                    'cloud_agent_reply_failed',
                    'WhatsApp Cloud API agent reply failed.',
                    {
                        phoneNumberId,
                        remoteJid,
                        messageId,
                        error: serializedError,
                    },
                ).catch(() => undefined);
            },
        }).catch((error) => {
            console.error('[WhatsAppCloudApiService] Agent reply failed', error);
            return '';
        });

        if (!reply.trim() && agentFailureMessage) {
            reply = 'Pulse received your message, but the AI model provider is temporarily unavailable. Please try again in a few minutes.';
        }

        // If stream saved ref_nos but the AI didn't mention them, append them as a postscript
        if (reply.trim() && refNos.length > 0) {
            const alreadyMentioned = refNos.some((ref) => reply.includes(ref));
            if (!alreadyMentioned) {
                const codes = refNos.join(', ');
                reply = `${reply}\n\nSaved as ${codes}.`;
            }
        }

        if (reply.trim()) {
            try {
                await this.sendTextMessage({
                    tenantId,
                    phoneNumberId,
                    to: remoteJid,
                    text: reply,
                    replyToMessageId: messageId,
                });
            } catch (error) {
                const serializedError = error instanceof Error
                    ? { name: error.name, message: error.message, stack: error.stack }
                    : { message: String(error) };
                await whatsappHealthService.appendEvent(
                    dataTenantId,
                    sessionLabel,
                    'cloud_outbound_reply_failed',
                    'WhatsApp Cloud API outbound reply failed.',
                    {
                        phoneNumberId,
                        remoteJid,
                        messageId,
                        error: serializedError,
                    },
                ).catch(() => undefined);
                await this.markWebhookMessageFailed(tenantId, messageId, error);
                return { replied: false, ignored: false };
            }

            const outboundTimestamp = new Date().toISOString();
            const { error: outboundInsertError } = await db.from('messages').insert({
                tenant_id: dataTenantId,
                session_label: sessionLabel,
                remote_jid: remoteJid,
                sender: 'AI',
                text: reply,
                timestamp: outboundTimestamp,
            });
            if (outboundInsertError) {
                console.warn('[WhatsAppCloudApiService] Failed to persist outbound reply', outboundInsertError);
            }

            await whatsappThreadService.upsertFromMessage({
                tenantId: dataTenantId,
                sessionLabel,
                remoteJid,
                sender: 'AI',
                text: reply,
                timestamp: outboundTimestamp,
            }).catch((error) => {
                console.warn('[WhatsAppCloudApiService] Failed to update outbound thread row', error);
            });

            await whatsappHealthService.appendEvent(
                dataTenantId,
                sessionLabel,
                'cloud_outbound_reply',
                'Outbound WhatsApp Cloud API reply sent.',
                {
                    phoneNumberId,
                    remoteJid,
                    messageId,
                },
            ).catch(() => undefined);
        }

        await this.markWebhookMessageProcessed(tenantId, messageId);
        return { replied: Boolean(reply.trim()), ignored: false };
    }

    private async findCredentialByPhoneNumberId(phoneNumberId?: string | null, displayPhoneNumber?: string | null) {
        const target = String(phoneNumberId || '').trim();
        const displayTarget = normalizeDigits(displayPhoneNumber || '');
        if (!target && !displayTarget) {
            return null;
        }

        const { data, error } = await db
            .from('waba_credentials')
            .select('id, tenant_id, phone_number_id, phone_number, business_account_id, business_account_name')
            .eq('is_active', true);

        if (error) {
            throw error;
        }

        const rows = Array.isArray(data) ? data as WabaCredentialRow[] : [];
        const match = rows.find((row) => {
            const rowPhoneNumberId = String(row.phone_number_id || '').trim();
            const rowPhone = normalizeDigits(row.phone_number || '');
            return (target && rowPhoneNumberId === target) || (displayTarget && rowPhone === displayTarget);
        });

        if (match) return match;

        const sessionConfig = await this.findConfigByPhoneNumberId(phoneNumberId, displayPhoneNumber);
        return this.sessionConfigToCredential(sessionConfig);
    }

    private async findCredentialByTenantId(tenantId?: string | null) {
        const targetTenantId = String(tenantId || '').trim();
        if (!targetTenantId) return null;

        const { data, error } = await db
            .from('waba_credentials')
            .select('id, tenant_id, phone_number_id, phone_number, business_account_id, business_account_name')
            .eq('tenant_id', targetTenantId)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (data) return data as WabaCredentialRow;

        const { data: sessionData, error: sessionError } = await db
            .from('whatsapp_sessions')
            .select('session_id, tenant_id, label, owner_name, status, session_data, updated_at, last_sync')
            .eq('tenant_id', targetTenantId)
            .eq('label', SESSION_LABEL)
            .maybeSingle();

        if (sessionError) {
            throw sessionError;
        }

        return this.sessionConfigToCredential(sessionData as OfficialApiConfigRow | null);
    }

    private async getWabaCredentialById(id: string) {
        const { data, error } = await db
            .from('waba_credentials')
            .select('id, tenant_id, phone_number_id, phone_number, business_account_id, business_account_name')
            .eq('id', id)
            .maybeSingle();

        if (error) {
            throw error;
        }

        return data as WabaCredentialRow | null;
    }

    private async getMediaDownloadUrl(tenantId: string, mediaId: string): Promise<string | null> {
        const accessToken = await keyService.getKey(tenantId, this.providerName);
        if (!accessToken) return null;

        const response = await fetch(`${getCloudBaseUrl()}/${encodeURIComponent(mediaId)}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) return null;

        const body = await response.json().catch(() => null);
        const url = body?.url || body?.data?.url || null;
        return url ? String(url) : null;
    }

    private async downloadMediaBuffer(tenantId: string, downloadUrl: string): Promise<Buffer | null> {
        const accessToken = await keyService.getKey(tenantId, this.providerName);
        if (!accessToken) return null;

        const response = await fetch(downloadUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) return null;

        const arrayBuffer = await response.arrayBuffer().catch(() => null);
        if (!arrayBuffer) return null;
        return Buffer.from(arrayBuffer);
    }

    private async ensureMediaBucket(): Promise<boolean> {
        if (!supabaseAdmin) return false;
        try {
            const { data: buckets } = await supabaseAdmin.storage.listBuckets();
            if (Array.isArray(buckets) && buckets.some((b) => b.name === 'waba-media')) {
                return true;
            }
            const { error } = await supabaseAdmin.storage.createBucket('waba-media', { public: false });
            return !error;
        } catch {
            return false;
        }
    }

    private async getAudioTranscriber() {
        if (this.audioTranscriberPromise) {
            return this.audioTranscriberPromise;
        }

        transformersEnv.allowRemoteModels = true;
        transformersEnv.allowLocalModels = true;
        this.audioTranscriberPromise = pipeline('automatic-speech-recognition', WABA_AUDIO_TRANSCRIPTION_MODEL);
        return this.audioTranscriberPromise;
    }

    private async decodeAudioBufferToWaveform(buffer: Buffer): Promise<Float32Array | null> {
        return new Promise((resolve) => {
            const ffmpeg = spawn('ffmpeg', [
                '-hide_banner',
                '-loglevel',
                'error',
                '-i',
                'pipe:0',
                '-ac',
                '1',
                '-ar',
                '16000',
                '-f',
                's16le',
                'pipe:1',
            ], {
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            const stdoutChunks: Buffer[] = [];
            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                ffmpeg.kill('SIGKILL');
                resolve(null);
            }, WABA_AUDIO_TRANSCRIPTION_TIMEOUT_MS);

            const finish = (value: Float32Array | null) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                resolve(value);
            };

            ffmpeg.stdout.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)));
            ffmpeg.on('error', () => finish(null));
            ffmpeg.on('close', (code) => {
                if (code !== 0) {
                    return finish(null);
                }

                const pcm = Buffer.concat(stdoutChunks);
                if (pcm.length < 2) {
                    return finish(null);
                }

                const sampleCount = Math.floor(pcm.length / 2);
                const waveform = new Float32Array(sampleCount);
                for (let i = 0; i < sampleCount; i += 1) {
                    waveform[i] = pcm.readInt16LE(i * 2) / 32768;
                }
                return finish(waveform);
            });

            ffmpeg.stdin.on('error', () => finish(null));
            ffmpeg.stdin.end(buffer);
        });
    }

    private async transcribeAudioBuffer(buffer: Buffer): Promise<string | null> {
        if (!WABA_AUDIO_TRANSCRIPTION_ENABLED) return null;

        const waveform = await this.decodeAudioBufferToWaveform(buffer);
        if (!waveform || waveform.length === 0) {
            return null;
        }

        try {
            const transcriber = await this.getAudioTranscriber();
            const result = await transcriber(waveform, {
                task: 'transcribe',
                ...(WABA_AUDIO_TRANSCRIPTION_LANGUAGE ? { language: WABA_AUDIO_TRANSCRIPTION_LANGUAGE } : {}),
                chunk_length_s: 30,
                stride_length_s: 5,
            });
            const transcript = String(result?.text || '').trim();
            return transcript || null;
        } catch (error) {
            console.warn('[WhatsAppCloudApiService] Audio transcription failed', error);
            return null;
        }
    }

    private async storeIncomingMedia(
        tenantId: string,
        media: MediaInfo,
    ): Promise<{ fileId: string; attachmentCtx: string; transcript?: string | null } | null> {
        try {
            const downloadUrl = await this.getMediaDownloadUrl(tenantId, media.mediaId);
            if (!downloadUrl) return null;

            const buffer = await this.downloadMediaBuffer(tenantId, downloadUrl);
            if (!buffer || buffer.length === 0) return null;

            const transcript = media.kind === 'audio'
                ? await this.transcribeAudioBuffer(buffer)
                : null;

            const bucketOk = await this.ensureMediaBucket();
            if (!bucketOk) return null;

            const ext = WABA_MEDIA_EXT[media.mimeType] || '.bin';
            const fileId = crypto.randomUUID();
            const storagePath = `${tenantId}/${new Date().toISOString().slice(0, 10)}/${fileId}${ext}`;

            const { error: uploadError } = await supabaseAdmin!.storage
                .from('waba-media')
                .upload(storagePath, buffer, {
                    contentType: media.mimeType,
                    upsert: false,
                });

            if (uploadError) return null;

            const now = new Date().toISOString();
            const { data: row, error: insertError } = await db
                .from('workspace_files')
                .insert({
                    workspace_id: tenantId,
                    file_name: media.fileName,
                    mime_type: media.mimeType,
                    byte_size: buffer.length,
                    storage_bucket: 'waba-media',
                    storage_path: storagePath,
                    extracted_text: transcript,
                    extraction_status: transcript ? 'extracted' : 'not_supported',
                    extraction_error: transcript ? null : null,
                    created_at: now,
                    updated_at: now,
                })
                .select('id')
                .single();

            if (insertError || !row) {
                await supabaseAdmin!.storage.from('waba-media').remove([storagePath]).catch(() => {});
                return null;
            }

            const ctx = `[${media.fileName} (${media.mimeType})] Incoming WhatsApp media saved.`;

            return { fileId: row.id, attachmentCtx: ctx, transcript };
        } catch {
            return null;
        }
    }

    private async resolveTenantFromPhone(phone: string): Promise<string | null> {
        const normalized = normalizeDigits(phone);
        if (!normalized) return null;
        // Check broker_contacts first (activation-code linked)
        const { data: bc } = await supabaseAdmin!
            .from('broker_contacts')
            .select('tenant_id')
            .eq('phone', normalized)
            .maybeSingle();
        if (bc?.tenant_id) return bc.tenant_id;
        // Profiles can store either a national or E.164 Indian number. Resolve
        // ownership after normalisation so a WABA 91-prefixed sender is recognised.
        return (await getPhoneOwnership(normalized))?.canonicalOwnerId || null;
    }

    async sendTextMessage(input: {
        tenantId: string;
        phoneNumberId: string;
        to: string;
        text: string;
        replyToMessageId?: string | null;
    }) {
        const accessToken = await keyService.getKey(input.tenantId, this.providerName);
        if (!accessToken) {
            throw new Error('WhatsApp Cloud access token is not configured');
        }

        // 24-hour customer-care window check
        const normalizedTo = normalizeDigits(input.to);
        const remoteJid = `${normalizedTo}@s.whatsapp.net`;
        const { data: thread } = await supabaseAdmin!
            .from('whatsapp_threads')
            .select('last_inbound_at')
            .eq('remote_jid', remoteJid)
            .order('last_inbound_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (thread?.last_inbound_at) {
            const hoursSinceInbound = (Date.now() - new Date(thread.last_inbound_at).getTime()) / 3_600_000;
            if (hoursSinceInbound > 24) {
                throw new Error('24-hour customer care window has expired. Use a message template to send outbound messages.');
            }
        }

        const payload: Record<string, unknown> = {
            messaging_product: 'whatsapp',
            to: normalizedTo,
            type: 'text',
            text: { body: String(input.text || '') },
        };

        if (input.replyToMessageId) {
            payload.context = { message_id: input.replyToMessageId };
        }

        const response = await fetch(`${getCloudBaseUrl()}/${encodeURIComponent(input.phoneNumberId)}/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`WhatsApp Cloud send failed (${response.status}): ${body || response.statusText}`);
        }

        return response.json().catch(() => ({}));
    }

    private async claimWebhookMessage(input: {
        tenantId: string;
        wabaCredentialId?: string | null;
        messageId: string;
        from: string;
        senderName: string;
        messageType: string;
        text: string;
        timestamp: string;
        rawPayload: Record<string, any>;
    }) {
        const { error } = await db.from('cloud_api_webhook_events').insert({
            tenant_id: input.tenantId,
            waba_credential_id: input.wabaCredentialId || null,
            meta_message_id: input.messageId,
            meta_contact_wa_id: normalizeDigits(input.from) || null,
            from_name: input.senderName || null,
            message_type: input.messageType,
            message_body: input.text || null,
            timestamp: input.timestamp,
            raw_payload: input.rawPayload,
            processed: false,
        });

        if (!error) return true;
        if (error.code === '23505') return false;
        throw error;
    }

    private async markWebhookMessageProcessed(tenantId: string, messageId: string) {
        await db.from('cloud_api_webhook_events')
            .update({ processed: true, claimed_at: null, processing_error: null })
            .eq('tenant_id', tenantId)
            .eq('meta_message_id', messageId);
    }

    private async markWebhookMessageFailed(tenantId: string, messageId: string, error: unknown) {
        await db.from('cloud_api_webhook_events')
            .update({ claimed_at: null, processing_error: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000) })
            .eq('tenant_id', tenantId)
            .eq('meta_message_id', messageId);
    }

    private async sendTypingIndicator(tenantId: string, phoneNumberId: string, messageId: string) {
        const accessToken = await keyService.getKey(tenantId, this.providerName);
        if (!accessToken) throw new Error('WhatsApp Cloud access token is not configured');

        const payload = {
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: messageId,
            typing_indicator: { type: 'text' },
        };

        const response = await fetch(`${getCloudBaseUrl()}/${encodeURIComponent(phoneNumberId)}/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`WhatsApp Cloud typing indicator failed (${response.status}): ${await response.text().catch(() => response.statusText)}`);
        }
    }
    private async findRecentStreamItem(tenantId: string, remoteJid: string) {
        const phone = normalizeDigits(remoteJid);
        if (!phone) return null;
        const sources = [phone, `91${phone}`, `+91${phone}`];

        for (const table of ['stream_items_residential', 'stream_items_commercial'] as const) {
            const { data } = await db
                .from(table)
                .select('id, ref_no, building_name, locality, created_at')
                .eq('tenant_id', tenantId)
                .in('source_phone', sources)
                .gte('created_at', new Date(Date.now() - 5 * 60_000).toISOString())
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (data?.ref_no) return data;
        }

        return null;
    }

    private async attachMediaToStreamItem(tenantId: string, streamItemId: string, fileId: string) {
        const tables = ['stream_items_residential', 'stream_items_commercial'] as const;
        for (const table of tables) {
            const { data: existing } = await db
                .from(table)
                .select('parsed_payload')
                .eq('id', streamItemId)
                .eq('tenant_id', tenantId)
                .maybeSingle();
            if (!existing) continue;

            const currentFiles: string[] = existing.parsed_payload?.files || [];
            const files = currentFiles.includes(fileId) ? currentFiles : [...currentFiles, fileId];

            await db
                .from(table)
                .update({ parsed_payload: { ...existing.parsed_payload, files } })
                .eq('id', streamItemId)
                .eq('tenant_id', tenantId);
            return;
        }
    }
}

export const whatsappCloudApiService = new WhatsAppCloudApiService();
