import { supabase, supabaseAdmin } from '../config/supabase';
import { emailNotificationService } from './emailNotificationService';
import { notificationService } from './notificationService';

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
