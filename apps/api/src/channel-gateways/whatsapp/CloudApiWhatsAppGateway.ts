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
import { whatsappCloudApiService } from '../../services/whatsappCloudApiService';
import { supabase, supabaseAdmin } from '../../config/supabase';

const db = supabaseAdmin || supabase;

export class CloudApiWhatsAppGateway implements WhatsAppGateway {
    async connect(_input: WhatsAppConnectInput): Promise<WhatsAppConnectResult> {
        throw new Error('Cloud API mode does not support QR/pairing connect. Use WABA webhook configuration.');
    }

    async disconnect(_input: WhatsAppDisconnectInput): Promise<void> {
        throw new Error('Cloud API mode does not support disconnect. Manage sessions via Meta Business Platform.');
    }

    async sendMessage(input: WhatsAppSendMessageInput): Promise<void> {
        const tenantId = input.workspaceOwnerId;
        const config = await whatsappCloudApiService.getConfig(tenantId);
        const phoneNumberId = config?.phoneNumberId;
        if (!phoneNumberId) {
            const sessions = await this.getSessions(tenantId);
            if (sessions.length > 0) {
                throw new Error('WhatsApp Cloud API not configured for this tenant');
            }
            throw new Error('No active WhatsApp session found for this tenant');
        }
        await whatsappCloudApiService.sendTextMessage({
            tenantId,
            phoneNumberId,
            to: input.remoteJid,
            text: input.text,
        });
    }

    async broadcastToGroups(_input: WhatsAppBroadcastInput): Promise<WhatsAppBroadcastResult> {
        throw new Error('Cloud API mode does not support broadcast to groups. Use the broadcast endpoint instead.');
    }

    async createGroup(_input: WhatsAppCreateGroupInput): Promise<WhatsAppCreateGroupResult> {
        throw new Error('Cloud API mode does not support group creation.');
    }

    async getStatus(input: WhatsAppStatusInput): Promise<WhatsAppSessionSnapshot | null> {
        const { data } = await db
            .from('whatsapp_sessions')
            .select('session_data, label, status, updated_at')
            .eq('tenant_id', input.workspaceOwnerId)
            .eq('label', input.sessionLabel || 'Official API')
            .maybeSingle();
        if (!data) return null;
        const sessionData = data.session_data as Record<string, unknown> || {};
        return {
            label: data.label,
            status: data.status || 'disconnected',
            phoneNumber: String(sessionData.displayPhoneNumber || sessionData.phoneNumber || ''),
            ownerName: String(sessionData.ownerName || ''),
        };
    }

    async getQRCode(_input: WhatsAppStatusInput): Promise<string | null> {
        return null;
    }

    async listGroups(_input: { workspaceOwnerId: string; sessionLabel: string }): Promise<WhatsAppGroupRecord[]> {
        return [];
    }

    async forceReconnect(_input: WhatsAppReconnectInput): Promise<WhatsAppReconnectResult> {
        throw new Error('Cloud API mode does not support reconnection. Check Meta webhook health instead.');
    }

    async getSessions(workspaceOwnerId: string): Promise<WhatsAppSessionSnapshot[]> {
        const { data } = await db
            .from('whatsapp_sessions')
            .select('label, status, session_data, updated_at')
            .eq('tenant_id', workspaceOwnerId)
            .order('updated_at', { ascending: false });
        if (!data) return [];
        return data.map((row) => {
            const sessionData = row.session_data as Record<string, unknown> || {};
            return {
                label: row.label,
                status: row.status || 'disconnected',
                phoneNumber: String(sessionData.displayPhoneNumber || sessionData.phoneNumber || ''),
                ownerName: String(sessionData.ownerName || ''),
            };
        });
    }
}
