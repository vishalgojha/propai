import type { WhatsAppRuntimeHooks } from '@vishalgojha/whatsapp-baileys-runtime';
import { getWhatsAppGateway } from '../channel-gateways/whatsapp/whatsappGatewayRegistry';
import { processWhatsAppGroupSyncEvent } from '../channel-events/processors/processWhatsAppGroupSyncEvent';
import { processWhatsAppInboundMessage } from '../channel-events/processors/processWhatsAppInboundMessage';
import { processWhatsAppSessionEvent } from '../channel-events/processors/processWhatsAppSessionEvent';
import { supabase, supabaseAdmin } from '../config/supabase';
import { emailNotificationService } from '../services/emailNotificationService';
import { notificationService } from '../services/notificationService';
import { liveMonitorService } from '../services/liveMonitorService';
import { whatsappHealthService } from '../services/whatsappHealthService';

const db = supabaseAdmin || supabase;
type LifecycleEmailInput = {
    tenantId: string;
    label: string;
    status: 'connected' | 'disconnected';
    phoneNumber?: string | null;
    fallbackEmail?: string | null;
    fallbackFullName?: string | null;
};

type LifecyclePushInput = {
    tenantId: string;
    label: string;
    status: 'disconnected';
    phoneNumber?: string | null;
};

export async function sendWhatsAppLifecycleEmail(input: LifecycleEmailInput) {
    const { tenantId, label, status, phoneNumber, fallbackEmail, fallbackFullName } = input;

    if (tenantId === 'system') {
        return;
    }

    const { data: profile, error: profileError } = await db
        .from('profiles')
        .select('email, full_name')
        .eq('id', tenantId)
        .maybeSingle();

    if (profileError) {
        console.error('[WhatsAppEmail] Failed to load profile for lifecycle email:', profileError);
    }

    const recipientEmail = profile?.email || fallbackEmail || null;
    const recipientName = profile?.full_name || fallbackFullName || null;

    if (!recipientEmail) {
        return;
    }

    const { data: sessionRow, error: sessionError } = await db
        .from('whatsapp_sessions')
        .select('session_data')
        .eq('tenant_id', tenantId)
        .eq('label', label)
        .maybeSingle();

    if (sessionError) {
        console.error('[WhatsAppEmail] Failed to load session row for lifecycle email:', sessionError);
    }

    const sessionData = (sessionRow?.session_data && typeof sessionRow.session_data === 'object')
        ? sessionRow.session_data as Record<string, any>
        : {};
    const lastNotifiedStatus = typeof sessionData.lastNotifiedStatus === 'string'
        ? sessionData.lastNotifiedStatus
        : null;
    const lastStatusEmailDelivery = typeof sessionData.lastStatusEmailDelivery === 'string'
        ? sessionData.lastStatusEmailDelivery
        : null;
    const lastStatusEmailErrorCode = typeof sessionData.lastStatusEmailErrorCode === 'string'
        ? sessionData.lastStatusEmailErrorCode
        : null;

    if (lastNotifiedStatus === status && lastStatusEmailDelivery === 'sent') {
        return;
    }

    if (lastNotifiedStatus === status && lastStatusEmailDelivery === 'permanent_failure' && lastStatusEmailErrorCode) {
        return;
    }

    const delivery = await emailNotificationService.sendWhatsAppStatusEmail({
        to: recipientEmail,
        fullName: recipientName,
        phoneNumber: phoneNumber || sessionData.phoneNumber || null,
        label,
        status,
    });

    if ('success' in delivery && delivery.success === false) {
        if (delivery.permanent) {
            const nextSessionData = {
                ...sessionData,
                lastNotifiedStatus: status,
                lastStatusEmailDelivery: 'permanent_failure',
                lastStatusEmailAt: new Date().toISOString(),
                lastStatusEmailErrorCode: delivery.code || 'unknown',
            };

            const { error: updateError } = await db
                .from('whatsapp_sessions')
                .update({ session_data: nextSessionData })
                .eq('tenant_id', tenantId)
                .eq('label', label);

            if (updateError) {
                console.error('[WhatsAppEmail] Failed to persist permanent lifecycle email failure marker:', updateError);
            }
            return;
        }

        console.error('[WhatsAppEmail] Lifecycle email send failed; notification marker will not be updated.', {
            tenantId,
            label,
            status,
        });
        return;
    }

    if ('skipped' in delivery && delivery.skipped) {
        if (delivery.reason === 'suppressed_permanent_failure') {
            return;
        }

        console.warn('[WhatsAppEmail] Lifecycle email skipped because email delivery is not configured; notification marker will not be updated.', {
            tenantId,
            label,
            status,
        });
        return;
    }

    const nextSessionData = {
        ...sessionData,
        lastNotifiedStatus: status,
        lastStatusEmailDelivery: 'sent',
        lastStatusEmailAt: new Date().toISOString(),
    };

    const { error: updateError } = await db
        .from('whatsapp_sessions')
        .update({ session_data: nextSessionData })
        .eq('tenant_id', tenantId)
        .eq('label', label);

    if (updateError) {
        console.error('[WhatsAppEmail] Failed to persist lifecycle notification marker:', updateError);
    }
}

