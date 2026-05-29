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
    const canViewStream = plan !== 'Trial';
    const sharedStreamEnabled = String(process.env.STREAM_NETWORK_MODE_ENABLED || '').trim().toLowerCase() === 'true';
    const isOwnerSuperAdmin = await subscriptionService.isOwnerSuperAdmin(tenantId, email).catch(() => false);

    return {
        plan,
        canViewStream,
        networkMode: isOwnerSuperAdmin || (canViewStream && sharedStreamEnabled),
    };
}
