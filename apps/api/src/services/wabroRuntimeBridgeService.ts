import type {
    RuntimeBroadcastRequest,
    RuntimeSendMediaRequest,
    RuntimeSendMessageRequest,
    WhatsAppInboundMessagePayload,
    WhatsAppStatusPayload,
} from '../../../../packages/wabro-contracts';

type ProcessResult = {
    accepted: true;
    eventId: string;
    actions: Array<{
        type: 'no_reply';
        clientActionId: string;
        reason: string;
    }>;
    tags?: string[];
    updates?: Record<string, unknown>;
};

class IdempotencyStore {
    private readonly items = new Map<string, number>();
    private readonly ttlMs = 15 * 60 * 1000;

    remember(scope: string, key: string) {
        this.prune();
        const composite = `${scope}:${key}`;
        if (this.items.has(composite)) {
            return false;
        }
        this.items.set(composite, Date.now() + this.ttlMs);
        return true;
    }

    private prune() {
        const now = Date.now();
        for (const [key, expiresAt] of this.items.entries()) {
            if (expiresAt <= now) {
                this.items.delete(key);
            }
        }
    }
}

class WabroRuntimeBridgeService {
    private readonly idempotencyStore = new IdempotencyStore();

    acceptInboundEvent(payload: WhatsAppInboundMessagePayload): ProcessResult {
        this.idempotencyStore.remember('inbound', payload.eventId);
        return {
            accepted: true,
            eventId: payload.eventId,
            actions: [
                {
                    type: 'no_reply',
                    clientActionId: `no-reply:${payload.eventId}`,
                    reason: 'No PropAI automation has been configured for this inbound event yet.',
                },
            ],
            tags: [],
            updates: {
                workspaceId: payload.auth.workspaceId,
                sessionId: payload.auth.sessionId,
            },
        };
    }

    acceptStatusEvent(payload: WhatsAppStatusPayload) {
        this.idempotencyStore.remember('status', payload.eventId);
        return {
            accepted: true as const,
            eventId: payload.eventId,
        };
    }

    beginOutboundCommand(scope: 'send-message' | 'send-media' | 'broadcast', payload: RuntimeSendMessageRequest | RuntimeSendMediaRequest | RuntimeBroadcastRequest) {
        return this.idempotencyStore.remember(scope, payload.idempotencyKey);
    }
}

export const wabroRuntimeBridgeService = new WabroRuntimeBridgeService();
