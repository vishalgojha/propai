import { normalizePlanName, subscriptionService } from './subscriptionService';

export const STREAM_ACCESS_DENIED_MESSAGE = 'Stream access requires an active Starter or Pro plan.';

export type StreamAccess = {
    plan: ReturnType<typeof normalizePlanName>;
    canViewStream: boolean;
    networkMode: boolean;
    deniedMessage?: string;
};

export async function resolveStreamAccess(tenantId: string, email?: string | null): Promise<StreamAccess> {
    const subscription = await subscriptionService.getSubscription(tenantId, email);
    const plan = normalizePlanName(subscription.plan);

    return {
        plan,
        canViewStream: plan !== 'Trial',
        networkMode: plan === 'Pro',
    };
}

    if (!supabaseAdmin) {
        return false;
    }

    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('app_role')
        .eq('id', tenantId)
        .maybeSingle();

    if (error) {
        return false;
    }

    return data?.app_role === 'super_admin';
}

export async function resolveStreamAccess(tenantId: string, email?: string | null): Promise<StreamAccess> {
    const subscription = await subscriptionService.getSubscription(tenantId, email);
    const plan = normalizePlanName(subscription.plan);
    return {
        plan,
        canViewStream: plan !== 'Trial',
        networkMode: plan === 'Pro',
    };
}
