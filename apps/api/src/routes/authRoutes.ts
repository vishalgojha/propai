import { Router } from 'express';
import { supabase, supabaseAdmin, supabaseAuth } from '../config/supabase';
import crypto from 'crypto';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.APP_URL || 'https://app.propai.live';
const MCP_CONNECTOR_PROVIDER = 'propai_mcp';
const MCP_TOKEN_SECRET_SOURCE =
    process.env.MCP_TOKEN_ENCRYPTION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.JWT_SECRET ||
    '';

function getMcpTokenSecret() {
    if (!MCP_TOKEN_SECRET_SOURCE) {
        throw new Error('MCP token encryption secret is not configured');
    }

    return crypto.createHash('sha256').update(MCP_TOKEN_SECRET_SOURCE).digest();
}

function createMcpConnectorToken() {
    return `propai_mcp_${crypto.randomBytes(24).toString('base64url')}`;
}

function hashMcpConnectorToken(token: string) {
    return `sha256:${crypto.createHash('sha256').update(token).digest('hex')}`;
}

function encryptMcpConnectorToken(token: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getMcpTokenSecret(), iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptMcpConnectorToken(value: string) {
    if (!value.startsWith('enc:')) {
        return null;
    }

    const payload = value.slice(4);
    const [ivPart, tagPart, encryptedPart] = payload.split('.');
    if (!ivPart || !tagPart || !encryptedPart) {
        throw new Error('Stored MCP token is malformed');
    }

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        getMcpTokenSecret(),
        Buffer.from(ivPart, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedPart, 'base64url')),
        decipher.final(),
    ]);
    return decrypted.toString('utf8');
}

