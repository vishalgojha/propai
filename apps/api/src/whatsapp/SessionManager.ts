import { WhatsAppClient } from './WhatsAppClient';
import { subscriptionService } from '../services/subscriptionService';

export class SessionManager {
    private clients: Map<string, WhatsAppClient> = new Map();
    private qrs: Map<string, string> = new Map();

    async initSystemSession() {
        // Initialize the 'system' session used for verification and alerts
        try {
            await this.createSession('system', () => {}, () => {}, { 
                label: 'System', 
                ownerName: 'PropAI System' 
            });
            console.log('PropAI System session initialized');
        } catch (e) {
            console.error('Failed to initialize system session:', e);
        }
    }

    async createSession(tenantId: string, onQR: (qr: string) => void, onConnectionUpdate: (status: string) => void, options: { usePairingCode?: string, label?: string, ownerName?: string } = {}) {
        if (tenantId !== 'system') {
            const subscription = await subscriptionService.getSubscription(tenantId);
            const limit = subscriptionService.getLimit(subscription.plan, 'sessions');
            
            const currentSessions = await this.getTenantSessions(tenantId);
            if (currentSessions.length >= limit) {
                throw new Error(`Plan limit reached. Your ${subscription.plan} plan allows max ${limit} sessions.`);
            }
        }

        const sessionKey = options.usePairingCode || options.label || 'Owner';
        const fullKey = `${tenantId}:${sessionKey}`;

        if (this.clients.has(fullKey)) {
            return this.clients.get(fullKey);
        }

        const client = new WhatsAppClient({
            tenantId,
            onQR: (qr) => {
                this.qrs.set(fullKey, qr);
                onQR(qr);
            },
            onConnectionUpdate: (status) => {
                this.qrs.delete(fullKey);
                onConnectionUpdate(status);
            },
            label: options.label || 'Owner',
            ownerName: options.ownerName
        });

        await client.connect(options);
        this.clients.set(fullKey, client);
        return client;
    }

    async getSession(tenantId: string, sessionKey?: string) {
        if (sessionKey) {
            return this.clients.get(`${tenantId}:${sessionKey}`);
        }
        // Default to first session if not specified
        const allKeys = Array.from(this.clients.keys()).filter(k => k.startsWith(`${tenantId}:`));
        return allKeys.length > 0 ? this.clients.get(allKeys[0]) : undefined;
    }

    async getAllSessionsForTenant(tenantId: string) {
        const allKeys = Array.from(this.clients.keys()).filter(k => k.startsWith(`${tenantId}:`));
        return allKeys.map(k => this.clients.get(k));
    }

    getQR(tenantId: string, sessionKey?: string) {
        const key = sessionKey ? `${tenantId}:${sessionKey}` : Array.from(this.qrs.keys()).find(k => k.startsWith(`${tenantId}:`));
        return this.qrs.get(key || '');
    }

    async removeSession(tenantId: string, sessionKey: string) {
        const fullKey = `${tenantId}:${sessionKey}`;
        const client = this.clients.get(fullKey);
        if (client) {
            await client.disconnect();
            this.clients.delete(fullKey);
            this.qrs.delete(fullKey);
        }
    }

    private async getTenantSessions(tenantId: string) {
        // Check Supabase for persisted sessions
        const { data } = await (require('../config/supabase').supabase)
            .from('whatsapp_sessions')
            .select('id')
            .eq('tenant_id', tenantId);
        return data || [];
    }

    getAllSessions() {
        return Array.from(this.clients.keys());
    }
}

export const sessionManager = new SessionManager();
