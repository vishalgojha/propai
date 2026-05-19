const { z } = require('zod');

const whatsappChatTypeValues = ['direct', 'group', 'status'];
const whatsappMessageTypeValues = [
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
];

const internalAuthContextSchema = z.object({
  workspaceId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  tenantId: z.string().trim().min(1).nullable().optional(),
});

const whatsappContactPayloadSchema = z.object({
  phone: z.string().trim().min(1).nullable(),
  name: z.string().trim().min(1).nullable(),
  pushName: z.string().trim().min(1).nullable(),
});

const whatsappMediaPayloadSchema = z.object({
  id: z.string().trim().min(1).nullable().optional(),
  mimeType: z.string().trim().min(1).nullable(),
  fileName: z.string().trim().min(1).nullable(),
  url: z.string().trim().url().nullable(),
  caption: z.string().trim().nullable(),
  sha256: z.string().trim().min(1).nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
});

const whatsappInboundMessagePayloadSchema = z.object({
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

const whatsappStatusPayloadSchema = z.object({
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

const runtimeSendMessageRequestSchema = z.object({
  requestId: z.string().trim().min(1),
  auth: internalAuthContextSchema,
  chatId: z.string().trim().min(1),
  text: z.string().min(1),
  replyToMessageId: z.string().trim().min(1).nullable().optional(),
  idempotencyKey: z.string().trim().min(1),
});

const runtimeSendMediaRequestSchema = z.object({
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

const runtimeBroadcastRecipientSchema = z.object({
  chatId: z.string().trim().min(1),
  phone: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1).nullable().optional(),
});

const runtimeBroadcastRequestSchema = z.object({
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

const runtimeSessionStatusQuerySchema = z.object({
  workspaceId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
});

module.exports = {
  internalAuthContextSchema,
  runtimeBroadcastRecipientSchema,
  runtimeBroadcastRequestSchema,
  runtimeSendMediaRequestSchema,
  runtimeSendMessageRequestSchema,
  runtimeSessionStatusQuerySchema,
  whatsappChatTypeValues,
  whatsappContactPayloadSchema,
  whatsappInboundMessagePayloadSchema,
  whatsappMediaPayloadSchema,
  whatsappMessageTypeValues,
  whatsappStatusPayloadSchema,
};
