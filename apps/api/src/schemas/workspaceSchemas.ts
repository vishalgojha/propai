import { z } from 'zod';

const serviceAreaSchema = z.object({
    city: z.string().min(1),
    locality: z.string().min(1),
    priority: z.number().optional().default(0),
});

export const saveWorkspaceMetadataSchema = z.object({
    agencyName: z.string().max(80).optional().nullable(),
    primaryCity: z.string().max(60).optional().nullable(),
    serviceAreas: z.array(serviceAreaSchema).optional().default([]),
});

export const addMemberSchema = z.object({
    email: z.string().email('Valid email is required'),
    fullName: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    role: z.enum(['admin', 'realtor', 'ops', 'viewer']).optional().default('realtor'),
});

export const updateMemberSchema = z.object({
    fullName: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    role: z.enum(['admin', 'realtor', 'ops', 'viewer']).optional(),
    status: z.enum(['invited', 'active', 'inactive']).optional(),
});
