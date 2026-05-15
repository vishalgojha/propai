import { z } from 'zod';
import { phoneSchema, jidSchema } from '../middleware/validate';

export const connectWhatsAppSchema = z.object({
    phoneNumber: z.string().optional(),
    label: z.string().optional(),
    ownerName: z.string().optional(),
    connectMethod: z.enum(['qr', 'pairing']).optional().default('qr'),
});

export const forceRefreshQRSchema = z.object({
    label: z.string().optional(),
});

export const saveProfileSchema = z.object({
    fullName: z.string().min(1, 'Full name is required'),
    phone: phoneSchema,
});

export const sendMessageSchema = z.object({
    remoteJid: jidSchema,
    text: z.string().min(1, 'Message text is required'),
});

const recipientSchema = z.object({
    remoteJid: z.string().optional(),
    phone: z.string().optional(),
    label: z.string().optional(),
    name: z.string().optional(),
});

export const sendBulkSchema = z.object({
    recipients: z.array(recipientSchema).min(1, 'At least one recipient is required'),
    text: z.string().min(1, 'Message text is required'),
    sessionKey: z.string().optional(),
});

export const broadcastSchema = z.object({
    groupJids: z.array(z.string().min(1)).min(1, 'At least one group is required'),
    text: z.string().min(1, 'Broadcast text is required'),
    batchSize: z.number().int().positive().optional(),
    delayBetweenMessages: z.number().int().positive().optional(),
    delayBetweenBatches: z.number().int().positive().optional(),
    sessionKey: z.string().optional(),
});

export const disconnectSchema = z.object({
    label: z.string().optional(),
    sessionKey: z.string().optional(),
    phoneNumber: z.string().optional(),
});
