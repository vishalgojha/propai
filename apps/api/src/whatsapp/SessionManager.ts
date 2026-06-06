import { PropAISupabaseAdapter } from './PropAISupabaseAdapter';
import { createPropAIRuntimeHooks } from './propaiRuntimeHooks';
import { subscriptionService } from '../services/subscriptionService';
import { WhatsAppClient } from './WhatsAppClient';
import type {
    SessionCreateOptions,
    SessionRecord,
    SessionSnapshot,
    WhatsAppRuntimeHooks,
} from '@vishalgojha/whatsapp-baileys-runtime';

type SessionCallbacks = {
    onQR: (qr: string) => void;
    onConnectionUpdate: (status: string) => void;
};

type CreateSessionOptions = {
    usePairingCode?: string;
    phoneNumber?: string;
    label?: string;
    ownerName?: string;
    skipLimitCheck?: boolean;
};

export class SessionManager {
    private readonly storage = new PropAISupabaseAdapter();
    private readonly hooks: WhatsAppRuntimeHooks;
    private readonly clients = new Map<string, WhatsAppClient>();
    private readonly callbacks = new Map<string, SessionCallbacks>();
    private readonly qrs = new Map<string, string>();
    private systemQR: string | null = null;
    private systemStatus = 'initializing';
    private rehydrationPromise: Promise<void> | null = null;

    constructor() {
        const productHooks = createPropAIRuntimeHooks();
        this.hooks = {
            ...productHooks,
            onQR: async (event) => {
                const fullKey = `${event.tenantId}:${event.label}`;
                this.qrs.set(fullKey, event.qr);
                if (event.tenantId === 'system') {
                    this.systemQR = event.qr;
                }
                this.callbacks.get(fullKey)?.onQR(event.qr);
                await productHooks.onQR?.(event);
            },
            onConnectionUpdate: async (event) => {
                const fullKey = `${event.tenantId}:${event.label}`;
                if (event.status === 'connected' || event.status === 'disconnected') {
                    this.qrs.delete(fullKey);
                    if (event.tenantId === 'system') {
                        this.systemQR = null;
                    }
                }

                if (event.tenantId === 'system') {
                    this.systemStatus = event.status;
                }

                this.callbacks.get(fullKey)?.onConnectionUpdate(event.status);
                await productHooks.onConnectionUpdate?.(event);
            },
        };
    }

    async initSystemSession() {
        try {
            await this.createSession(
                'system',
                (qr) => {
                    this.systemQR = qr;
                    console.log('System session QR generated');
                },
                (status) => {
                    this.systemStatus = status;
                    console.log('System session status:', status);
                },
                {
                    label: 'System',
                    ownerName: 'PropAI System',
                },
            );
            console.log('PropAI System session initialized');
        } catch (error) {
            console.error('Failed to initialize system session:', error);
        }
    }

    async rehydratePersistedSessions() {
        if (this.rehydrationPromise) {
            return this.rehydrationPromise;
        }

        this.rehydrationPromise = (async () => {
            let sessions: SessionRecord[] = [];

            try {
                sessions = await this.storage.loadPersistedSessions();
            } catch (error) {
                await this.hooks.onError?.({
                    tenantId: 'system',
                    label: 'rehydration',
                    error,
                    stage: 'rehydrate.loadPersistedSessions',
                });
                return;
            }

            for (const session of sessions) {
                const fullKey = `${session.tenantId}:${session.label}`;
                if (this.clients.has(fullKey)) {
                    continue;
                }

                try {
                    await this.createSession(session.tenantId, () => {}, () => {}, {
                        label: session.label,
                        ownerName: session.ownerName || undefined,
                        phoneNumber: session.phoneNumber || undefined,
                        skipLimitCheck: true,
                    });
                } catch (error) {
                    await this.hooks.onError?.({
                        tenantId: session.tenantId,
                        label: session.label,
                        error,
                        stage: 'rehydrate.session',
                    });
                }
            }
        })();

        try {
            await this.rehydrationPromise;
        } finally {
            this.rehydrationPromise = null;
        }
    }

    getSystemQR(): string | null {
        return this.systemQR;
    }

