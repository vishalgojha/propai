import { normalizePlanName, subscriptionService } from './subscriptionService';

export const STREAM_ACCESS_DENIED_MESSAGE = 'Stream access requires an active Starter or Pro plan.';

export type StreamAccess = {
    plan: ReturnType<typeof normalizePlanName>;
    canViewStream: boolean;
    networkMode: boolean;
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
