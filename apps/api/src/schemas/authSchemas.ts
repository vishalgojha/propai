import { z } from 'zod';

export const requestVerificationBodySchema = z.object({
    email: z.string().email('A valid email is required'),
});

export const passwordAuthBodySchema = z.object({
    mode: z.enum(['signup', 'signin']).optional().default('signin'),
    email: z.string().email('A valid email is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    fullName: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    referralCode: z.string().optional(),
});

export const verifyOtpBodySchema = z.object({
    email: z.string().email('A valid email is required'),
    otp: z.string().min(1, 'OTP is required'),
});

export const refreshTokenBodySchema = z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const resetPasswordBodySchema = z.object({
    email: z.string().email('A valid email is required'),
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
