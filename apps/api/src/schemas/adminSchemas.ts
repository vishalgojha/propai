import { z } from 'zod';

const agentTypeSchema = z.enum(['scout', 'seo', 'analyst', 'integrity']);

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

export const listScoutTasksQuerySchema = z.object({
    agentType: agentTypeSchema.optional().default('scout'),
    status: z.string().optional(),
    priority: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const upsertScoutTaskBodySchema = z.object({
    agentType: agentTypeSchema.optional().default('scout'),
    title: z.string().min(1),
    source: z.string().min(1),
    sourceUrl: z.string().optional(),
    context: z.string().optional().default(''),
    angle: z.string().optional().default(''),
    draft: z.string().optional().default(''),
    channel: z.enum(['email', 'dm', 'comment', 'partnership']).optional().default('email'),
    status: z.enum(['draft', 'needs_review', 'approved', 'sent', 'discarded']).optional().default('needs_review'),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
    notes: z.string().optional(),
    tenantId: z.string().uuid().optional().nullable(),
    metadata: z.record(z.any()).optional(),
});

export const scoutTaskIdParamSchema = z.object({
    taskId: z.string().uuid(),
});