    async getSystemStatus(): Promise<{ status: string; connected: boolean }> {
        const client = await this.getSession('system', 'System');
        return {
            status: this.systemStatus,
            connected: Boolean(client),
        };
    }

    async createSession(
        tenantId: string,
        onQR: (qr: string) => void,
        onConnectionUpdate: (status: string) => void,
        options: CreateSessionOptions = {},
    ) {
        const sessionKey = options.label || options.usePairingCode || 'Owner';
        const fullKey = `${tenantId}:${sessionKey}`;

        const existingClient = this.clients.get(fullKey);
        if (existingClient) {
            this.callbacks.set(fullKey, { onQR, onConnectionUpdate });
            const snapshot = existingClient.getStatusSnapshot();
            if (snapshot.status === 'connected') {
                const existingQR = this.qrs.get(fullKey);
                if (existingQR) {
                    onQR(existingQR);
                }
                return existingClient;
            }

            if (snapshot.status === 'connecting' || snapshot.isReconnecting) {
                if (options.usePairingCode) {
                    this.qrs.delete(fullKey);
                    await existingClient.restartTransport({
                        usePairingCode: options.usePairingCode,
                        phoneNumber: options.phoneNumber || snapshot.phoneNumber || undefined,
                    });
                    const refreshedQR = this.qrs.get(fullKey);
                    if (refreshedQR) {
                        onQR(refreshedQR);
                    }
                }
                return existingClient;
            }

            if (snapshot.status === 'disconnected') {
                this.qrs.delete(fullKey);
                await existingClient.restartTransport({
                    usePairingCode: options.usePairingCode,
                    phoneNumber: options.phoneNumber,
                });
                const refreshedQR = this.qrs.get(fullKey);
                if (refreshedQR) {
                    onQR(refreshedQR);
                }
                return existingClient;
            }
        }

        if (!options.skipLimitCheck) {
            const existingSessions = await this.storage.loadPersistedSessions();
            const sameTenantSessions = existingSessions.filter((session) => session.tenantId === tenantId);
            const otherSessions = sameTenantSessions.filter((session) => session.label !== sessionKey);
            const subscription = await subscriptionService.getSubscription(tenantId);
            const limit = await subscriptionService.getLimitForTenant(tenantId, subscription.plan, 'sessions');

            if (otherSessions.length >= limit) {
                throw new Error(`Plan limit reached. Your ${subscription.plan} plan allows max ${limit} sessions.`);
            }
        }

        this.callbacks.set(fullKey, { onQR, onConnectionUpdate });

        const client = new WhatsAppClient({
            tenantId,
            storage: this.storage,
            hooks: this.hooks,
            label: options.label || 'Owner',
            ownerName: options.ownerName,
            phoneNumber: options.phoneNumber,
            usePairingCode: options.usePairingCode,
            skipLimitCheck: options.skipLimitCheck,
        } satisfies SessionCreateOptions & { tenantId: string; storage: PropAISupabaseAdapter; hooks: WhatsAppRuntimeHooks });

        await client.connect({
            usePairingCode: options.usePairingCode,
            phoneNumber: options.phoneNumber,
        });

        this.clients.set(fullKey, client);
        const existingQR = this.qrs.get(fullKey);
        if (existingQR) {
            onQR(existingQR);
        }

        return client;
    }

    async getSession(tenantId: string, sessionKey?: string) {
        if (sessionKey) {
            return this.clients.get(`${tenantId}:${sessionKey}`);
        }

        const snapshots = this.getLiveSessionSnapshots(tenantId);
        const connectedSession = snapshots.find((snapshot) => snapshot.status === 'connected');
        if (connectedSession) {
            return this.clients.get(`${tenantId}:${connectedSession.label}`);
        }

        const allKeys = Array.from(this.clients.keys()).filter((key) => key.startsWith(`${tenantId}:`));
        return allKeys.length > 0 ? this.clients.get(allKeys[0]) : undefined;
    }

    async getAllSessionsForTenant(tenantId: string) {
        const allKeys = Array.from(this.clients.keys()).filter((key) => key.startsWith(`${tenantId}:`));
        return allKeys
            .map((key) => this.clients.get(key))
            .filter((client): client is WhatsAppClient => Boolean(client));
    }

