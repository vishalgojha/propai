import { z } from 'zod';

export declare const whatsappChatTypeValues: readonly ['direct', 'group', 'status'];
export declare const whatsappMessageTypeValues: readonly [
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

export declare const internalAuthContextSchema: z.ZodObject<{
  workspaceId: z.ZodString;
  sessionId: z.ZodString;
  tenantId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}>;

export declare const whatsappContactPayloadSchema: z.ZodObject<{
  phone: z.ZodNullable<z.ZodString>;
  name: z.ZodNullable<z.ZodString>;
  pushName: z.ZodNullable<z.ZodString>;
}>;

export declare const whatsappMediaPayloadSchema: z.ZodObject<{
  id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  mimeType: z.ZodNullable<z.ZodString>;
  fileName: z.ZodNullable<z.ZodString>;
  url: z.ZodNullable<z.ZodString>;
  caption: z.ZodNullable<z.ZodString>;
  sha256: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  sizeBytes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}>;

export declare const whatsappInboundMessagePayloadSchema: z.ZodTypeAny;
export declare const whatsappStatusPayloadSchema: z.ZodTypeAny;
export declare const runtimeSendMessageRequestSchema: z.ZodTypeAny;
export declare const runtimeSendMediaRequestSchema: z.ZodTypeAny;
export declare const runtimeBroadcastRecipientSchema: z.ZodTypeAny;
export declare const runtimeBroadcastRequestSchema: z.ZodTypeAny;
export declare const runtimeSessionStatusQuerySchema: z.ZodTypeAny;

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
