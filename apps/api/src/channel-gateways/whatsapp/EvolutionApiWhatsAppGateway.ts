import type { WhatsAppGateway } from './WhatsAppGateway';
import type {
    WhatsAppBroadcastInput,
    WhatsAppBroadcastResult,
    WhatsAppConnectInput,
    WhatsAppConnectResult,
    WhatsAppCreateGroupInput,
    WhatsAppCreateGroupResult,
    WhatsAppDisconnectInput,
    WhatsAppGroupRecord,
    WhatsAppReconnectInput,
    WhatsAppReconnectResult,
    WhatsAppSendMessageInput,
    WhatsAppSessionSnapshot,
    WhatsAppStatusInput,
} from './types';

function buildInstanceName(workspaceOwnerId: string, sessionLabel: string): string {
    const raw = `propai_${workspaceOwnerId}_${sessionLabel}`;
    const allowed = raw.replace(/[^a-zA-Z0-9_]/g, '_');
    return allowed.slice(0, 40);
}

function mapConnectionState(state: string): string {
    const s = state.toLowerCase();
    if (s === 'open') return 'connected';
    if (s === 'connecting' || s === 'syncing') return 'connecting';
    return 'disconnected';
}

function getBaseUrl(): string {
    return String(process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
}

function getApiKey(): string {
    return String(process.env.EVOLUTION_API_KEY || '');
}

function getWebhookUrl(): string {
    const base = String(process.env.EVOLUTION_WEBHOOK_BASE_URL || process.env.API_BASE_URL || 'https://api.propai.live').replace(/\/+$/, '');
    return `${base}/webhook/evolution`;
}

async function evolutionFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const baseUrl = getBaseUrl();
    const apiKey = getApiKey();
    const url = `${baseUrl}${path}`;
    return fetch(url, {
        ...options,
        headers: {
            'apiKey': apiKey,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
}

function randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class EvolutionApiWhatsAppGateway implements WhatsAppGateway {
    async connect(input: WhatsAppConnectInput): Promise<WhatsAppConnectResult> {
        const instanceName = buildInstanceName(input.workspaceOwnerId, input.sessionLabel);
        const webhookUrl = getWebhookUrl();
        const createResponse = await evolutionFetch('/instance/create', {
            method: 'POST',
            body: JSON.stringify({
                instanceName,
                qrcode: true,
                integration: 'WHATSAPP-BAILEYS',
                rejectCall: false,
                groupsIgnore: false,
                alwaysOnline: true,
                readMessages: true,
                readStatus: true,
                syncFullHistory: true,
                webhook: webhookUrl,
                webhookByEvents: true,
                events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
            }),
        });
        if (!createResponse.ok) {
            const body = await createResponse.text().catch(() => '');
            throw new Error(`Evolution API instance creation failed (${createResponse.status}): ${body || createResponse.statusText}`);
        }
        await evolutionFetch(`/instance/setWebhook/${encodeURIComponent(instanceName)}`, {
            method: 'POST',
            body: JSON.stringify({
                webhook: getWebhookUrl(),
                webhookByEvents: true,
                events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
            }),
        }).catch(() => undefined);
        const qrResponse = await evolutionFetch(`/instance/connect/${encodeURIComponent(instanceName)}`);
        if (!qrResponse.ok) {
            const body = await qrResponse.text().catch(() => '');
            throw new Error(`Evolution API QR fetch failed (${qrResponse.status}): ${body || qrResponse.statusText}`);
        }
        const qrData = await qrResponse.json() as Record<string, unknown>;
        const base64 = String(qrData?.base64 || qrData?.qrcode || qrData?.qr || '');
        return {
            artifact: {
                mode: 'qr',
                format: 'text',
                value: base64,
            },
            mode: 'qr',
            connected: false,
        };
    }

    async disconnect(input: WhatsAppDisconnectInput): Promise<void> {
        const instanceName = buildInstanceName(input.workspaceOwnerId, input.sessionLabel || 'main');
        const response = await evolutionFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, {
            method: 'DELETE',
        });
        if (!response.ok && response.status !== 404) {
            const body = await response.text().catch(() => '');
            throw new Error(`Evolution API disconnect failed (${response.status}): ${body || response.statusText}`);
        }
    }

    async sendMessage(input: WhatsAppSendMessageInput): Promise<void> {
        const instanceName = buildInstanceName(input.workspaceOwnerId, input.sessionLabel || 'main');
        const remoteJid = input.remoteJid.includes('@') ? input.remoteJid : `${input.remoteJid}@s.whatsapp.net`;
        const response = await evolutionFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, {
            method: 'POST',
            body: JSON.stringify({
                number: remoteJid,
                text: input.text,
                delay: 1200,
            }),
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`Evolution API sendMessage failed (${response.status}): ${body || response.statusText}`);
        }
    }

    async broadcastToGroups(input: WhatsAppBroadcastInput): Promise<WhatsAppBroadcastResult> {
        const sent: string[] = [];
        const failed: Array<{ groupId: string; error: string }> = [];
        const instanceName = buildInstanceName(input.workspaceOwnerId, input.sessionLabel || 'main');
        const batchSize = input.batchSize || 10;
        const delayBetweenMessages = input.delayBetweenMessages
            ? () => input.delayBetweenMessages!
            : () => randomDelay(1500, 4000);
        const delayBetweenBatches = input.delayBetweenBatches || 5000;

        for (let i = 0; i < input.groupJids.length; i++) {
            const groupJid = input.groupJids[i];
            try {
                const remoteJid = groupJid.includes('@') ? groupJid : `${groupJid}@g.us`;
                const response = await evolutionFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, {
                    method: 'POST',
                    body: JSON.stringify({
                        number: remoteJid,
                        text: input.text,
                        delay: 1200,
                    }),
                });
                if (response.ok) {
                    sent.push(groupJid);
                } else {
                    const body = await response.text().catch(() => '');
                    failed.push({ groupId: groupJid, error: body || `HTTP ${response.status}` });
                }
            } catch (error) {
                failed.push({ groupId: groupJid, error: error instanceof Error ? error.message : String(error) });
            }
            if (i < input.groupJids.length - 1) {
                await delay(delayBetweenMessages());
            }
            if ((i + 1) % batchSize === 0 && i < input.groupJids.length - 1) {
                await delay(delayBetweenBatches);
            }
        }

        return { sent, failed };
    }

    async createGroup(input: WhatsAppCreateGroupInput): Promise<WhatsAppCreateGroupResult> {
        const instanceName = buildInstanceName(input.workspaceOwnerId, input.sessionLabel || 'main');
        const participants = input.participants.map((p) => (p.includes('@') ? p : `${p}@s.whatsapp.net`));
        const response = await evolutionFetch(`/group/create/${encodeURIComponent(instanceName)}`, {
            method: 'POST',
            body: JSON.stringify({
                subject: input.subject,
                participants,
            }),
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`Evolution API createGroup failed (${response.status}): ${body || response.statusText}`);
        }
        const data = await response.json() as Record<string, unknown>;
        const groupData = (data?.group || data?.data || data) as Record<string, unknown>;
        return {
            groupJid: String(groupData?.jid || groupData?.id || groupData?.groupId || ''),
            groupName: String(groupData?.subject || groupData?.name || input.subject),
            raw: data,
        };
    }

    async getStatus(input: WhatsAppStatusInput): Promise<WhatsAppSessionSnapshot | null> {
        const instanceName = buildInstanceName(input.workspaceOwnerId, input.sessionLabel || 'main');
        const response = await evolutionFetch(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
        if (response.status === 404) return null;
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`Evolution API getStatus failed (${response.status}): ${body || response.statusText}`);
        }
        const data = await response.json() as Record<string, unknown>;
        const instance = (data?.instance || {}) as Record<string, unknown>;
        const state = String(data?.state || instance?.state || data?.status || 'disconnected');
        return {
            label: input.sessionLabel || 'main',
            status: mapConnectionState(state),
            phoneNumber: String(data?.phone || data?.number || data?.phoneNumber || ''),
            ownerName: String(data?.name || data?.owner || ''),
        };
    }

    async getQRCode(input: WhatsAppStatusInput): Promise<string | null> {
        const instanceName = buildInstanceName(input.workspaceOwnerId, input.sessionLabel || 'main');
        const response = await evolutionFetch(`/instance/connect/${encodeURIComponent(instanceName)}`);
        if (!response.ok) return null;
        const data = await response.json() as Record<string, unknown>;
        return String(data?.base64 || data?.qrcode || data?.qr || '') || null;
    }

    async listGroups(input: { workspaceOwnerId: string; sessionLabel: string }): Promise<WhatsAppGroupRecord[]> {
        const instanceName = buildInstanceName(input.workspaceOwnerId, input.sessionLabel);
        const response = await evolutionFetch(`/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`);
        if (!response.ok) return [];
        const data = await response.json() as Record<string, unknown>;
        const groups = Array.isArray(data) ? data : (Array.isArray((data as any)?.groups) ? (data as any).groups : []);
        return groups.map((g: Record<string, unknown>) => ({
            id: String(g?.id || g?.jid || g?.groupId || ''),
            name: String(g?.name || g?.subject || g?.groupName || ''),
            participantsCount: typeof g?.participantsCount === 'number' ? g.participantsCount : undefined,
        }));
    }

    async forceReconnect(input: WhatsAppReconnectInput): Promise<WhatsAppReconnectResult> {
        const instanceName = buildInstanceName(input.workspaceOwnerId, input.sessionLabel || 'main');
        const response = await evolutionFetch(`/instance/restart/${encodeURIComponent(instanceName)}`, {
            method: 'POST',
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`Evolution API restart failed (${response.status}): ${body || response.statusText}`);
        }
        return {
            label: input.sessionLabel || 'main',
            message: `Evolution API instance "${instanceName}" restart initiated`,
        };
    }

    async getSessions(workspaceOwnerId: string): Promise<WhatsAppSessionSnapshot[]> {
        const response = await evolutionFetch('/instance/fetchInstances');
        if (!response.ok) return [];
        const data = await response.json() as unknown[];
        const instances = Array.isArray(data) ? data : [];
        const prefix = `propai_${workspaceOwnerId}_`;
        return instances
            .filter((inst: any) => String(inst?.instance?.instanceName || inst?.name || '').startsWith(prefix))
            .map((inst: any) => {
                const name = String(inst?.instance?.instanceName || inst?.name || '');
                const label = name.startsWith(prefix) ? name.slice(prefix.length) : name;
                return {
                    label,
                    status: mapConnectionState(String(inst?.instance?.state || inst?.state || 'disconnected')),
                    phoneNumber: String(inst?.phone || inst?.number || ''),
                    ownerName: String(inst?.owner || inst?.name || ''),
                };
            });
    }
}
