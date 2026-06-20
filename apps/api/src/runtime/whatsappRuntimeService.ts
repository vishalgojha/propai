import { stubSessionManager } from '../whatsapp/stubSessionManager';
import { whatsappHealthService } from '../services/whatsappHealthService';

export class WhatsAppRuntimeService {
    private started = false;
    private startPromise: Promise<void> | null = null;

    async start() {
        if (this.started) return;
        if (this.startPromise) return this.startPromise;

        this.startPromise = (async () => {
            whatsappHealthService.startHeartbeatLoop(stubSessionManager);
            this.started = true;
            console.log('[startup] WhatsApp runtime initialization complete (Cloud API mode).');
        })();

        try {
            await this.startPromise;
        } finally {
            this.startPromise = null;
        }
    }

    async stop() {
        whatsappHealthService.stopHeartbeatLoop();
        this.started = false;
    }
}

export function createWhatsAppRuntimeService() {
    return new WhatsAppRuntimeService();
}

