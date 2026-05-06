import { supabase, supabaseAdmin } from '../config/supabase';

export type Plan = 'Free' | 'Pro' | 'Team';

export interface Subscription {
    plan: Plan;
    status: string;
    created_at?: string | null;
    renewal_date: string | null;
    trial_days_remaining?: number | null;
}

const OWNER_SUPER_ADMIN_EMAILS = new Set([
    'vishal@chaoscraftlabs.com',
    'vishal@chaoscraftslabs.com',
]);

const DEFAULT_TRIAL_DAYS = 7;

export class SubscriptionService {
    private db = supabaseAdmin ?? supabase;
    private planLimits = {
        Free: { sessions: 2, leads: 50, features: ['basic_parser'] }, // 7-day trial
        Pro: { sessions: 2, leads: Infinity, features: ['basic_parser', 'portal_posting'] }, // Base
        Team: { sessions: 5, leads: Infinity, features: ['basic_parser', 'portal_posting', 'priority_support'] }, // Scale
    };

    private addDays(date: Date, days: number) {
        const next = new Date(date);
        next.setDate(next.getDate() + days);
        return next;
    }

    private daysRemaining(expiry: string | null) {
        if (!expiry) return null;
        const diff = new Date(expiry).getTime() - Date.now();
        return Math.max(0, Math.ceil(diff / 86_400_000));
    }

    private normalizeStatus(status: string | null | undefined, plan: Plan) {
        if (!status) return plan === 'Free' ? 'trial' : 'active';
        return status === 'trialing' ? 'trial' : status;
    }

    private isOwnerSuperAdminEmail(email?: string | null) {
        return OWNER_SUPER_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
    }

    private async ensureOwnerSubscription(tenantId: string): Promise<Subscription> {
        const createdAt = new Date().toISOString();
        const { data, error } = await this.db
            .from('subscriptions')
            .upsert({
                tenant_id: tenantId,
                plan: 'Team',
                status: 'active',
                created_at: createdAt,
                renewal_date: null,
            }, { onConflict: 'tenant_id' })
            .select('plan, status, created_at, renewal_date')
            .single();

        if (error || !data) {
            return {
                plan: 'Team',
                status: 'active',
                created_at: createdAt,
                renewal_date: null,
                trial_days_remaining: null,
            };
        }

        return {
            ...data,
            status: 'active',
            trial_days_remaining: null,
        };
    }

    async ensureTrialSubscription(tenantId: string, email?: string | null): Promise<Subscription> {
        if (this.isOwnerSuperAdminEmail(email)) {
            return this.ensureOwnerSubscription(tenantId);
        }

        const { data: existing, error: existingError } = await this.db
            .from('subscriptions')
            .select('plan, status, created_at, renewal_date')
            .eq('tenant_id', tenantId)
            .maybeSingle();

        if (!existingError && existing) {
            const createdAt = existing.created_at || new Date().toISOString();
            const renewalDate = existing.renewal_date || (existing.plan === 'Free' ? this.addDays(new Date(createdAt), DEFAULT_TRIAL_DAYS).toISOString() : this.addDays(new Date(createdAt), 30).toISOString());
            const normalizedStatus = this.normalizeStatus(existing.status, existing.plan);

            if (!existing.created_at || !existing.renewal_date) {
                await this.db
                    .from('subscriptions')
                    .update({
                        created_at: createdAt,
                        renewal_date: renewalDate,
                        status: normalizedStatus,
                    })
                    .eq('tenant_id', tenantId);
            }

            return {
                ...existing,
                created_at: createdAt,
                renewal_date: renewalDate,
                status: normalizedStatus,
                trial_days_remaining: this.daysRemaining(renewalDate),
            };
        }

        const createdAt = new Date();
        const renewalDate = this.addDays(createdAt, DEFAULT_TRIAL_DAYS).toISOString();
        const { data, error } = await this.db
            .from('subscriptions')
            .upsert({
                tenant_id: tenantId,
                plan: 'Free',
                status: 'trial',
                created_at: createdAt.toISOString(),
                renewal_date: renewalDate,
            }, { onConflict: 'tenant_id' })
            .select('plan, status, created_at, renewal_date')
            .single();

        if (error || !data) {
            return {
                plan: 'Free',
                status: 'trial',
                created_at: createdAt.toISOString(),
                renewal_date: renewalDate,
                trial_days_remaining: this.daysRemaining(renewalDate),
            };
        }

        return {
            ...data,
            trial_days_remaining: this.daysRemaining(data.renewal_date),
        };
    }

    async getSubscription(tenantId: string, email?: string | null): Promise<Subscription> {
        if (this.isOwnerSuperAdminEmail(email)) {
            return this.ensureOwnerSubscription(tenantId);
        }

        const { data, error } = await this.db
            .from('subscriptions')
            .select('plan, status, created_at, renewal_date')
            .eq('tenant_id', tenantId)
            .maybeSingle();

        if (error || !data) {
            // Return default Free plan if no record exists
            return { plan: 'Free', status: 'trial', created_at: null, renewal_date: null, trial_days_remaining: null };
        }

        return {
            ...data,
            status: this.normalizeStatus(data.status, data.plan),
            trial_days_remaining: this.daysRemaining(data.renewal_date),
        };
    }

    async upgradePlan(tenantId: string, plan: Plan) {
        const activatedAt = new Date();
        const { error } = await this.db
            .from('subscriptions')
            .upsert({ 
                tenant_id: tenantId, 
                plan, 
                status: 'active',
                created_at: activatedAt.toISOString(),
                renewal_date: this.addDays(activatedAt, 30).toISOString(),
            });
        
        if (error) throw error;
    }

    async cancelSubscription(tenantId: string) {
        const { error } = await this.db
            .from('subscriptions')
            .update({ status: 'cancelled' })
            .eq('tenant_id', tenantId);
        
        if (error) throw error;
    }

    getLimit(plan: Plan, feature: 'sessions' | 'leads') {
        return this.planLimits[plan][feature];
    }

    hasFeature(plan: Plan, feature: string) {
        return this.planLimits[plan].features.includes(feature);
    }
}

export const subscriptionService = new SubscriptionService();
