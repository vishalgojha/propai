import crypto from 'crypto';
import { keyService } from './keyService';
import { whatsappHealthService } from './whatsappHealthService';
import { whatsappThreadService } from './whatsappThreadService';
import { channelService } from './channelService';
import { agentExecutor } from './AgentExecutor';
import { supabase, supabaseAdmin } from '../config/supabase';

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
    return String(process.env.WHATSAPP_CLOUD_API_VERSION || 'v20.0').trim();
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
        || message?.body
        || '',
    ).trim();
}

function buildRemoteJid(waId?: string | null) {
    const digits = normalizeDigits(waId);
    return digits ? `${digits}@s.whatsapp.net` : '';
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
        if (!process.env.CLOUD_API_WEBHOOK_ENABLED) {
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

                const tenantId = String(configRow.tenant_id);
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

                    const remoteJid = buildRemoteJid(message?.from);
                    const text = extractText(message);
                    if (!remoteJid || !text) {
                        ignored += 1;
                        continue;
                    }

                    const timestamp = toIso(message?.timestamp || message?.message_timestamp || null);
                    const senderName = String(value?.contacts?.[0]?.profile?.name || value?.contacts?.[0]?.wa_id || remoteJid || 'Client').trim();

                    const { error: inboundInsertError } = await db.from('messages').insert({
                        tenant_id: tenantId,
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
                        tenantId,
                        sessionLabel,
                        remoteJid,
                        sender: senderName,
                        text,
                        timestamp,
                    }).catch((error) => {
                        console.warn('[WhatsAppCloudApiService] Failed to update thread row', error);
                    });

                    await whatsappHealthService.recordMessageMetrics({
                        tenantId,
                        sessionLabel,
                        remoteJid,
                        parsed: false,
                        failed: false,
                        countReceived: true,
                        timestamp,
                    }).catch(() => undefined);

                    await whatsappHealthService.appendEvent(
                        tenantId,
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

                    const ingestedCount = await channelService.ingestMessage(tenantId, {
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
                    });

                    if (ingestedCount > 0) {
                        await whatsappHealthService.recordMessageMetrics({
                            tenantId,
                            sessionLabel,
                            remoteJid,
                            parsed: true,
                            failed: false,
                            countReceived: false,
                            timestamp,
                        }).catch(() => undefined);
                    }

                    let agentFailureMessage = '';
                    let reply = await agentExecutor.processMessage(tenantId, remoteJid, text, sessionLabel, undefined, {
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
                                tenantId,
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
                                tenantId,
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
                            continue;
                        }

                        const outboundTimestamp = new Date().toISOString();
                        const { error: outboundInsertError } = await db.from('messages').insert({
                            tenant_id: tenantId,
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
                            tenantId,
                            sessionLabel,
                            remoteJid,
                            sender: 'AI',
                            text: reply,
                            timestamp: outboundTimestamp,
                        }).catch((error) => {
                            console.warn('[WhatsAppCloudApiService] Failed to update outbound thread row', error);
                        });

                        await whatsappHealthService.appendEvent(
                            tenantId,
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
                }

                await whatsappHealthService.upsertConnectionSnapshot({
                    tenantId,
                    sessionLabel,
                    phoneNumber: value?.metadata?.display_phone_number || configRow.session_data?.displayPhoneNumber || null,
                    ownerName: configRow.owner_name || 'Official WhatsApp',
                    status: 'connected',
                }).catch(() => undefined);

                results.push({ tenantId, processed, replied, ignored });
            }
        }

        return results;
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

        const payload: Record<string, unknown> = {
            messaging_product: 'whatsapp',
            to: normalizeDigits(input.to),
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
}

export const whatsappCloudApiService = new WhatsAppCloudApiService();
