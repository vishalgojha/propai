export type ConversationChannel = 'web' | 'whatsapp' | 'voice';

export type ConversationEvent = {
    schemaVersion: '2026-05-15';
    eventType: 'conversation.message.received';
    channel: ConversationChannel;
    tenantId: string;
    conversation: {
        key: string;
        externalId?: string | null;
        participantId?: string | null;
        sessionLabel?: string | null;
        sessionId?: string | null;
        isGroup: boolean;
    };
    actor?: {
        userId?: string | null;
        phone?: string | null;
    };
    content: {
        text: string;
        attachments?: unknown[];
    };
    metadata?: Record<string, unknown>;
};
