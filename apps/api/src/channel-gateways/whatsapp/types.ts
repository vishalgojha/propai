export type WhatsAppConnectMode = 'qr' | 'pairing';

export type WhatsAppConnectionArtifact = {
    mode: WhatsAppConnectMode;
    format: 'text';
    value: string;
} | null;

export type WhatsAppConnectInput = {
    workspaceOwnerId: string;
    sessionLabel: string;
    ownerName?: string;
    phoneNumber?: string;
    mode: WhatsAppConnectMode;
};

export type WhatsAppSendMessageInput = {
    workspaceOwnerId: string;
    sessionLabel?: string;
    remoteJid: string;
    text: string;
};

export type WhatsAppBroadcastInput = {
    workspaceOwnerId: string;
    sessionLabel?: string;
    groupJids: string[];
    text: string;
    batchSize?: number;
    delayBetweenMessages?: number;
    delayBetweenBatches?: number;
};

export type WhatsAppBroadcastResult = {
    sent: string[];
    failed: Array<{ groupId: string; error: string }>;
};

export type WhatsAppDisconnectInput = {
    workspaceOwnerId: string;
    sessionLabel?: string;
};

export type WhatsAppStatusInput = {
    workspaceOwnerId: string;
    sessionLabel?: string;
};

export type WhatsAppReconnectInput = {
    workspaceOwnerId: string;
    sessionLabel?: string;
};

export type WhatsAppReconnectResult = {
    label: string;
    message: string;
};

export type WhatsAppGroupRecord = {
    id: string;
    name: string;
    participantsCount?: number;
};

export type WhatsAppSessionSnapshot = {
    label: string;
    status: string;
    phoneNumber?: string | null;
    ownerName?: string | null;
    reconnectAttempts?: number;
    isReconnecting?: boolean;
};

export type WhatsAppConnectResult = {
    artifact: WhatsAppConnectionArtifact;
    mode: WhatsAppConnectMode;
    connected?: boolean;
};
