import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authMiddleware } from '../middleware/authMiddleware';
import { createSupabaseAnonClient, supabaseAdmin } from '../config/supabase';
import { ROUTE_PATHS } from './routePaths';
import { referralService } from '../services/referralService';
import { subscriptionService } from '../services/subscriptionService';
import { emailNotificationService } from '../services/emailNotificationService';
import { syncBrokerIdentityPhone } from '../services/identityService';
import { getPhoneOwnership, normalizePhone as normalizePhoneValue } from '../services/phoneOwnershipService';
import { activationCodeService } from '../services/activationCodeService';
import { createAppSessionToken, getAppSessionExpiryMs, getAppSessionTtlSeconds } from '../services/appAuthTokenService';
import { createAppRefreshToken, isAppRefreshToken, rotateAppRefreshToken } from '../services/appRefreshTokenService';
import {
    requestLoginLinkBodySchema,
    refreshTokenBodySchema,
    updateProfileBodySchema,
} from '../schemas/authSchemas';

const router = Router();
const OWNER_SUPER_ADMIN_EMAILS = new Set([
    'vishal@chaoscraftlabs.com',
    'hello@chaoscraftlabs.com',
    'ojha007@gmail.com',
    'hello@propai.live',
]);
const PROFILE_BASE_SELECT = 'id, full_name, phone, email, phone_verified, app_role';

const normalizePhone = (value?: string) => normalizePhoneValue(value);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const AUTH_OPTIONAL_WORK_TIMEOUT_MS = 2500;
const AUTH_SUPABASE_FETCH_TIMEOUT_MS = 45_000;

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

    await syncBrokerIdentityPhone(
        userId,
        normalizedPhone || existingProfile?.phone || null,
        fullName || existingProfile?.full_name || null,
    ).catch(() => null);

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

async function resolveLoginIdentityByPhone(phone: string) {
    const ownership = await getPhoneOwnership(phone);
    const canonicalOwnerId = ownership?.canonicalOwnerId || null;
    if (!canonicalOwnerId) {
        return null;
    }

    const profile = await getProfileById(canonicalOwnerId).catch(() => null);
    if (!profile) {
        return null;
    }

    return {
        phone: normalizePhone(phone),
        ownership,
        profile,
    };
}

router.post(ROUTE_PATHS.auth.requestLoginLink, validate(requestLoginLinkBodySchema), async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const next = typeof req.body?.next === 'string' && req.body.next.startsWith('/') ? req.body.next : '/dashboard';

    if (!phone) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    try {
        const loginIdentity = await resolveLoginIdentityByPhone(phone);
        if (!loginIdentity) {
            return res.status(404).json({
                error: 'No account found for this phone number. Open WhatsApp onboarding first, then try again.',
            });
        }

        const { code, expiresAt } = await activationCodeService.generateCode(
            loginIdentity.profile.id,
            'broker_login',
            loginIdentity.profile.id,
            undefined,
        );

        return res.json({
            success: true,
            code,
            expiresAt,
            next,
            message: 'Open WhatsApp and send the code from your number.',
        });
    } catch (error: any) {
        console.error('[Auth] Login link request failed:', error);
        return res.status(Number(error?.status || 500)).json({
            error: error?.message || 'Failed to create login code',
        });
    }
});

router.get(ROUTE_PATHS.auth.loginStatus, async (req, res) => {
    const code = String(req.query?.code || '').trim().toUpperCase();
    if (!activationCodeService.isActivationCode(code)) {
        return res.status(400).json({ error: 'A valid login code is required' });
    }

    try {
        const dbClient = supabaseAdmin || null;
        if (!dbClient) {
            return res.status(503).json({ error: 'Supabase service role key is not configured' });
        }

        const { data: row, error } = await dbClient
            .from('whatsapp_activation_codes')
            .select('id, code, tenant_id, context_type, context_id, status, expires_at, activated_at, activated_phone')
            .eq('code', code)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!row) {
            return res.status(404).json({ error: 'Login code not found' });
        }

        if (new Date(String(row.expires_at || 0)).getTime() < Date.now()) {
            await dbClient
                .from('whatsapp_activation_codes')
                .update({ status: 'expired', updated_at: new Date().toISOString() })
                .eq('code', code)
                .eq('status', 'pending');
            return res.json({ success: false, status: 'expired' });
        }

        if (row.status === 'expired') {
            return res.json({ success: false, status: 'expired' });
        }

        if (row.status !== 'activated') {
            return res.json({ success: true, status: 'pending' });
        }

        const activatedRow = row.status === 'activated' ? row : null;
        if (!activatedRow) {
            return res.json({ success: true, status: 'pending' });
        }

        const userId = String(activatedRow.tenant_id || '').trim();
        const profile = await getProfileById(userId).catch(() => null);
        const identity = await getBrokerIdentityById(userId).catch(() => null);
        const email = String(profile?.email || profile?.phone || activatedRow.activated_phone || userId).trim();
        const fullName = String(profile?.full_name || identity?.full_name || '').trim() || null;
        const phone = String(profile?.phone || activatedRow.activated_phone || '').trim() || null;
        const appRole = String(profile?.app_role || 'broker');
        const sessionToken = createAppSessionToken({
            userId,
            email,
            phone,
            fullName,
            appRole,
        });
        const appRefresh = await createAppRefreshToken({
            userId,
            userAgent: req.get('user-agent'),
            ipAddress: req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']) : req.ip,
        });

        return res.json({
            success: true,
            status: 'authenticated',
            session: {
                access_token: sessionToken,
                refresh_token: appRefresh.refreshToken,
                expires_at: Math.floor((Date.now() + getAppSessionExpiryMs()) / 1000),
                expires_in: getAppSessionTtlSeconds(),
            },
            user: {
                id: userId,
                email,
            },
            profile: profile
                ? {
                    id: profile.id,
                    fullName: profile.full_name,
                    phone: profile.phone,
                    email: profile.email,
                    phoneVerified: profile.phone_verified,
                    appRole: profile.app_role || 'broker',
                }
                : null,
        });
    } catch (error: any) {
        console.error('[Auth] Login status lookup failed:', error);
        return res.status(Number(error?.status || 500)).json({
            error: error?.message || 'Failed to check login status',
        });
    }
});

router.post(ROUTE_PATHS.auth.refresh, validate(refreshTokenBodySchema), async (req, res) => {
    const { refreshToken } = req.body;

    try {
        if (isAppRefreshToken(refreshToken)) {
            const rotated = await rotateAppRefreshToken(refreshToken, {
                userAgent: req.get('user-agent'),
                ipAddress: req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']) : req.ip,
            });

            if (!rotated) {
                return res.status(401).json({ error: 'Invalid or expired refresh token' });
            }

            const profile = await getProfileById(rotated.userId).catch(() => null);
            if (!profile) {
                return res.status(401).json({ error: 'User profile not found' });
            }

            const identity = await getBrokerIdentityById(rotated.userId).catch(() => null);
            const email = String(profile.email || profile.phone || rotated.userId).trim();
            const fullName = String(profile.full_name || identity?.full_name || '').trim() || null;
            const phone = String(profile.phone || '').trim() || null;
            const appRole = String(profile.app_role || 'broker');
            const accessToken = createAppSessionToken({
                userId: rotated.userId,
                email,
                phone,
                fullName,
                appRole,
            });

            return res.json({
                success: true,
                session: {
                    access_token: accessToken,
                    refresh_token: rotated.refreshToken,
                    expires_at: Math.floor((Date.now() + getAppSessionExpiryMs()) / 1000),
                    expires_in: getAppSessionTtlSeconds(),
                },
            });
        }

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
