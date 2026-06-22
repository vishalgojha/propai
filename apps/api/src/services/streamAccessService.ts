import { normalizePlanName, subscriptionService } from './subscriptionService';

export type StreamAccess = {
    plan: string;
    canViewStream: boolean;
    networkMode: boolean;
};

export async function resolveStreamAccess(tenantId: string, email?: string | null): Promise<StreamAccess> {
    const subscription = await subscriptionService.getSubscription(tenantId, email);
    const plan = normalizePlanName(subscription.plan);
    const sharedStreamEnabled = String(process.env.STREAM_NETWORK_MODE_ENABLED || '').trim().toLowerCase() === 'true';
    const isOwnerSuperAdmin = await subscriptionService.isOwnerSuperAdmin(tenantId, email).catch(() => false);

    return {
        plan,
        canViewStream: true,
        networkMode: isOwnerSuperAdmin || sharedStreamEnabled,
    };
}
