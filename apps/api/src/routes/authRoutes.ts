import { Router } from 'express';
import { supabase, supabaseAdmin, supabaseAuth } from '../config/supabase';
import crypto from 'crypto';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.APP_URL || 'https://app.propai.live';

async function bootstrapProfile(user: any, startTrial = false) {
    if (!supabaseAdmin || !user?.id) {
        return null;
    }

    const profilePayload: Record<string, unknown> = {
        id: user.id,
        email: user.email,
        phone: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
        phone_verified: true,
    };

    if (startTrial) {
        profilePayload.trial_started_at = new Date().toISOString();
        profilePayload.trial_used = true;
    }

    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' })
        .select()
        .single();

    if (profileError) {
        throw profileError;
    }

    if (startTrial) {
        const { error: subscriptionError } = await supabaseAdmin
            .from('subscriptions')
            .upsert(
                {
                    tenant_id: user.id,
                    plan: 'Pro',
                    status: 'trial',
                },
                { onConflict: 'tenant_id' }
            );

        if (subscriptionError) {
            throw subscriptionError;
        }
    }

    return profile;
}

router.post('/password', async (req, res) => {
    if (!supabaseAuth) {
        return res.status(500).json({ error: 'Supabase auth client is not configured' });
    }

    const {
        email,
        password,
        fullName,
        phone,
        plan,
        startTrial = false,
        mode,
        intent,
    } = req.body ?? {};

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const authMode = mode || intent || (fullName || phone || plan ? 'signup' : 'signin');

    try {
        if (authMode === 'signup') {
            const { data, error } = await supabaseAuth.auth.signUp({
                email: normalizedEmail,
                password: String(password),
                options: {
                    data: {
                        full_name: fullName || null,
                        phone: phone || null,
                        trial_plan_intent: plan || null,
                    },
                    emailRedirectTo: `${APP_URL}/auth/callback`,
                },
            });

            if (error) {
                return res.status(400).json({ error: error.message });
            }

            if (data.user) {
                await bootstrapProfile(data.user, Boolean(startTrial));
            }

            return res.json({
                success: true,
                session: data.session,
                user: data.user,
            });
        }

        const { data, error } = await supabaseAuth.auth.signInWithPassword({
            email: normalizedEmail,
            password: String(password),
        });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        if (data.user) {
            await bootstrapProfile(data.user, false);
        }

        return res.json({
            success: true,
            session: data.session,
            user: data.user,
        });
    } catch (error: any) {
        console.error('Password auth error:', error);
        return res.status(500).json({ error: error.message || 'Authentication failed' });
    }
});

router.post('/refresh', async (req, res) => {
    if (!supabaseAuth) {
        return res.status(500).json({ error: 'Supabase auth client is not configured' });
    }

    const { refreshToken } = req.body ?? {};
    if (!refreshToken) {
        return res.status(400).json({ error: 'refreshToken is required' });
    }

    try {
        const { data, error } = await supabaseAuth.auth.refreshSession({
            refresh_token: String(refreshToken),
        });

        if (error || !data.session) {
            return res.status(400).json({ error: error?.message || 'Failed to refresh session' });
        }

        return res.json({
            success: true,
            session: data.session,
            user: data.user,
        });
    } catch (error: any) {
        console.error('Refresh auth error:', error);
        return res.status(500).json({ error: error.message || 'Failed to refresh session' });
    }
});

router.post('/reset-password', async (req, res) => {
    if (!supabaseAuth) {
        return res.status(500).json({ error: 'Supabase auth client is not configured' });
    }

    const { email, redirectTo } = req.body ?? {};
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const { error } = await supabaseAuth.auth.resetPasswordForEmail(String(email).trim().toLowerCase(), {
            redirectTo: redirectTo || `${APP_URL}/auth/callback`,
        });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.json({ success: true });
    } catch (error: any) {
        console.error('Reset password error:', error);
        return res.status(500).json({ error: error.message || 'Failed to send reset link' });
    }
});

router.get('/me', authMiddleware, async (req, res) => {
    const user = (req as any).user;

    try {
        let profile = null;
        let subscription = null;

        if (supabaseAdmin) {
            const [{ data: profileData }, { data: subscriptionData }] = await Promise.all([
                supabaseAdmin
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .maybeSingle(),
                supabaseAdmin
                    .from('subscriptions')
                    .select('*')
                    .eq('tenant_id', user.id)
                    .maybeSingle(),
            ]);

            profile = profileData ?? null;
            subscription = subscriptionData ?? null;
        }

        return res.json({
            success: true,
            user,
            profile,
            subscription,
        });
    } catch (error: any) {
        console.error('Get current user error:', error);
        return res.status(500).json({ error: error.message || 'Failed to load current user' });
    }
});

router.post('/request-verification', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    try {
        const token = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        await supabase
            .from('profiles')
            .upsert({ phone: email, verification_token: token, phone_verified: false, updated_at: new Date().toISOString() }, { onConflict: 'phone' });

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: process.env.EMAIL_FROM || 'PropAI <noreply@propai.live>',
                to: email,
                subject: 'Your PropAI verification code',
                html: `
                    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                        <h2 style="color: #10b981;">PropAI Verification</h2>
                        <p>Your verification code is:</p>
                        <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px; padding: 20px; background: #f3f4f6; border-radius: 8px; text-align: center; margin: 20px 0;">
                            ${token}
                        </div>
                        <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes.</p>
                        <p style="color: #6b7280; font-size: 12px;">If you didn't request this, ignore this email.</p>
                    </div>
                `
            })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Failed to send email');
        }

        res.json({ message: 'Verification code sent to your email' });
    } catch (error: any) {
        console.error('Email send error:', error);
        res.status(500).json({ error: error.message || 'Failed to send verification email' });
    }
});

router.post('/verify', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, verification_token, phone_verified')
        .eq('phone', email)
        .single();

    if (error || !profile) return res.status(400).json({ error: 'Profile not found' });

    if (profile.verification_token !== otp) {
        return res.status(400).json({ error: 'Invalid verification code' });
    }

    const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update({ phone_verified: true, verification_token: null })
        .eq('phone', email)
        .select()
        .single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    res.json({ success: true, user: updated });
});

router.post('/profile', authMiddleware, async (req, res) => {
    const user = (req as any).user;

    if (!supabaseAdmin) {
        return res.status(500).json({ error: 'Supabase admin client is not configured' });
    }

    try {
        const { startTrial = false } = req.body ?? {};
        const profile = await bootstrapProfile(user, startTrial);

        res.json({ success: true, profile });
    } catch (error: any) {
        console.error('Profile bootstrap error:', error);
        res.status(500).json({ error: error.message || 'Failed to initialize profile' });
    }
});

export default router;
