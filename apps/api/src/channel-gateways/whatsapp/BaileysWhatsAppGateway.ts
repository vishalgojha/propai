import { sessionManager } from '../../whatsapp/SessionManager';
import type { WhatsAppGateway } from './WhatsAppGateway';
import type {
    WhatsAppBroadcastInput,
    WhatsAppBroadcastResult,
    WhatsAppConnectInput,
    WhatsAppConnectMode,
    WhatsAppConnectResult,
    WhatsAppConnectionArtifact,
    WhatsAppDisconnectInput,
    WhatsAppGroupRecord,
    WhatsAppReconnectInput,
    WhatsAppReconnectResult,
    WhatsAppSendMessageInput,
    WhatsAppSessionSnapshot,
    WhatsAppStatusInput,
} from './types';

type RuntimeGroup = {
    id?: string | null;
    name?: string | null;
    participantsCount?: number | null;
};

type RuntimeSnapshot = {
    label?: string | null;
    status?: string | null;
    phoneNumber?: string | null;
    ownerName?: string | null;
};

function buildArtifact(mode: WhatsAppConnectMode, value?: string | null): WhatsAppConnectionArtifact {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return null;
    }

    return {
        mode,
        format: 'text',
        value: normalized,
    };
}

export class BaileysWhatsAppGateway implements WhatsAppGateway {
    async connect(input: WhatsAppConnectInput): Promise<WhatsAppConnectResult> {
        await sessionManager.createSession(
            input.workspaceOwnerId,
            () => {},
            () => {},
            {
                label: input.sessionLabel,
                ownerName: input.ownerName,
                phoneNumber: input.phoneNumber,
                usePairingCode: input.mode === 'pairing' ? input.phoneNumber : undefined,
            },
        );

        return {
            artifact: buildArtifact(input.mode, sessionManager.getQR(input.workspaceOwnerId, input.sessionLabel)),
            mode: input.mode,
        };
    }

    async disconnect(input: WhatsAppDisconnectInput): Promise<void> {
        await sessionManager.removeSession(input.workspaceOwnerId, input.sessionLabel);
    }

    async sendMessage(input: WhatsAppSendMessageInput): Promise<void> {
        const client = await sessionManager.getSession(input.workspaceOwnerId, input.sessionLabel);
        if (!client) {
            throw new Error('No active WhatsApp session found');
        }

        await client.sendText(input.remoteJid, input.text);
    }

    async broadcastToGroups(input: WhatsAppBroadcastInput): Promise<WhatsAppBroadcastResult> {
        const client = await sessionManager.getSession(input.workspaceOwnerId, input.sessionLabel);
        if (!client) {
            throw new Error('No active WhatsApp session found');
        }

        const result = await client.broadcastToGroups(input.groupJids, input.text, {
            batchSize: input.batchSize,
            delayBetweenMessages: input.delayBetweenMessages,
            delayBetweenBatches: input.delayBetweenBatches,
        });

        return {
            sent: Array.isArray(result?.sent) ? result.sent : [],
            failed: Array.isArray(result?.failed)
                ? result.failed.map((entry: unknown) => {
                    if (typeof entry === 'string') {
                        return { groupId: entry, error: 'Failed to send message' };
                    }

                    const row = (entry || {}) as { groupId?: string; error?: string };
                    return {
                        groupId: String(row.groupId || ''),
                        error: String(row.error || 'Failed to send message'),
                    };
                })
                : [],
        };
    }

    async getStatus(input: WhatsAppStatusInput): Promise<WhatsAppSessionSnapshot | null> {
        const sessions = await this.getSessions(input.workspaceOwnerId);
        if (!input.sessionLabel) {
            return sessions[0] || null;
        }

        return sessions.find((session) => session.label === input.sessionLabel) || null;
    }

    async getQRCode(input: WhatsAppStatusInput): Promise<string | null> {
        return sessionManager.getQR(input.workspaceOwnerId, input.sessionLabel) || null;
    }

    async listGroups(input: { workspaceOwnerId: string; sessionLabel: string }): Promise<WhatsAppGroupRecord[]> {
        const client = await sessionManager.getSession(input.workspaceOwnerId, input.sessionLabel);
        if (!client) {
            return [];
        }

        const groups = await client.getGroups();
        return (groups as RuntimeGroup[]).map((group) => ({
            id: String(group.id || ''),
            name: String(group.name || group.id || ''),
            participantsCount: typeof group.participantsCount === 'number' ? group.participantsCount : undefined,
        }));
    }

    async forceReconnect(input: WhatsAppReconnectInput): Promise<WhatsAppReconnectResult> {
        const result = await sessionManager.forceReconnect(input.workspaceOwnerId, input.sessionLabel);
        return {
            label: String(result?.label || input.sessionLabel || ''),
            message: String(result?.message || 'Session recreated, QR regenerating...'),
        };
    }

    async getSessions(workspaceOwnerId: string): Promise<WhatsAppSessionSnapshot[]> {
        const snapshots = sessionManager.getLiveSessionSnapshots(workspaceOwnerId) as RuntimeSnapshot[];
        return snapshots.map((snapshot) => ({
            label: String(snapshot.label || ''),
            status: String(snapshot.status || 'disconnected'),
            phoneNumber: snapshot.phoneNumber || null,
            ownerName: snapshot.ownerName || null,
        }));
    }
}
