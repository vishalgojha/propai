import { z } from 'zod';

const campaignContactSchema = z.object({
    phone: z.string().min(1),
    name: z.string().optional().default(''),
});

export const createCampaignSchema = z.object({
    name: z.string().min(1, 'Campaign name is required'),
    message_template: z.string().min(1, 'Message template is required'),
    media_url: z.string().optional(),
    skills_config: z.record(z.unknown()).optional().default({}),
    contacts: z.array(campaignContactSchema).optional().default([]),
    schedule_at: z.string().optional(),
});

export const updateCampaignStatusSchema = z.object({
    status: z.enum(['draft', 'pending', 'running', 'paused', 'completed', 'cancelled']),
});

export const scheduleCampaignSchema = z.object({
    schedule_at: z.string().min(1, 'Schedule date is required'),
});

const contactInputSchema = z.object({
    phone: z.string().min(1, 'Phone is required'),
    name: z.string().optional().default(''),
    locality: z.string().optional().nullable(),
    budget: z.string().optional().nullable(),
    language: z.string().optional().nullable(),
});

export const addContactsSchema = z.object({
    list_name: z.string().min(1, 'List name is required'),
    contacts: z.array(contactInputSchema).min(1, 'At least one contact is required'),
});

export const registerDeviceSchema = z.object({
    device_id: z.string().min(1, 'Device ID is required'),
    device_model: z.string().optional().default(''),
    android_version: z.string().optional().default(''),
    app_version: z.string().optional().default(''),
});

const sendLogSchema = z.object({
    phone: z.string().min(1),
    name: z.string().optional().default(''),
    status: z.string().min(1),
    error: z.string().optional().nullable(),
});

export const syncSendLogsSchema = z.object({
    campaign_id: z.string().min(1, 'Campaign ID is required'),
    logs: z.array(sendLogSchema).min(1, 'At least one log entry is required'),
});

export const syncCampaignProgressSchema = z.object({
    sent_count: z.number().int().nonnegative().optional(),
    failed_count: z.number().int().nonnegative().optional(),
    skipped_count: z.number().int().nonnegative().optional(),
    status: z.enum(['draft', 'pending', 'running', 'paused', 'completed', 'cancelled']).optional(),
});
