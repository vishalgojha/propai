import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authMiddleware } from '../middleware/authMiddleware';
import { createSupabaseAnonClient, supabaseAdmin } from '../config/supabase';
import { ROUTE_PATHS } from './routePaths';
import { referralService } from '../services/referralService';
import { subscriptionService } from '../services/subscriptionService';
import { emailNotificationService } from '../services/emailNotificationService';
import { getPhoneOwnership, normalizePhone as normalizePhoneValue } from '../services/phoneOwnershipService';
import {
    requestVerificationBodySchema,
    passwordAuthBodySchema,
    verifyOtpBodySchema,
    refreshTokenBodySchema,
    resetPasswordBodySchema,
    updateProfileBodySchema,
} from '../schemas/authSchemas';

const router = Router();
const OWNER_SUPER_ADMIN_EMAILS = new Set([
    'vishal@chaoscraftlabs.com',
    'hello@chaoscraftlabs.com',
    'ojha007@gmail.com',
    'hello@propai.live',
]);
const PROFILE_BASE_SELECT = 'id, full_name, phone, email, phone_verified';

const normalizePhone = (value?: string) => normalizePhoneValue(value);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const AUTH_OPTIONAL_WORK_TIMEOUT_MS = 2500;
// Password auth is a hard dependency for sign-in; give production enough headroom
// for Supabase auth latency instead of failing fast with a 504.
const AUTH_REQUIRED_WORK_TIMEOUT_MS = 25000;
const AUTH_SUPABASE_FETCH_TIMEOUT_MS = AUTH_REQUIRED_WORK_TIMEOUT_MS;

type DirectPasswordSession = {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    expires_at?: number;
};

type DirectPasswordUser = {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
};

type DirectPasswordAuthResult = {
    session: DirectPasswordSession;
    user: DirectPasswordUser;
};

function extractAuthErrorMessage(error: any, fallback = 'Authentication failed'): string {
    if (!error) return fallback;
    const raw = error?.message || error?.error_description || error?.msg || '';
    if (!raw || typeof raw !== 'string') return fallback;
    // Guard against Supabase returning stringified JSON as the message (e.g. "{}" or "{\"code\":\"otp_expired\"}")
    if (raw.startsWith('{') || raw.startsWith('[')) {
        try {
            const parsed = JSON.parse(raw);
            return parsed?.message || parsed?.error_description || parsed?.msg || fallback;
        } catch {
            return fallback;
        }
    }
    return raw || fallback;
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T | null> {
    let timeoutHandle: NodeJS.Timeout | null = null;

    try {
        return await Promise.race([
            task,
            new Promise<null>((resolve) => {
                timeoutHandle = setTimeout(() => {
                    console.warn(`[Auth] ${label} timed out after ${timeoutMs}ms`);
                    resolve(null);
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}

async function withRequiredTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | null = null;

    try {
        return await Promise.race([
            task,
            new Promise<T>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    const error = new Error(`${label} timed out after ${timeoutMs}ms`);
                    console.error(`[Auth] ${error.message}`);
                    reject(error);
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}

async function signInWithPasswordDirect(email: string, password: string): Promise<DirectPasswordAuthResult> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase URL or anon key is not configured');
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), AUTH_SUPABASE_FETCH_TIMEOUT_MS);
    let response: Response;

    try {
        response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                email,
                password,
            }),
            signal: controller.signal,
        });
    } catch (error: any) {
        if (error?.name === 'AbortError') {
            const timeoutError = new Error('Supabase password auth request timed out');
            (timeoutError as any).status = 504;
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timeoutHandle);
    }

    const responseText = await response.text();
    let payload: any = null;
    if (responseText) {
        try {
            payload = JSON.parse(responseText);
        } catch {
            payload = null;
        }
    }

    if (!response.ok) {
        const message = payload?.error_description || payload?.msg || payload?.message || 'Authentication failed';
        const error = new Error(message);
        (error as any).status = response.status;
        throw error;
    }

    if (!payload?.access_token || !payload?.refresh_token || !payload?.user?.id) {
        throw new Error('Supabase password auth returned an incomplete session');
    }

    return {
        session: {
            access_token: payload.access_token,
            refresh_token: payload.refresh_token,
            expires_in: payload.expires_in,
            expires_at: payload.expires_at,
        },
        user: {
            id: payload.user.id,
            email: payload.user.email,
            user_metadata: payload.user.user_metadata || {},
        },
    };
}

async function findAuthUserByEmail(email: string) {
    if (!supabaseAdmin) return null;

    const targetEmail = email.trim().toLowerCase();
    const pageSize = 100;

    for (let page = 1; page <= 10; page += 1) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage: pageSize,
        });

        if (error) throw error;

        const users = data?.users || [];
        const match = users.find((user) => (user.email || '').trim().toLowerCase() === targetEmail);
        if (match) return match;

        if (users.length < pageSize) break;
    }

    return null;
}

