import crypto from 'crypto';
import { keyService } from './keyService';
import { whatsappHealthService } from './whatsappHealthService';
import { whatsappThreadService } from './whatsappThreadService';
import { channelService } from './channelService';
import { agentExecutor } from './AgentExecutor';
import { supabase, supabaseAdmin } from '../config/supabase';
import { isOwnerSuperAdminPhone } from '../utils/controllerHelpers';
import { activationCodeService } from './activationCodeService';
import { getPhoneOwnership } from './phoneOwnershipService';

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

    async handleWebhook(payload: MetaWebhookPayload) {
        if (process.env.CLOUD_API_WEBHOOK_ENABLED === 'false') {
            return [];
        }
        const entries = Array.isArray(payload?.entry) ? payload.entry : [];
        const results: Array<{ tenantId: string; processed: number; replied: number; ignored: number }> = [];
        const recentProcessedMessageIds = new Set<string>();

        for (const entry of entries) {
            const changes = Array.isArray(entry?.changes) ? entry.changes : [];
            for (const change of changes) {
                const value = change?.value || {};
                const phoneNumberId = String(value?.metadata?.phone_number_id || '').trim();
                const displayPhoneNumber = String(value?.metadata?.display_phone_number || '').trim();
                const configRow = await this.findConfigByPhoneNumberId(phoneNumberId, displayPhoneNumber).catch(() => null);
                if (!configRow?.tenant_id) {
                    continue;
                }

                const adminTenantId = String(configRow.tenant_id);
                const sessionLabel = SESSION_LABEL;
                const messages = Array.isArray(value.messages) ? value.messages : [];
                let processed = 0;
                let replied = 0;
                let ignored = 0;

                for (const message of messages) {
                    const messageId = String(message?.id || crypto.randomUUID()).trim();
                    if (recentProcessedMessageIds.has(messageId)) {
                        ignored += 1;
                        continue;
                    }
                    recentProcessedMessageIds.add(messageId);

                    const claimed = await this.claimWebhookMessage({
                        tenantId: adminTenantId,
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

                    const remoteJid = buildRemoteJid(message?.from);
                    if (!remoteJid) {
                        ignored += 1;
                        continue;
                    }

                    let text = extractText(message);
                    const mediaInfo = getMediaInfo(message);
                    if (mediaInfo) {
                        const stored = await this.storeIncomingMedia(adminTenantId, mediaInfo).catch(() => null);
                        if (stored?.attachmentCtx) {
                            text = `${text}\n\n---\n${stored.attachmentCtx}\n---`;
                        }
                        if (!text.trim()) {
                            const typeLabel = String(message?.type || 'file').toLowerCase();
                            text = `[User sent ${typeLabel === 'image' ? 'an image' : typeLabel === 'video' ? 'a video' : typeLabel === 'document' ? 'a document' : 'a file'}]`;
                        }
                    }
                    if (!text.trim()) {
                        ignored += 1;
                        continue;
                    }

                    const timestamp = toIso(message?.timestamp || message?.message_timestamp || null);
                    const senderName = String(value?.contacts?.[0]?.profile?.name || value?.contacts?.[0]?.wa_id || remoteJid || 'Client').trim();

                    // Resolve broker tenant from sender phone so data is attributed to the right broker
                    const dataTenantId = await this.resolveTenantFromPhone(String(message?.from || '')) || adminTenantId;

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
                            displayPhoneNumber: value?.metadata?.display_phone_number || null,
                        },
                    ).catch(() => undefined);

                    // --- Activation code detection ---
                    if (activationCodeService.isActivationCode(text)) {
                        const code = text.trim().toUpperCase();
                        const codeRow = await activationCodeService.validateCode(code);
                        if (codeRow) {
                            await activationCodeService.activateCode(code, normalizeDigits(remoteJid));
                            await activationCodeService.linkBrokerPhone(codeRow.tenant_id, normalizeDigits(remoteJid));
                            await this.sendTextMessage({
                                tenantId: adminTenantId,
                                phoneNumberId,
                                to: remoteJid,
                                text: '✅ *WhatsApp Activation Successful!*\n\nYour WhatsApp number has been linked to your PropAI account. You can now send listings and requirements directly to Pulse.',
                            });
                        } else {
                            await this.sendTextMessage({
                                tenantId: adminTenantId,
                                phoneNumberId,
                                to: remoteJid,
                                text: '❌ *Activation Failed*\n\nThe code you sent is invalid or expired. Please generate a new activation code from the PropAI web app.',
                            });
                        }
                        processed += 1;
                        await this.markWebhookMessageProcessed(adminTenantId, messageId);
                        continue;
                    }
                    // --- end activation code detection ---

                    const ingestedCount = shouldIngestPropertySubmission(text)
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
                            return 0;
                        })
                        : 0;

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

                    let agentFailureMessage = '';
                    const isAdmin = isOwnerSuperAdminPhone(remoteJid);
                    if (isAdmin) {
                        agentFailureMessage = '__admin__';
                    }
                    await this.sendTypingIndicator(adminTenantId, phoneNumberId, messageId).catch(async (error) => {
                        await whatsappHealthService.appendEvent(
                            adminTenantId,
                            sessionLabel,
                            'cloud_typing_indicator_failed',
                            'WhatsApp Cloud API typing indicator failed.',
                            { messageId, error: error instanceof Error ? error.message : String(error) },
                        ).catch(() => undefined);
                    });
                    let reply = await agentExecutor.processMessage(adminTenantId, remoteJid, text, sessionLabel, undefined, {
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

                    if (reply.trim()) {
                        try {
                            await this.sendTextMessage({
                                tenantId: adminTenantId,
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
                            await this.markWebhookMessageFailed(adminTenantId, messageId, error);
                            continue;
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
                        replied += 1;
                    }

                    processed += 1;
                    await this.markWebhookMessageProcessed(adminTenantId, messageId);
                }

                await whatsappHealthService.upsertConnectionSnapshot({
                    tenantId: adminTenantId,
                    sessionLabel,
                    phoneNumber: value?.metadata?.display_phone_number || configRow.session_data?.displayPhoneNumber || null,
                    ownerName: configRow.owner_name || 'Official WhatsApp',
                    status: 'connected',
                }).catch(() => undefined);

                results.push({ tenantId: adminTenantId, processed, replied, ignored });
            }
        }

        return results;
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

    private async storeIncomingMedia(
        tenantId: string,
        media: MediaInfo,
    ): Promise<{ fileId: string; attachmentCtx: string } | null> {
        try {
            const downloadUrl = await this.getMediaDownloadUrl(tenantId, media.mediaId);
            if (!downloadUrl) return null;

            const buffer = await this.downloadMediaBuffer(tenantId, downloadUrl);
            if (!buffer || buffer.length === 0) return null;

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
                    extracted_text: null,
                    extraction_status: 'pending',
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

            return { fileId: row.id, attachmentCtx: ctx };
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
            .update({ processed: true, processing_error: null })
            .eq('tenant_id', tenantId)
            .eq('meta_message_id', messageId);
    }

    private async markWebhookMessageFailed(tenantId: string, messageId: string, error: unknown) {
        await db.from('cloud_api_webhook_events')
            .update({ processing_error: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000) })
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
}

export const whatsappCloudApiService = new WhatsAppCloudApiService();
