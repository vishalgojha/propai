import { keyService } from './keyService';
import { getWorkspaceDefaultModel, getWorkspaceExplicitDefaultModel } from './workspaceSettingsService';
import { browserToolService } from './browserToolService';
import { getWhatsAppGateway } from '../channel-gateways/whatsapp/whatsappGatewayRegistry';
import { normalizePlanName, subscriptionService } from './subscriptionService';

type RuntimeSnapshot = {
    ai: {
        provider: 'Google' | 'Groq' | 'OpenRouter' | 'Doubleword';
        model: string;
        configured: boolean;
    };
    whatsapp: {
        status: 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
        connectedPhoneNumber: string | null;
        connectedOwnerName: string | null;
        activeCount: number;
        reconnectAttempts?: number;
    };
    browser: {
        available: boolean;
        liveBrowser: boolean;
    };
    subscription: {
        plan: string;
        sessionsLimit: number;
        trialDaysRemaining: number | null;
    };
};

function mapDefaultModelToProvider(defaultModel?: string | null) {
    const normalized = (defaultModel || '').trim().toLowerCase();

    switch (normalized) {
        case 'groq':
        case 'llama3-8b-8192':
        case 'groq llama3-8b-8192':
            return {
                provider: 'Groq' as const,
                model: process.env.GROQ_MODEL || 'llama3-8b-8192',
            };
        case 'openrouter':
        case 'openai/gpt-4o-mini':
        case 'openrouter openai/gpt-4o-mini':
            return {
                provider: 'OpenRouter' as const,
                model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
            };
        case 'doubleword':
        case 'qwen3-235b':
        case 'kimi-k2':
        case 'qwen/qwen3.6-35b-a3b-fp8':
            return {
                provider: 'Doubleword' as const,
                model: process.env.DOUBLEWORD_MODEL || 'Qwen/Qwen3.6-35B-A3B-FP8',
            };
        default:
            return {
                provider: 'Google' as const,
                model: process.env.GOOGLE_MODEL || 'gemini-2.5-flash',
            };
    }
}

export class RuntimeStatusService {
    async getSnapshot(tenantId: string): Promise<RuntimeSnapshot> {
        const defaultModel = await getWorkspaceDefaultModel(tenantId).catch(() => null);
        const [googleKey, groqKey, openRouterKey, doublewordKey, subscription] = await Promise.all([
            keyService.getKey(tenantId, 'Google').catch(() => null),
            keyService.getKey(tenantId, 'Groq').catch(() => null),
            keyService.getKey(tenantId, 'OpenRouter').catch(() => null),
            keyService.getKey(tenantId, 'Doubleword').catch(() => null),
            subscriptionService.getSubscription(tenantId).catch(() => ({
                plan: 'Trial' as const,
                status: 'trial',
                created_at: null,
                renewal_date: null,
                trial_days_remaining: null,
            })),
        ]);
        const explicitDefaultModel = await getWorkspaceExplicitDefaultModel(tenantId).catch(() => null);

        const aiSelection = mapDefaultModelToProvider(
            explicitDefaultModel || defaultModel,
        );

        const liveSessions = await getWhatsAppGateway(tenantId).getSessions(tenantId);
        const connectedSessions = liveSessions.filter((session) => session.status === 'connected');
        const connectingSessions = liveSessions.filter((session) => session.status === 'connecting');
        const primaryConnectedSession = connectedSessions[0] || null;
        const isReconnecting = liveSessions.some((s: any) => s.isReconnecting);

        const configured = aiSelection.provider === 'Google'
            ? Boolean(googleKey || process.env.GOOGLE_API_KEY)
            : aiSelection.provider === 'Groq'
                ? Boolean(groqKey || process.env.GROQ_API_KEY)
                : aiSelection.provider === 'OpenRouter'
                    ? Boolean(openRouterKey || process.env.OPENROUTER_API_KEY)
                    : Boolean(doublewordKey || process.env.DOUBLEWORD_API_KEY);

        const normalizedPlan = normalizePlanName(subscription.plan);
        return {
            ai: {
                provider: aiSelection.provider,
                model: aiSelection.model,
                configured,
            },
            whatsapp: {
                status: primaryConnectedSession
                    ? 'connected'
                    : connectingSessions.length > 0
                        ? isReconnecting ? 'reconnecting' : 'connecting'
                        : 'disconnected',
                connectedPhoneNumber: primaryConnectedSession?.phoneNumber || null,
                connectedOwnerName: primaryConnectedSession?.ownerName || null,
                activeCount: connectedSessions.length,
                reconnectAttempts: liveSessions.reduce((sum: number, s: any) => sum + (s.reconnectAttempts || 0), 0),
            },
            browser: {
                available: browserToolService.isAvailable(),
                liveBrowser: browserToolService.hasLiveBrowser(),
            },
            subscription: {
                plan: normalizedPlan,
                sessionsLimit: subscriptionService.getLimit(normalizedPlan, 'sessions'),
                trialDaysRemaining: subscription.trial_days_remaining ?? null,
            },
        };
    }
}

export const runtimeStatusService = new RuntimeStatusService();