export async function sendWhatsAppDisconnectPush(input: LifecyclePushInput) {
    const { tenantId, label, phoneNumber } = input;

    if (tenantId === 'system') {
        return;
    }

    const { data: sessionRow, error: sessionError } = await db
        .from('whatsapp_sessions')
        .select('session_data')
        .eq('tenant_id', tenantId)
        .eq('label', label)
        .maybeSingle();

    if (sessionError) {
        console.error('[WhatsAppPush] Failed to load session row for disconnect push:', sessionError);
    }

    const sessionData = (sessionRow?.session_data && typeof sessionRow.session_data === 'object')
        ? sessionRow.session_data as Record<string, any>
        : {};
    const lastPushStatus = typeof sessionData.lastDisconnectPushStatus === 'string'
        ? sessionData.lastDisconnectPushStatus
        : null;
    const lastPushDelivery = typeof sessionData.lastDisconnectPushDelivery === 'string'
        ? sessionData.lastDisconnectPushDelivery
        : null;

    if (lastPushStatus === 'disconnected' && lastPushDelivery === 'sent') {
        return;
    }

    const title = 'WhatsApp disconnected';
    const body = phoneNumber
        ? `${phoneNumber} disconnected. Reconnect to keep parsing and replies running.`
        : `${label} disconnected. Reconnect to keep parsing and replies running.`;

    const delivery = await notificationService.sendToTenant(tenantId, title, body, {
        tenantId,
        label,
        phoneNumber: phoneNumber || sessionData.phoneNumber || null,
        status: 'disconnected',
        action: 'whatsapp_reconnect',
    });

    if (delivery.skipped) {
        return;
    }

    const nextSessionData = {
        ...sessionData,
        lastDisconnectPushStatus: 'disconnected',
        lastDisconnectPushDelivery: delivery.sent > 0 ? 'sent' : 'no_subscriptions',
        lastDisconnectPushAt: new Date().toISOString(),
    };

    const { error: updateError } = await db
        .from('whatsapp_sessions')
        .update({ session_data: nextSessionData })
        .eq('tenant_id', tenantId)
        .eq('label', label);

    if (updateError) {
        console.error('[WhatsAppPush] Failed to persist disconnect push marker:', updateError);
    }
}

