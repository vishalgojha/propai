import { sessionManager } from '../whatsapp/SessionManager';
import { whatsappHealthService } from '../services/whatsappHealthService';

type WhatsAppRuntimeServiceOptions = {
    enableSystemSession: boolean;
    startupTimeoutMs?: number;
};

export class WhatsAppRuntimeService {
    private readonly startupTimeoutMs: number;
    private readonly enableSystemSession: boolean;
    private started = false;
    private startPromise: Promise<void> | null = null;

    constructor(options: WhatsAppRuntimeServiceOptions) {
        this.enableSystemSession = options.enableSystemSession;
        this.startupTimeoutMs = options.startupTimeoutMs ?? 60_000;
    }

    async start() {
        if (this.started) {
            return;
        }

        if (this.startPromise) {
            return this.startPromise;
        }

        this.startPromise = (async () => {
            const startupDeadline = Date.now() + this.startupTimeoutMs;

            whatsappHealthService.startHeartbeatLoop(sessionManager);

            try {
                console.log('[startup] Rehydrating WhatsApp sessions...');
                await Promise.race([
                    sessionManager.rehydratePersistedSessions(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Session rehydration timed out')), Math.max(0, startupDeadline - Date.now()))),
                ]);
                console.log('[startup] Sessions rehydrated.');
            } catch (error) {
                console.error('[startup] Session rehydration error (server remains running):', error);
            }

            if (Date.now() > startupDeadline) {
                console.warn('[startup] Startup deadline exceeded, skipping remaining WhatsApp runtime tasks.');
                this.started = true;
                return;
            }

            if (this.enableSystemSession) {
                void sessionManager.initSystemSession().catch((error) => {
                    console.error('[startup] Failed to initialize system WhatsApp session:', error);
                });
            } else {
                console.log('[startup] System WhatsApp session disabled.');
            }

            this.started = true;
            console.log('[startup] WhatsApp runtime initialization complete.');
        })();

        try {
            await this.startPromise;
        } finally {
            this.startPromise = null;
        }
    }

    async stop() {
        whatsappHealthService.stopHeartbeatLoop();

        try {
            await sessionManager.disconnectAllSessions();
            console.log('[shutdown] All WhatsApp sessions disconnected.');
        } catch (error) {
            console.error('[shutdown] Error disconnecting WhatsApp sessions:', error);
        } finally {
            this.started = false;
        }
    }
}

export function createWhatsAppRuntimeService(options: WhatsAppRuntimeServiceOptions) {
    return new WhatsAppRuntimeService(options);
}

