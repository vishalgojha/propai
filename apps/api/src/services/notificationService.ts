import webpush, { PushSubscription } from 'web-push';
import { supabaseAdmin } from '../config/supabase';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'admin@propai.live';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(`mailto:${VAPID_EMAIL}`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

class NotificationService {
    private isConfigured() {
        return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
    }

    private getDb() {
        if (!supabaseAdmin) throw new Error('Supabase admin client not configured');
        return supabaseAdmin;
    }

    async subscribe(tenantId: string, subscription: PushSubscription, userAgent?: string) {
        const { error } = await this.getDb()
            .from('push_subscriptions')
            .insert({
                tenant_id: tenantId,
                subscription: subscription as any,
                user_agent: userAgent || null,
            });

        if (error) {
            console.error('[NotificationService] Failed to subscribe', error.message);
            throw error;
        }
    }

    async unsubscribe(tenantId: string, subscription: PushSubscription) {
        const endpoint = subscription.endpoint;
        const { error } = await this.getDb()
            .from('push_subscriptions')
            .delete()
            .eq('tenant_id', tenantId)
            .filter('subscription->>endpoint', 'eq', endpoint);

        if (error) {
            console.error('[NotificationService] Failed to unsubscribe', error.message);
        }
    }

    async sendToTenant(tenantId: string, title: string, body: string, data?: Record<string, unknown>) {
        if (!this.isConfigured()) {
            console.warn('[NotificationService] VAPID keys not configured, skipping push');
            return { sent: 0, failed: 0, skipped: true as const };
        }

        let db;
        try {
            db = this.getDb();
        } catch {
            return { sent: 0, failed: 0, skipped: true as const };
        }

        const { data: subscriptions, error } = await db
            .from('push_subscriptions')
            .select('subscription')
            .eq('tenant_id', tenantId);

        if (error) {
            console.error('[NotificationService] Failed to fetch subscriptions', error.message);
            return { sent: 0, failed: 0, skipped: true as const };
        }

        const payload = JSON.stringify({ title, body, data: data || {} });
        let sent = 0;
        let failed = 0;

        for (const row of (subscriptions || [])) {
            const sub = row.subscription as PushSubscription;
            try {
                await webpush.sendNotification(sub, payload);
                sent += 1;
            } catch (err: any) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await db
                        .from('push_subscriptions')
                        .delete()
                        .eq('tenant_id', tenantId)
                        .filter('subscription->>endpoint', 'eq', sub.endpoint);
                } else {
                    console.error('[NotificationService] Failed to send push', err.message);
                    failed += 1;
                }
            }
        }

        return { sent, failed, skipped: false as const };
    }
}

export const notificationService = new NotificationService();