export function createPropAIRuntimeHooks(): WhatsAppRuntimeHooks {
    return {
        onQR: async (event) => {
            try {
                const { data: sessionRow } = await db
                    .from('whatsapp_sessions')
                    .select('session_data')
                    .eq('tenant_id', event.tenantId)
                    .eq('label', event.label)
                    .maybeSingle();

                const sessionData = (sessionRow?.session_data && typeof sessionRow.session_data === 'object')
                    ? sessionRow.session_data as Record<string, any>
                    : {};
                const pendingConnect = (sessionData.pendingConnect && typeof sessionData.pendingConnect === 'object')
                    ? sessionData.pendingConnect as Record<string, unknown>
                    : {};
                const mode = pendingConnect.mode === 'pairing' ? 'pairing' : 'qr';

                await db
                    .from('whatsapp_sessions')
                    .update({
                        session_data: {
                            ...sessionData,
                            connectionArtifact: {
                                mode,
                                format: 'text',
                                value: event.qr,
                            },
                            connectionArtifactUpdatedAt: new Date().toISOString(),
                        },
                        last_sync: new Date().toISOString(),
                    })
                    .eq('tenant_id', event.tenantId)
                    .eq('label', event.label);
            } catch (error) {
                console.error('[WhatsAppRuntime] Failed to persist connection artifact:', error);
            }
        },
        onMessage: async (event) => {
            try {
                liveMonitorService.recordMessage({
                    tenantId: event.tenantId,
                    sessionLabel: event.label,
                    remoteJid: event.remoteJid,
                    sender: event.sender || null,
                    text: event.text,
                    timestamp: event.timestamp,
                    direction: event.fromMe ? 'outbound' : 'inbound',
                });
                await processWhatsAppInboundMessage(event);
            } catch (error) {
                console.error('Agent Execution Loop Error:', error);
            }
        },
        onOutgoingMessage: async (event) => {
            liveMonitorService.recordMessage({
                tenantId: event.tenantId,
                sessionLabel: event.label,
                remoteJid: event.remoteJid,
                sender: 'Broker',
                text: event.text,
                timestamp: event.timestamp,
                direction: 'outbound',
            });
        },
        onConnectionUpdate: async (event) => {
            try {
                if (event.status === 'connected' || event.status === 'disconnected') {
                    const { data: sessionRow } = await db
                        .from('whatsapp_sessions')
                        .select('session_data')
                        .eq('tenant_id', event.tenantId)
                        .eq('label', event.label)
                        .maybeSingle();

                    const sessionData = (sessionRow?.session_data && typeof sessionRow.session_data === 'object')
                        ? sessionRow.session_data as Record<string, any>
                        : {};

                    await db
                        .from('whatsapp_sessions')
                        .update({
                            session_data: {
                                ...sessionData,
                                pendingConnect: null,
                                connectionArtifact: null,
                                connectionArtifactUpdatedAt: null,
                            },
                            last_sync: new Date().toISOString(),
                        })
                        .eq('tenant_id', event.tenantId)
                        .eq('label', event.label);
                }

                await processWhatsAppSessionEvent({
                    tenantId: event.tenantId,
                    sessionLabel: event.label,
                    phoneNumber: event.phoneNumber || null,
                    ownerName: event.ownerName || null,
                    status: event.status,
                });
                if (event.status === 'disconnected') {
                    await sendWhatsAppDisconnectPush({
                        tenantId: event.tenantId,
                        label: event.label,
                        status: 'disconnected',
                        phoneNumber: event.phoneNumber || null,
                    });
                }

                if (event.status === 'connected') {
                    try {
                        const groups = await getWhatsAppGateway(event.tenantId).listGroups({
                            workspaceOwnerId: event.tenantId,
                            sessionLabel: event.label,
                        });
                        if (groups.length > 0) {
                            await processWhatsAppGroupSyncEvent({
                                tenantId: event.tenantId,
                                sessionLabel: event.label,
                                groups,
                            });
                        }
                    } catch (groupError) {
                        const message = groupError instanceof Error ? groupError.message : String(groupError || '');
                        if (message.toLowerCase().includes('connection closed')) {
                            console.warn('[WhatsAppRuntime] Skipping group sync because the session closed before groups could be fetched.', {
                                tenantId: event.tenantId,
                                label: event.label,
                            });
                            return;
                        }
                        throw groupError;
                    }
                }
            } catch (error) {
                console.error('[WhatsAppEmail] Connection update notification error:', error);
            }
        },
        onError: async (event) => {
            console.error(`WhatsApp runtime error [${event.stage}] for tenant ${event.tenantId}:`, event.error);
            await whatsappHealthService.appendEvent(
                event.tenantId,
                event.label,
                'runtime_error',
                `WhatsApp runtime error during ${event.stage}.`,
                {
                    stage: event.stage,
                    error: event.error instanceof Error ? event.error.message : String(event.error || 'Unknown error'),
                },
            ).catch(() => undefined);
        },
    };
}