async function bootstrapProfile(
    user: any,
    startTrial = false,
    profileInput: { fullName?: string | null; phone?: string | null } = {}
) {
    if (!supabaseAdmin || !user?.id) {
        return null;
    }

    const fullName = profileInput.fullName || user.user_metadata?.full_name || user.user_metadata?.name || null;
    const phone = profileInput.phone || user.user_metadata?.phone || null;

    const profilePayload: Record<string, unknown> = {
        id: user.id,
        email: user.email,
        phone,
        full_name: fullName,
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
    const normalizedFullName = fullName ? String(fullName).trim() : null;
    const normalizedPhone = phone ? String(phone).replace(/\D/g, '') : null;

    try {
        if (authMode === 'signup') {
            if (!supabaseAdmin) {
                return res.status(500).json({ error: 'Supabase service role client is not configured' });
            }

            if (!normalizedFullName || !normalizedPhone) {
                return res.status(400).json({ error: 'Full name and WhatsApp number are required' });
            }

            const { data: existingPhoneProfile, error: phoneLookupError } = await supabaseAdmin
                .from('profiles')
                .select('email')
                .eq('phone', normalizedPhone)
                .maybeSingle();

            if (phoneLookupError) {
                throw phoneLookupError;
            }

            if (existingPhoneProfile) {
                return res.status(409).json({
                    error: 'An account with this WhatsApp number already exists. Use Sign in instead.',
                });
            }

            const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email: normalizedEmail,
                password: String(password),
                email_confirm: true,
                user_metadata: {
                    full_name: normalizedFullName,
                    phone: normalizedPhone,
                    trial_plan_intent: plan || null,
                },
            });

            if (createError) {
                const message = createError.message || 'Could not create account';
                if (message.toLowerCase().includes('already')) {
                    return res.status(409).json({ error: 'An account with this email already exists. Use Sign in instead.' });
                }
                return res.status(400).json({ error: message });
            }

            if (createdUser.user) {
                await bootstrapProfile(createdUser.user, Boolean(startTrial), {
                    fullName: normalizedFullName,
                    phone: normalizedPhone,
                });
            }
        }

        const { data, error } = await supabaseAuth.auth.signInWithPassword({
            email: normalizedEmail,
            password: String(password),
        });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        if (data.user) {
            await bootstrapProfile(data.user, false, {
                fullName: authMode === 'signup' ? normalizedFullName : undefined,
                phone: authMode === 'signup' ? normalizedPhone : undefined,
            });
        }

        return res.json({
            success: true,
            session: data.session,
            user: data.user,
        });
    } catch (error: any) {
        console.error('Password auth error:', error);
        const message = String(error?.message || '');
        if (message.includes('profiles_phone_key')) {
            return res.status(409).json({ error: 'An account with this WhatsApp number already exists. Use Sign in instead.' });
        }
        if (message.includes('profiles_email_key')) {
            return res.status(409).json({ error: 'An account with this email already exists. Use Sign in instead.' });
        }
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

router.get('/mcp-token', authMiddleware, async (req, res) => {
    const user = (req as any).user;

    if (!supabaseAdmin) {
        return res.status(500).json({ error: 'Supabase admin client is not configured' });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('api_keys')
            .select('key, updated_at')
            .eq('tenant_id', user.id)
            .eq('provider', MCP_CONNECTOR_PROVIDER)
            .maybeSingle();

        if (error) {
            return res.status(500).json({ error: error.message || 'Failed to load connector token' });
        }

        if (!data) {
            return res.json({ success: true, hasToken: false });
        }

        if (typeof data.key !== 'string') {
            return res.status(500).json({ error: 'Stored connector token is invalid' });
        }

        if (data.key.startsWith('enc:')) {
            return res.json({
                success: true,
                hasToken: true,
                provider: MCP_CONNECTOR_PROVIDER,
                token: decryptMcpConnectorToken(data.key),
                token_type: 'bearer',
                endpoint: 'https://mcp.propai.live/mcp',
                updated_at: data.updated_at,
                retrievable: true,
            });
        }

        return res.json({
            success: true,
            hasToken: true,
            provider: MCP_CONNECTOR_PROVIDER,
            token: null,
            token_type: 'bearer',
            endpoint: 'https://mcp.propai.live/mcp',
            updated_at: data.updated_at,
            retrievable: false,
        });
    } catch (error: any) {
        console.error('Get MCP token error:', error);
        return res.status(500).json({ error: error.message || 'Failed to load connector token' });
    }
});

router.post('/mcp-token', authMiddleware, async (req, res) => {
    const user = (req as any).user;
    const shouldRegenerate = Boolean(req.body?.regenerate);

    if (!supabaseAdmin) {
        return res.status(500).json({ error: 'Supabase admin client is not configured' });
    }

    try {
        const { data: existingTokenRow, error: existingTokenError } = await supabaseAdmin
            .from('api_keys')
            .select('key, updated_at')
            .eq('tenant_id', user.id)
            .eq('provider', MCP_CONNECTOR_PROVIDER)
            .maybeSingle();

        if (existingTokenError) {
            return res.status(500).json({ error: existingTokenError.message || 'Failed to load existing connector token' });
        }

        if (existingTokenRow?.key && !shouldRegenerate) {
            if (existingTokenRow.key.startsWith('enc:')) {
                return res.json({
                    success: true,
                    provider: MCP_CONNECTOR_PROVIDER,
                    token: decryptMcpConnectorToken(existingTokenRow.key),
                    token_type: 'bearer',
                    endpoint: 'https://mcp.propai.live/mcp',
                    updated_at: existingTokenRow.updated_at,
                    retrievable: true,
                    reused: true,
                });
            }

            return res.status(409).json({
                error: 'Existing connector token uses legacy storage and cannot be retrieved. Regenerate it to continue.',
                legacy: true,
            });
        }

        const token = createMcpConnectorToken();
        const encryptedToken = encryptMcpConnectorToken(token);

        const { error } = await supabaseAdmin
            .from('api_keys')
            .upsert(
                {
                    tenant_id: user.id,
                    provider: MCP_CONNECTOR_PROVIDER,
                    key: encryptedToken,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'tenant_id, provider' }
            );

        if (error) {
            return res.status(500).json({ error: error.message || 'Failed to create connector token' });
        }

        return res.json({
            success: true,
            provider: MCP_CONNECTOR_PROVIDER,
            token,
            token_type: 'bearer',
            endpoint: 'https://mcp.propai.live/mcp',
            retrievable: true,
            reused: false,
        });
    } catch (error: any) {
        console.error('Create MCP token error:', error);
        return res.status(500).json({ error: error.message || 'Failed to create connector token' });
    }
});

router.delete('/mcp-token', authMiddleware, async (req, res) => {
    const user = (req as any).user;

    if (!supabaseAdmin) {
        return res.status(500).json({ error: 'Supabase admin client is not configured' });
    }

    try {
        const { error } = await supabaseAdmin
            .from('api_keys')
            .delete()
            .eq('tenant_id', user.id)
            .eq('provider', MCP_CONNECTOR_PROVIDER);

        if (error) {
            return res.status(500).json({ error: error.message || 'Failed to revoke connector token' });
        }

        return res.json({ success: true });
    } catch (error: any) {
        console.error('Delete MCP token error:', error);
        return res.status(500).json({ error: error.message || 'Failed to revoke connector token' });
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
