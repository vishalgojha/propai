import { z } from 'zod';

export const requestLoginLinkBodySchema = z.object({
    phone: z.string().min(1, 'Phone number is required'),
    next: z.string().optional(),
});

export const refreshTokenBodySchema = z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const updateProfileBodySchema = z.object({
    fullName: z.preprocess(
        (value) => {
            if (typeof value !== 'string') return undefined;
            const trimmed = value.trim();
            return trimmed.length > 0 ? trimmed : undefined;
        },
        z.string().min(2, 'Full name must be at least 2 characters').max(80, 'Full name is too long').optional(),
    ),
});
