import { supabaseAdmin } from '../config/supabase';
import { isOwnerSuperAdminEmail } from '../utils/controllerHelpers';
import { normalizePlanName, subscriptionService } from './subscriptionService';

export const STREAM_ACCESS_DENIED_MESSAGE = 'Stream access requires an active Starter or Pro plan.';
export const STREAM_SUPER_ADMIN_DENIED_MESSAGE = 'Stream access is not available for super admins.';

export type StreamAccess = {
    plan: ReturnType<typeof normalizePlanName>;
    canViewStream: boolean;
    networkMode: boolean;
    deniedMessage?: string;
};

async function isSuperAdminTenant(tenantId: string, email?: string | null) {
    if (isOwnerSuperAdminEmail(email)) {
        return true;
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
    const isSuperAdmin = await isSuperAdminTenant(tenantId, email);

    if (isSuperAdmin) {
        return {
            plan,
            canViewStream: false,
            networkMode: false,
            deniedMessage: STREAM_SUPER_ADMIN_DENIED_MESSAGE,
        };
    }

    return {
        plan,
        canViewStream: plan !== 'Trial',
        networkMode: plan === 'Pro',
    };
}
