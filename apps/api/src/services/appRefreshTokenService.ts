import crypto from 'crypto';
import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin || supabase;
const REFRESH_TOKEN_PREFIX = 'par_';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.APP_REFRESH_TOKEN_TTL_DAYS || 180);

function base64Url(input: Buffer) {
    return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function getExpiryDate() {
    return new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function normalizeIp(value?: string | null) {
    const first = String(value || '').split(',')[0]?.trim() || '';
    return first || null;
}

export function isAppRefreshToken(token?: string | null) {
    return String(token || '').startsWith(REFRESH_TOKEN_PREFIX);
}

export async function createAppRefreshToken(input: {
    userId: string;
    userAgent?: string | null;
    ipAddress?: string | null;
}) {
    const refreshToken = `${REFRESH_TOKEN_PREFIX}${base64Url(crypto.randomBytes(32))}`;
    const expiresAt = getExpiryDate();

    const { data, error } = await db
        .from('app_refresh_tokens')
        .insert({
            user_id: input.userId,
            token_hash: hashToken(refreshToken),
            expires_at: expiresAt.toISOString(),
            user_agent: input.userAgent ? String(input.userAgent).slice(0, 500) : null,
            ip_address: normalizeIp(input.ipAddress),
        })
        .select('id, expires_at')
        .single();

    if (error) {
        throw new Error(`Failed to create app refresh token: ${error.message}`);
    }

    return {
        refreshToken,
        refreshTokenId: String(data.id),
        expiresAt: String(data.expires_at || expiresAt.toISOString()),
    };
}

export async function rotateAppRefreshToken(refreshToken: string, input: {
    userAgent?: string | null;
    ipAddress?: string | null;
} = {}) {
    const tokenHash = hashToken(refreshToken);
    const now = new Date().toISOString();

    const { data: existing, error } = await db
        .from('app_refresh_tokens')
        .select('id, user_id, expires_at, revoked_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to load app refresh token: ${error.message}`);
    }

    if (!existing || existing.revoked_at || new Date(String(existing.expires_at)).getTime() <= Date.now()) {
        return null;
    }

    const next = await createAppRefreshToken({
        userId: String(existing.user_id),
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
    });

    const { error: updateError } = await db
        .from('app_refresh_tokens')
        .update({
            revoked_at: now,
            last_used_at: now,
            replaced_by: next.refreshTokenId,
        })
        .eq('id', existing.id)
        .is('revoked_at', null);

    if (updateError) {
        throw new Error(`Failed to rotate app refresh token: ${updateError.message}`);
    }

    return {
        userId: String(existing.user_id),
        refreshToken: next.refreshToken,
        expiresAt: next.expiresAt,
    };
}
