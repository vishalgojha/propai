import { z } from 'zod';

export const whatsappChatTypeValues = ['direct', 'group', 'status'] as const;
export const whatsappMessageTypeValues = [
    'text',
    'image',
    'video',
    'audio',
    'document',
    'sticker',
    'location',
    'contact',
    'reaction',
    'interactive',
    'unknown',
] as const;

export const internalAuthContextSchema = z.object({
    workspaceId: z.string().trim().min(1),
    sessionId: z.string().trim().min(1),
    tenantId: z.string().trim().min(1).nullable().optional(),
});

export const whatsappContactPayloadSchema = z.object({
    phone: z.string().trim().min(1).nullable(),
    name: z.string().trim().min(1).nullable(),
    pushName: z.string().trim().min(1).nullable(),
});

export const whatsappMediaPayloadSchema = z.object({
    id: z.string().trim().min(1).nullable().optional(),
    mimeType: z.string().trim().min(1).nullable(),
    fileName: z.string().trim().min(1).nullable(),
    url: z.string().trim().url().nullable(),
    caption: z.string().nullable(),
    sha256: z.string().trim().min(1).nullable().optional(),
    sizeBytes: z.number().int().nonnegative().nullable().optional(),
});

export const whatsappInboundMessagePayloadSchema = z.object({
    eventId: z.string().trim().min(1),
    occurredAt: z.string().datetime(),
    auth: internalAuthContextSchema,
    message: z.object({
        messageId: z.string().trim().min(1),
        chatId: z.string().trim().min(1),
        from: z.string().trim().min(1),
        fromMe: z.boolean(),
        timestamp: z.string().datetime(),
        type: z.enum(whatsappMessageTypeValues),
        text: z.string().nullable(),
        media: whatsappMediaPayloadSchema.nullable(),
        quotedMessageId: z.string().trim().min(1).nullable().optional(),
        raw: z.record(z.unknown()).optional(),
    }),
    contact: whatsappContactPayloadSchema,
    context: z.object({
        chatType: z.enum(whatsappChatTypeValues),
        groupId: z.string().trim().min(1).nullable().optional(),
        groupName: z.string().trim().min(1).nullable().optional(),
    }),
});

export const whatsappStatusPayloadSchema = z.object({
    eventId: z.string().trim().min(1),
    occurredAt: z.string().datetime(),
    auth: internalAuthContextSchema,
    status: z.object({
        messageId: z.string().trim().min(1),
        chatId: z.string().trim().min(1),
        state: z.enum(['sent', 'server_ack', 'delivered', 'read', 'played', 'failed']),
        timestamp: z.string().datetime(),
        errorCode: z.string().trim().min(1).nullable().optional(),
        errorMessage: z.string().trim().min(1).nullable().optional(),
    }),
});

export const runtimeSendMessageRequestSchema = z.object({
    requestId: z.string().trim().min(1),
    auth: internalAuthContextSchema,
    chatId: z.string().trim().min(1),
    text: z.string().min(1),
    replyToMessageId: z.string().trim().min(1).nullable().optional(),
    idempotencyKey: z.string().trim().min(1),
});

export const runtimeSendMediaRequestSchema = z.object({
    requestId: z.string().trim().min(1),
    auth: internalAuthContextSchema,
    chatId: z.string().trim().min(1),
    media: z.object({
        url: z.string().trim().url(),
        mimeType: z.string().trim().min(1),
        fileName: z.string().trim().min(1).nullable().optional(),
        caption: z.string().nullable().optional(),
    }),
    replyToMessageId: z.string().trim().min(1).nullable().optional(),
    idempotencyKey: z.string().trim().min(1),
});

export const runtimeBroadcastRecipientSchema = z.object({
    chatId: z.string().trim().min(1),
    phone: z.string().trim().min(1).nullable().optional(),
    name: z.string().trim().min(1).nullable().optional(),
});

export const runtimeBroadcastRequestSchema = z.object({
    requestId: z.string().trim().min(1),
    auth: internalAuthContextSchema,
    campaignId: z.string().trim().min(1).nullable().optional(),
    recipients: z.array(runtimeBroadcastRecipientSchema).min(1),
    content: z.union([
        z.object({
            type: z.literal('text'),
            text: z.string().min(1),
        }),
        z.object({
            type: z.literal('media'),
            url: z.string().trim().url(),
            mimeType: z.string().trim().min(1),
            fileName: z.string().trim().min(1).nullable().optional(),
            caption: z.string().nullable().optional(),
        }),
    ]),
    rateLimit: z.object({
        batchSize: z.number().int().positive().optional(),
        delayBetweenMessagesMs: z.number().int().nonnegative().optional(),
        delayBetweenBatchesMs: z.number().int().nonnegative().optional(),
    }).optional(),
    idempotencyKey: z.string().trim().min(1),
});

export const runtimeSessionStatusQuerySchema = z.object({
    workspaceId: z.string().trim().min(1),
    sessionId: z.string().trim().min(1).optional(),
});

export type InternalAuthContext = z.infer<typeof internalAuthContextSchema>;
export type WhatsAppContactPayload = z.infer<typeof whatsappContactPayloadSchema>;
export type WhatsAppMediaPayload = z.infer<typeof whatsappMediaPayloadSchema>;
export type WhatsAppInboundMessagePayload = z.infer<typeof whatsappInboundMessagePayloadSchema>;
export type WhatsAppStatusPayload = z.infer<typeof whatsappStatusPayloadSchema>;
export type RuntimeSendMessageRequest = z.infer<typeof runtimeSendMessageRequestSchema>;
export type RuntimeSendMediaRequest = z.infer<typeof runtimeSendMediaRequestSchema>;
export type RuntimeBroadcastRecipient = z.infer<typeof runtimeBroadcastRecipientSchema>;
export type RuntimeBroadcastRequest = z.infer<typeof runtimeBroadcastRequestSchema>;
export type RuntimeSessionStatusQuery = z.infer<typeof runtimeSessionStatusQuerySchema>;
