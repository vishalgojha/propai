import { supabase } from '../config/supabase';

export type Plan = 'Free' | 'Pro' | 'Team';

export interface Subscription {
    plan: Plan;
    status: string;
    renewal_date: string | null;
}

export class SubscriptionService {
    private planLimits = {
        Free: { sessions: 1, leads: 50, features: ['basic_parser'] },
        Pro: { sessions: 3, leads: Infinity, features: ['basic_parser', 'portal_posting', 'voice'] },
        Team: { sessions: 5, leads: Infinity, features: ['basic_parser', 'portal_posting', 'voice', 'priority_support'] },
    };

    async getSubscription(tenantId: string): Promise<Subscription> {
        const { data, error } = await supabase
            .from('subscriptions')
            .select('plan, status, renewal_date')
            .eq('tenant_id', tenantId)
            .single();

        if (error || !data) {
            // Return default Free plan if no record exists
            return { plan: 'Free', status: 'active', renewal_date: null };
        }

        return data;
    }

    async upgradePlan(tenantId: string, plan: Plan) {
        const { error } = await supabase
            .from('subscriptions')
            .upsert({ 
                tenant_id: tenantId, 
                plan, 
                status: 'active',
                created_at: new Date().toISOString()
            });
        
        if (error) throw error;
    }

    async cancelSubscription(tenantId: string) {
        const { error } = await supabase
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
