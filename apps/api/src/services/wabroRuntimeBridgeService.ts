import type {
    RuntimeBroadcastRequest,
    RuntimeSendMediaRequest,
    RuntimeSendMessageRequest,
    WhatsAppInboundMessagePayload,
    WhatsAppStatusPayload,
} from '../contracts/wabroContracts';

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

    acceptInboundEvent(payload: WhatsAppInboundMessagePayload) {
        return this.idempotencyStore.remember('inbound', payload.eventId);
    }

    acceptStatusEvent(payload: WhatsAppStatusPayload) {
        return this.idempotencyStore.remember('status', payload.eventId);
    }

    beginOutboundCommand(scope: 'send-message' | 'send-media' | 'broadcast', payload: RuntimeSendMessageRequest | RuntimeSendMediaRequest | RuntimeBroadcastRequest) {
        return this.idempotencyStore.remember(scope, payload.idempotencyKey);
    }
}

export const wabroRuntimeBridgeService = new WabroRuntimeBridgeService();
