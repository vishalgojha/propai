import type {
    WhatsAppBroadcastInput,
    WhatsAppBroadcastResult,
    WhatsAppConnectInput,
    WhatsAppConnectResult,
    WhatsAppDisconnectInput,
    WhatsAppGroupRecord,
    WhatsAppReconnectInput,
    WhatsAppReconnectResult,
    WhatsAppSendMessageInput,
    WhatsAppSessionSnapshot,
    WhatsAppStatusInput,
} from './types';

export interface WhatsAppGateway {
    connect(input: WhatsAppConnectInput): Promise<WhatsAppConnectResult>;
    disconnect(input: WhatsAppDisconnectInput): Promise<void>;
    sendMessage(input: WhatsAppSendMessageInput): Promise<void>;
    broadcastToGroups(input: WhatsAppBroadcastInput): Promise<WhatsAppBroadcastResult>;
    getStatus(input: WhatsAppStatusInput): Promise<WhatsAppSessionSnapshot | null>;
    getQRCode(input: WhatsAppStatusInput): Promise<string | null>;
    listGroups(input: { workspaceOwnerId: string; sessionLabel: string }): Promise<WhatsAppGroupRecord[]>;
    forceReconnect(input: WhatsAppReconnectInput): Promise<WhatsAppReconnectResult>;
    getSessions(workspaceOwnerId: string): Promise<WhatsAppSessionSnapshot[]>;
}
