import { WhatsAppClient } from './WhatsAppClient';
import { subscriptionService } from '../services/subscriptionService';
import { supabase } from '../config/supabase';

export class SessionManager {
    private clients: Map<string, WhatsAppClient> = new Map();
    private qrs: Map<string, string> = new Map();
    private systemQR: string | null = null;
    private systemStatus: string = 'initializing';

    async initSystemSession() {
        try {
            await this.createSession('system', 
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
                    ownerName: 'PropAI System' 
                }
            );
            console.log('PropAI System session initialized');
        } catch (e) {
            console.error('Failed to initialize system session:', e);
        }
    }

    getSystemQR(): string | null {
        return this.systemQR;
    }

    async getSystemStatus(): Promise<{ status: string; connected: boolean }> {
        const client = this.clients.get('system:System');
        return {
            status: this.systemStatus,
            connected: !!client
        };
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

        const sessionKey = options.label || 'Owner';
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
        const ownerSession = this.clients.get(`${tenantId}:Owner`);
        if (ownerSession) {
            return ownerSession;
        }

        const assistantSession = this.clients.get(`${tenantId}:Assistant`);
        if (assistantSession) {
            return assistantSession;
        }

        const allKeys = Array.from(this.clients.keys()).filter(k => k.startsWith(`${tenantId}:`));
        return allKeys.length > 0 ? this.clients.get(allKeys[0]) : undefined;
    }

    async getSessionForRemoteJid(tenantId: string, remoteJid: string) {
        const normalizedRemoteJid = String(remoteJid || '').trim();
        if (!normalizedRemoteJid) {
            return this.getSession(tenantId);
        }

        const table = normalizedRemoteJid.endsWith('@g.us') ? 'whatsapp_groups' : 'whatsapp_dm_permissions';
        const idColumn = normalizedRemoteJid.endsWith('@g.us') ? 'group_jid' : 'remote_jid';

        const { data, error } = await supabase
            .from(table)
            .select('session_label')
            .eq('tenant_id', tenantId)
            .eq(idColumn, normalizedRemoteJid)
            .maybeSingle();

        if (!error && data?.session_label) {
            const mappedSession = await this.getSession(tenantId, data.session_label);
            if (mappedSession) {
                return mappedSession;
            }
        }

        return this.getSession(tenantId);
    }

    async getAllSessionsForTenant(tenantId: string) {
        const allKeys = Array.from(this.clients.keys()).filter(k => k.startsWith(`${tenantId}:`));
        return allKeys.map(k => this.clients.get(k));
    }

    getQR(tenantId: string, sessionKey?: string) {
        const key = sessionKey ? `${tenantId}:${sessionKey}` : Array.from(this.qrs.keys()).find(k => k.startsWith(`${tenantId}:`));
        return this.qrs.get(key || '');
    }

    async removeSession(tenantId: string, sessionKey?: string) {
        const fullKey = sessionKey
            ? `${tenantId}:${sessionKey}`
            : Array.from(this.clients.keys()).find((key) => key.startsWith(`${tenantId}:`));

        if (!fullKey) {
            return;
        }

        const client = this.clients.get(fullKey);
        if (client) {
            await client.disconnect();
            this.clients.delete(fullKey);
            this.qrs.delete(fullKey);
        }
    }

    private async getTenantSessions(tenantId: string) {
        const { data } = await supabase
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