function getProfileClient(accessToken?: string) {
    if (supabaseAdmin) return supabaseAdmin;
    if (accessToken) return createSupabaseAnonClient(accessToken);
    throw new Error('Supabase profile access is not configured on this deployment');
}

async function getPhoneOwnershipState(userId: string, phone?: string) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return null;
    }

    const ownership = await getPhoneOwnership(normalizedPhone);
    return ownership
        ? {
            ...ownership,
            isCanonicalOwner: ownership.canonicalOwnerId === userId,
        }
        : null;
}

async function upsertProfile(userId: string, email: string | null | undefined, fullName?: string, phone?: string, accessToken?: string) {
    const normalizedPhone = normalizePhone(phone);
    const phoneOwnership = await getPhoneOwnershipState(userId, normalizedPhone);
    const isCanonicalPhoneOwner = !normalizedPhone || !phoneOwnership || phoneOwnership.isCanonicalOwner || !phoneOwnership.canonicalOwnerId;
    const client = getProfileClient(accessToken);
    const existingProfile = await getProfileById(userId, accessToken);
    const verificationEnabled = process.env.ENABLE_SYSTEM_WHATSAPP_SESSION === 'true';

    const payload: Record<string, unknown> = {
        id: userId,
        email: email || null,
        updated_at: new Date().toISOString(),
    };

    if (fullName?.trim()) payload.full_name = fullName.trim();
    if (normalizedPhone) {
        const existingPhone = normalizePhone(String(existingProfile?.phone || ''));
        const canAssignVerifiedPhone = existingPhone === normalizedPhone
            || (isCanonicalPhoneOwner && verificationEnabled);

        if (canAssignVerifiedPhone) {
            payload.phone = normalizedPhone;
        }
        if ((!isCanonicalPhoneOwner || !verificationEnabled) && existingPhone !== normalizedPhone) {
            payload.phone_verified = false;
        }
    }

    const { error } = await client
        .from('profiles')
        .upsert(payload, { onConflict: 'id' });

    if (error) throw error;

    const profile = await getProfileById(userId, accessToken);

    const fallbackProfile = profile || {
        id: userId,
        full_name: fullName?.trim() || null,
        phone: isCanonicalPhoneOwner ? normalizedPhone || null : existingProfile?.phone || null,
        email: email || null,
        phone_verified: false,
        app_role: 'broker',
    };

    return {
        ...fallbackProfile,
        phone_ownership: normalizedPhone
            ? {
                phone: normalizedPhone,
                canonicalOwnerId: phoneOwnership?.canonicalOwnerId || userId,
                isCanonicalOwner: isCanonicalPhoneOwner,
                hasConflict: Boolean(phoneOwnership?.hasConflict),
            }
            : null,
    };
}

async function getProfileById(userId: string, accessToken?: string) {
    const client = getProfileClient(accessToken);
    const fallback = await client
        .from('profiles')
        .select(PROFILE_BASE_SELECT)
        .eq('id', userId)
        .maybeSingle();

    if (fallback.error) throw fallback.error;
    if (!fallback.data) {
        return null;
    }

    const phoneOwnership = fallback.data.phone
        ? await getPhoneOwnershipState(String(fallback.data.id || ''), String(fallback.data.phone || ''))
        : null;

    return {
        ...fallback.data,
        app_role: 'broker',
        phone_ownership: fallback.data.phone
            ? {
                phone: normalizePhone(String(fallback.data.phone || '')),
                canonicalOwnerId: phoneOwnership?.canonicalOwnerId || fallback.data.id,
                isCanonicalOwner: phoneOwnership?.isCanonicalOwner ?? true,
                hasConflict: Boolean(phoneOwnership?.hasConflict),
            }
            : null,
    };
}

async function getBrokerIdentityById(userId: string, accessToken?: string) {
    const client = getProfileClient(accessToken);
    const result = await client
        .from('broker_identity')
        .select('broker_id, full_name')
        .eq('broker_id', userId)
        .maybeSingle();

    if (result.error) throw result.error;
    return result.data;
}