    getLiveSessionSnapshots(tenantId: string): SessionSnapshot[] {
        const allKeys = Array.from(this.clients.keys()).filter((key) => key.startsWith(`${tenantId}:`));
        return allKeys
            .map((key) => this.clients.get(key))
            .filter(Boolean)
            .map((client) => client!.getStatusSnapshot());
    }

    getQR(tenantId: string, sessionKey?: string) {
        const key = sessionKey
            ? `${tenantId}:${sessionKey}`
            : Array.from(this.qrs.keys()).find((entry) => entry.startsWith(`${tenantId}:`));
        return this.qrs.get(key || '');
    }

    async forceReconnect(tenantId: string, sessionKey?: string) {
        const fullKey = sessionKey
            ? `${tenantId}:${sessionKey}`
            : Array.from(this.clients.keys()).find((key) => key.startsWith(`${tenantId}:`));

        if (!fullKey) {
            throw new Error('No active session found to refresh');
        }

        const client = this.clients.get(fullKey);
        if (!client) {
            throw new Error('Session client not found');
        }

        // Preserve UI/runtime callbacks while recycling the live transport.
        const callbacks = this.callbacks.get(fullKey) || { onQR: () => {}, onConnectionUpdate: () => {} };
        const snapshot = client.getStatusSnapshot();
        this.qrs.delete(fullKey);

        await client.restartTransport({
            phoneNumber: snapshot.phoneNumber || undefined,
        });

        this.callbacks.set(fullKey, callbacks);

        const sessionParts = fullKey.split(':');
        const label = sessionParts[1] || snapshot.label || 'Owner';

        return { label, message: 'Session refreshed, reconnecting...' };
    }

    async removeSession(tenantId: string, sessionKey?: string) {
        const foundKey = sessionKey
            ? `${tenantId}:${sessionKey}`
            : Array.from(this.clients.keys()).find((key) => key.startsWith(`${tenantId}:`));

        if (!foundKey) {
            return;
        }

        const client = this.clients.get(foundKey);
        if (!client) {
            return;
        }

        try {
            await client.disconnect();
        } catch (error) {
            await this.storage.deleteSession?.({
                tenantId,
                label: client.getStatusSnapshot().label,
            });
            await this.hooks.onError?.({
                tenantId,
                label: client.getStatusSnapshot().label,
                error,
                stage: 'removeSession.disconnect',
            });
        } finally {
            this.clients.delete(foundKey);
            this.callbacks.delete(foundKey);
            this.qrs.delete(foundKey);
        }
    }

    async hardResetSession(tenantId: string, sessionKey?: string) {
        const foundKey = sessionKey
            ? `${tenantId}:${sessionKey}`
            : Array.from(this.clients.keys()).find((key) => key.startsWith(`${tenantId}:`));

        if (foundKey) {
            const client = this.clients.get(foundKey);
            if (client) {
                try {
                    await client.disconnect();
                } catch {
                    // Ignore disconnect errors during hard reset
                }
                this.clients.delete(foundKey);
                this.callbacks.delete(foundKey);
                this.qrs.delete(foundKey);
            }
        }

        if (sessionKey) {
            await this.storage.deleteSession?.({ tenantId, label: sessionKey });
        }
    }

    getAllSessions(): SessionRecord[] {
        return Array.from(this.clients.entries()).map(([key, client]) => {
            const separatorIndex = key.indexOf(':');
            const tenantId = separatorIndex >= 0 ? key.slice(0, separatorIndex) : key;
            const snapshot = client.getStatusSnapshot();
            return {
                tenantId,
                label: snapshot.label,
                ownerName: snapshot.ownerName,
                phoneNumber: snapshot.phoneNumber,
                status: snapshot.status,
            };
        });
    }

    async disconnectAllSessions() {
        const disconnectPromises = Array.from(this.clients.entries()).map(async ([key, client]) => {
            try {
                await client.disconnect();
            } catch (error) {
                console.error(`[SessionManager] Error disconnecting ${key}:`, error);
            }
        });
        await Promise.allSettled(disconnectPromises);
        this.clients.clear();
        this.callbacks.clear();
        this.qrs.clear();
    }
}

export const sessionManager = new SessionManager();
