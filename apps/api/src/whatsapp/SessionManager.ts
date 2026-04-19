import { WhatsAppClient } from './WhatsAppClient';

export class SessionManager {
    private clients: Map<string, WhatsAppClient> = new Map();
    private qrs: Map<string, string> = new Map();

    async createSession(tenantId: string, onQR: (qr: string) => void, onConnectionUpdate: (status: string) => void) {
        if (this.clients.has(tenantId)) {
            return this.clients.get(tenantId);
        }

        const client = new WhatsAppClient({
            tenantId,
            onQR: (qr) => {
                this.qrs.set(tenantId, qr);
                onQR(qr);
            },
            onConnectionUpdate: (status) => {
                this.qrs.delete(tenantId);
                onConnectionUpdate(status);
            },
        });

        await client.connect();
        this.clients.set(tenantId, client);
        return client;
    }

    async getSession(tenantId: string) {
        return this.clients.get(tenantId);
    }

    getQR(tenantId: string) {
        return this.qrs.get(tenantId);
    }

    async removeSession(tenantId: string) {
        const client = this.clients.get(tenantId);
        if (client) {
            await client.disconnect();
            this.clients.delete(tenantId);
            this.qrs.delete(tenantId);
        }
    }

    getAllSessions() {
        return Array.from(this.clients.keys());
    }
}

export const sessionManager = new SessionManager();