async function getLegacyUserSeed(userId: string) {
    if (!supabaseAdmin) return null;

    const { data, error } = await supabaseAdmin
        .from('users')
        .select('email, full_name, profile')
        .eq('id', userId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

router.post(ROUTE_PATHS.auth.requestVerification, validate(requestVerificationBodySchema), async (req, res) => {
    const { email } = req.body;

    try {
        const authClient = createSupabaseAnonClient();
        const { error } = await authClient.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: `${process.env.APP_URL || 'https://app.propai.live'}/auth/callback`,
            },
        });

        if (error) {
            console.error('Supabase auth error:', error);
            return res.status(400).json({ error: error.message || 'Failed to send verification code' });
        }

        res.json({
            message: 'Verification code sent',
        });
    } catch (error: any) {
        console.error('Email send error:', error);
        res.status(500).json({ error: error.message || 'Failed to send verification code' });
    }
});

router.post(ROUTE_PATHS.auth.password, validate(passwordAuthBodySchema), async (req, res) => {
    const { mode, email, password, phone, referralCode } = req.body || {};
    const firstName = typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : '';
    const lastName = typeof req.body?.lastName === 'string' ? req.body.lastName.trim() : '';
    const fullName = String(req.body?.fullName || [firstName, lastName].filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim();

    const loginMode = mode === 'signup' ? 'signup' : 'signin';

    try {
        if (loginMode === 'signup') {
            if (!supabaseAdmin) {
                return res.status(503).json({ error: 'Supabase service role key is not configured' });
            }

            const normalizedPhone = normalizePhone(phone);
            if (!fullName || !normalizedPhone) {
                return res.status(400).json({ error: 'Full name and WhatsApp number are required for sign up' });
            }

            const existingUser = await findAuthUserByEmail(email);
            if (existingUser?.id) {
                return res.status(409).json({
                    error: 'An account with this email already exists. Use Login instead of Create account.',
                });
            } else {
                const { error: createError } = await supabaseAdmin.auth.admin.createUser({
                    email,
                    password,
                    email_confirm: true,
                    user_metadata: {
                        full_name: fullName,
                        phone: normalizedPhone,
                    },
                });

                if (createError) {
                    const message = createError.message || 'Could not create account';
                    const normalizedMessage = message.toLowerCase();
                    if (
                        normalizedMessage.includes('already registered')
                        || normalizedMessage.includes('already exists')
                        || normalizedMessage.includes('already been registered')
                    ) {
                        return res.status(409).json({
                            error: 'An account with this email already exists. Use Login instead of Create account.',
                        });
                    }
                    return res.status(400).json({ error: message });
                }
            }

            await sleep(750);
        }

        let authError: any = null;
        let authData: DirectPasswordAuthResult | null = null;

        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                authData = await withRequiredTimeout(
                    signInWithPasswordDirect(
                        email,
                        password,
                    ),
                    AUTH_REQUIRED_WORK_TIMEOUT_MS,
                    'signInWithPassword',
                );
                authError = null;
                if (authData?.session && authData?.user) break;
            } catch (error: any) {
                authError = error;
                authData = null;
            }

            const normalizedMessage = String(authError?.message || '').toLowerCase();
            if (attempt < 2 && normalizedMessage.includes('invalid login credentials')) {
                await sleep(500 * (attempt + 1));
                continue;
            }

            break;
        }

        if (authError || !authData?.session || !authData?.user) {
            const rawMessage = extractAuthErrorMessage(authError);
            const normalizedMessage = rawMessage.toLowerCase();
            if (normalizedMessage.includes('invalid login credentials') || normalizedMessage.includes('invalid email') || normalizedMessage.includes('email or password')) {
                return res.status(401).json({ error: 'Email or password is incorrect' });
            }
            if (normalizedMessage.includes('timed out')) {
                return res.status(504).json({
                    error: 'Sign in is taking too long right now. Please try again in a moment.',
                });
            }
            return res.status(Number(authError?.status || 400)).json({ error: rawMessage });
        }

        const accessToken = authData.session.access_token;
        const authUserMetadata = (authData.user.user_metadata || {}) as Record<string, any>;
        let profile: Record<string, unknown> | null = null;
        try {
            profile = await withTimeout(
                getProfileById(authData.user.id, accessToken),
                AUTH_OPTIONAL_WORK_TIMEOUT_MS,
                'getProfileById',
            );
        } catch (profileError: unknown) {
            console.error('[Auth] getProfileById failed (non-fatal):', profileError);
        }

        try {
            if (loginMode === 'signup') {
                profile = await withTimeout(
                    upsertProfile(
                        authData.user.id,
                        authData.user.email || email,
                        fullName,
                        phone,
                        accessToken
                    ),
                    AUTH_OPTIONAL_WORK_TIMEOUT_MS,
                    'signup upsertProfile',
                );
            } else if (!profile) {
                const legacyUser = await getLegacyUserSeed(authData.user.id);
                void withTimeout(
                    upsertProfile(
                        authData.user.id,
                        authData.user.email || email || legacyUser?.email || null,
                        authUserMetadata.full_name || legacyUser?.full_name || undefined,
                        authUserMetadata.phone || legacyUser?.profile?.phone || undefined,
                        accessToken
                    ),
                    AUTH_OPTIONAL_WORK_TIMEOUT_MS,
                    'signin backfill upsertProfile',
                ).catch((profileError) => {
                    console.error('[Auth] Deferred signin upsertProfile failed (non-fatal):', profileError);
                });
            }
        } catch (profileError: unknown) {
            console.error('[Auth] upsertProfile failed (non-fatal):', profileError);
        }

        try {
            if (loginMode === 'signup') {
                await subscriptionService.ensureTrialSubscription(authData.user.id, authData.user.email || email);
                await referralService.ensureParticipant(authData.user.id, authData.user.email || email, fullName);
                if (referralCode) {
                    await referralService.applyReferralCode(authData.user.id, referralCode, authData.user.email || email, fullName);
                }
                void emailNotificationService.sendWelcomeEmail({
                    to: authData.user.email || email,
                    fullName,
                    phone,
                });
            }
        } catch (onboardingError: unknown) {
            console.error('[Auth] Signup onboarding failed (non-fatal):', onboardingError);
        }

        let subscription: unknown = null;
        let referral: unknown = null;
        try {
            const [subscriptionResult, referralResult] = await Promise.all([
                withTimeout(
                    subscriptionService.ensureTrialSubscription(authData.user.id, authData.user.email || email),
                    AUTH_OPTIONAL_WORK_TIMEOUT_MS,
                    'ensureTrialSubscription',
                ),
                withTimeout(
                    referralService.getSummary(
                        authData.user.id,
                        authData.user.email || email,
                        String(profile?.full_name || fullName || '').trim() || null,
                    ),
                    AUTH_OPTIONAL_WORK_TIMEOUT_MS,
                    'referral getSummary',
                ),
            ]);
            subscription = subscriptionResult;
            referral = referralResult;
        } catch (postAuthError: unknown) {
            console.error('[Auth] Post-auth subscription/referral failed (non-fatal):', postAuthError);
        }

        return res.json({
            success: true,
            user: {
                id: authData.user.id,
                email: authData.user.email,
            },
            session: authData.session,
            profile: profile
                ? {
                    id: profile.id,
                    fullName: profile.full_name,
                    phone: profile.phone,
                    email: profile.email,
                    phoneVerified: profile.phone_verified,
                    appRole: profile.app_role || (isOwnerSuperAdminEmail(authData.user.email) ? 'super_admin' : 'broker'),
                    phoneOwnership: (profile as any).phone_ownership || null,
                }
                : null,
            subscription,
            referral,
        });
    } catch (error: any) {
        if (String(error?.message || '').includes('timed out')) {
            return res.status(504).json({
                error: 'Sign in is taking too long right now. Please try again in a moment.',
            });
        }
        console.error('Password auth error:', error);
        return res.status(Number(error?.status || 500)).json({ error: error.message || 'Failed to authenticate' });
    }
});

