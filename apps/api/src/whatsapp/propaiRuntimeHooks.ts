import type { WhatsAppRuntimeHooks } from '@vishalgojha/whatsapp-baileys-runtime';
import { getWhatsAppGateway } from '../channel-gateways/whatsapp/whatsappGatewayRegistry';
import { processWhatsAppGroupSyncEvent } from '../channel-events/processors/processWhatsAppGroupSyncEvent';
import { processWhatsAppInboundMessage } from '../channel-events/processors/processWhatsAppInboundMessage';
import { processWhatsAppSessionEvent } from '../channel-events/processors/processWhatsAppSessionEvent';
import { supabase, supabaseAdmin } from '../config/supabase';
import { emailNotificationService } from '../services/emailNotificationService';

const db = supabaseAdmin || supabase;
type LifecycleEmailInput = {
    tenantId: string;
    label: string;
    status: 'connected' | 'disconnected';
    phoneNumber?: string | null;
    fallbackEmail?: string | null;
    fallbackFullName?: string | null;
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

    if (lastNotifiedStatus === status) {
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
        return;
    }

    const nextSessionData = {
        ...sessionData,
        lastNotifiedStatus: status,
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

export function createPropAIRuntimeHooks(): WhatsAppRuntimeHooks {
    return {
        onMessage: async (event) => {
            try {
                await processWhatsAppInboundMessage(event);
            } catch (error) {
                console.error('Agent Execution Loop Error:', error);
            }
        },
        onConnectionUpdate: async (event) => {
            try {
                await processWhatsAppSessionEvent({
                    tenantId: event.tenantId,
                    sessionLabel: event.label,
                    phoneNumber: event.phoneNumber || null,
                    ownerName: event.ownerName || null,
                    status: event.status,
                });

                if (event.status === 'connected') {
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
                }
            } catch (error) {
                console.error('[WhatsAppEmail] Connection update notification error:', error);
            }
        },
        onError: async (event) => {
            console.error(`WhatsApp runtime error [${event.stage}] for tenant ${event.tenantId}:`, event.error);
        },
    };
}
