import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { createSupabaseAnonClient, supabaseAdmin } from '../config/supabase';
import { ROUTE_PATHS } from './routePaths';
import { referralService } from '../services/referralService';
import { subscriptionService } from '../services/subscriptionService';
import { emailNotificationService } from '../services/emailNotificationService';

const router = Router();
const OWNER_SUPER_ADMIN_EMAILS = new Set([
    'vishal@chaoscraftlabs.com',
    'vishal@chaoscraftslabs.com',
]);
const PROFILE_BASE_SELECT = 'id, full_name, phone, email, phone_verified';

const normalizePhone = (value?: string) => (value || '').split('').filter(c => c >= '0' && c <= '9').join('');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function upsertProfile(userId: string, email: string | null | undefined, fullName?: string, phone?: string, accessToken?: string) {
    const payload: Record<string, unknown> = {
        id: userId,
        email: email || null,
        updated_at: new Date().toISOString(),
    };

    if (fullName?.trim()) payload.full_name = fullName.trim();
    if (phone?.trim()) payload.phone = normalizePhone(phone);

    const client = getProfileClient(accessToken);
    const { error } = await client
        .from('profiles')
        .upsert(payload, { onConflict: 'id' });

    if (error) throw error;

    const profile = await getProfileById(userId, accessToken);

    return profile || {
        id: userId,
        full_name: fullName?.trim() || null,
        phone: phone?.trim() ? normalizePhone(phone) : null,
        email: email || null,
        phone_verified: false,
        app_role: 'broker',
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
    return fallback.data ? { ...fallback.data, app_role: 'broker' } : null;
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

router.post(ROUTE_PATHS.auth.requestVerification, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

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

router.post(ROUTE_PATHS.auth.password, async (req, res) => {
    const { mode, email, password, fullName, phone, referralCode } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

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
                    return res.status(400).json({ error: message });
                }
            }

            await sleep(750);
        }

        let authError: any = null;
        let authData: any = null;
        const authClient = createSupabaseAnonClient();

        for (let attempt = 0; attempt < 3; attempt += 1) {
            const { data, error } = await authClient.auth.signInWithPassword({
                email,
                password,
            });

            authError = error;
            authData = data;

            if (data?.session && data?.user) break;

            const normalizedMessage = (error?.message || '').toLowerCase();
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
            return res.status(400).json({ error: rawMessage });
        }

        const accessToken = authData.session.access_token;
        const authUserMetadata = (authData.user.user_metadata || {}) as Record<string, any>;
        let profile = await getProfileById(authData.user.id, accessToken);

        if (loginMode === 'signup') {
            profile = await upsertProfile(
                authData.user.id,
                authData.user.email || email,
                fullName,
                phone,
                accessToken
            );
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
        } else if (!profile) {
            const legacyUser = await getLegacyUserSeed(authData.user.id);
            profile = await upsertProfile(
                authData.user.id,
                authData.user.email || email || legacyUser?.email || null,
                authUserMetadata.full_name || legacyUser?.full_name || undefined,
                authUserMetadata.phone || legacyUser?.profile?.phone || undefined,
                accessToken
            );
        }

        const subscription = await subscriptionService.ensureTrialSubscription(authData.user.id, authData.user.email || email);
        const referral = await referralService.getSummary(
            authData.user.id,
            authData.user.email || email,
            profile?.full_name || fullName || null,
        );

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
                }
                : null,
            subscription,
            referral,
        });
    } catch (error: any) {
        console.error('Password auth error:', error);
        return res.status(500).json({ error: error.message || 'Failed to authenticate' });
    }
});

router.post(ROUTE_PATHS.auth.verify, async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

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

router.post(ROUTE_PATHS.auth.refresh, async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required' });

    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            return res.status(503).json({ error: 'Supabase URL or anon key is not configured' });
        }

        const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                refresh_token: refreshToken,
            }).toString(),
        });

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

router.post(ROUTE_PATHS.auth.resetPassword, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

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
    const subscription = await subscriptionService.ensureTrialSubscription(user.id, user.email);
    const referral = await referralService.getSummary(
        user.id,
        user.email,
        profile?.full_name || user?.user_metadata?.full_name || null,
    );
    res.json({
        success: true,
        user: {
            id: user.id,
            email: user.email,
            appRole: profile?.app_role || (isOwnerSuperAdminEmail(user.email) ? 'super_admin' : 'broker'),
        },
        profile: profile
            ? {
                id: profile.id,
                fullName: profile.full_name,
                phone: profile.phone,
                email: profile.email,
                phoneVerified: profile.phone_verified,
                appRole: profile.app_role || (isOwnerSuperAdminEmail(user.email) ? 'super_admin' : 'broker'),
            }
            : null,
        subscription,
        referral,
    });
});

export default router;
function isOwnerSuperAdminEmail(email?: string | null) {
    return OWNER_SUPER_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}