router.post(ROUTE_PATHS.auth.verify, validate(verifyOtpBodySchema), async (req, res) => {
    const { email, otp } = req.body;

    const authClient = createSupabaseAnonClient();
    const { data, error } = await authClient.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
    });

    if (error || !data?.session || !data.user) {
        return res.status(400).json({ error: error?.message || 'Invalid verification code' });
    }

    res.json({
        success: true,
        user: {
            id: data.user.id,
            email: data.user.email,
        },
        session: data.session,
    });
});

router.post(ROUTE_PATHS.auth.refresh, validate(refreshTokenBodySchema), async (req, res) => {
    const { refreshToken } = req.body;

    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            return res.status(503).json({ error: 'Supabase URL or anon key is not configured' });
        }

        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), AUTH_SUPABASE_FETCH_TIMEOUT_MS);
        let response: Response;

        try {
            response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
                method: 'POST',
                headers: {
                    apikey: supabaseAnonKey,
                    Authorization: `Bearer ${supabaseAnonKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    refresh_token: refreshToken,
                }).toString(),
                signal: controller.signal,
            });
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                return res.status(504).json({
                    error: 'Session refresh is taking too long right now. Please sign in again.',
                });
            }
            throw error;
        } finally {
            clearTimeout(timeoutHandle);
        }

        if (!response.ok) {
            const payload = await response.json().catch(() => null);
            return res.status(400).json({
                error: payload?.error_description || payload?.msg || 'Failed to refresh session',
            });
        }

        const data = await response.json();
        if (!data?.access_token) {
            return res.status(400).json({ error: 'Failed to refresh session' });
        }

        res.json({
            success: true,
            session: data,
        });
    } catch (error: any) {
        console.error('Refresh error:', error);
        res.status(500).json({ error: error.message || 'Failed to refresh session' });
    }
});

router.post(ROUTE_PATHS.auth.resetPassword, validate(resetPasswordBodySchema), async (req, res) => {
    const { email } = req.body;

    try {
        const authClient = createSupabaseAnonClient();
        const { error } = await authClient.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${process.env.APP_URL || 'https://app.propai.live'}/auth/callback`,
        });

        if (error) {
            console.error('Password reset error:', error);
            return res.status(400).json({ error: error.message || 'Failed to send reset email' });
        }

        res.json({
            success: true,
            message: 'Password reset link sent. Check your email.',
        });
    } catch (error: any) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: error.message || 'Failed to send reset email' });
    }
});

