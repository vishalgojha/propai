import { z } from 'zod';

export const listWorkspacesQuerySchema = z.object({
    search: z.string().optional(),
    plan: z.string().optional(),
    status: z.string().optional(),
    connected: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const updateSubscriptionBodySchema = z.object({
    plan: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    extendTrialDays: z.coerce.number().int().min(0).optional().default(0),
});

export const updateGroupBodySchema = z.object({
    groupName: z.string().optional(),
    locality: z.string().optional(),
    city: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    broadcastEnabled: z.boolean().optional(),
    isArchived: z.boolean().optional(),
});

export const getAuditLogQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});