router.get(ROUTE_PATHS.auth.referralPreview, async (req, res) => {
    try {
        const code = String(req.params.code || '').trim();
        const preview = await referralService.resolveCode(code);
        if (!preview) {
            return res.status(404).json({ error: 'Referral code not found' });
        }

        return res.json({
            success: true,
            referral: preview,
        });
    } catch (error: any) {
        return res.status(500).json({ error: error?.message || 'Failed to resolve referral code' });
    }
});

router.get('/me', authMiddleware, async (req, res) => {
    const user = (req as any).user;
    const profile = await getProfileById(user.id).catch(() => null);
    const identity = await getBrokerIdentityById(user.id).catch(() => null);
    const subscription = await subscriptionService.ensureTrialSubscription(user.id, user.email);
    const resolvedFullName = profile?.full_name || identity?.full_name || user?.user_metadata?.full_name || null;
    const resolvedProfile = profile || resolvedFullName
        ? {
            id: profile?.id || user.id,
            full_name: resolvedFullName,
            phone: profile?.phone || null,
            email: profile?.email || user.email || null,
            phone_verified: profile?.phone_verified || false,
            app_role: profile?.app_role || null,
            phone_ownership: (profile as any)?.phone_ownership || null,
        }
        : null;
    const referral = await referralService.getSummary(
        user.id,
        user.email,
        resolvedFullName,
    );
    res.json({
        success: true,
        user: {
            id: user.id,
            email: user.email,
            appRole: profile?.app_role || (isOwnerSuperAdminEmail(user.email) ? 'super_admin' : 'broker'),
        },
        profile: resolvedProfile
            ? {
                id: resolvedProfile.id,
                fullName: resolvedProfile.full_name,
                phone: resolvedProfile.phone,
                email: resolvedProfile.email,
                phoneVerified: resolvedProfile.phone_verified,
                appRole: resolvedProfile.app_role || (isOwnerSuperAdminEmail(user.email) ? 'super_admin' : 'broker'),
                phoneOwnership: resolvedProfile.phone_ownership || null,
            }
            : null,
        subscription,
        referral,
    });
});

router.post('/me', authMiddleware, validate(updateProfileBodySchema), async (req, res) => {
    try {
        const user = (req as any).user;
        const userId = String(user?.id || '').trim();
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
        if (!fullName) {
            return res.status(400).json({ error: 'Full name is required' });
        }

        const authHeader = String(req.headers.authorization || '');
        const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
        const client = getProfileClient(accessToken);
        const { error: profileError } = await client
            .from('profiles')
            .upsert({
                id: userId,
                email: user?.email || null,
                full_name: fullName,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });

        if (profileError) {
            throw profileError;
        }

        const { error: identityError } = await client
            .from('broker_identity')
            .upsert({
                broker_id: userId,
                full_name: fullName,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'broker_id' });

        if (identityError) {
            throw identityError;
        }

        const profile = await getProfileById(userId);
        return res.json({
            success: true,
            profile: profile
                ? {
                    id: profile.id,
                    fullName: profile.full_name,
                    phone: profile.phone,
                    email: profile.email,
                    phoneVerified: profile.phone_verified,
                    appRole: profile.app_role || (isOwnerSuperAdminEmail(user.email) ? 'super_admin' : 'broker'),
                    phoneOwnership: (profile as any).phone_ownership || null,
                }
                : null,
        });
    } catch (error: any) {
        return res.status(Number(error?.status || 500)).json({ error: error?.message || 'Failed to update profile' });
    }
});

export default router;
function isOwnerSuperAdminEmail(email?: string | null) {
    return OWNER_SUPER_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}
