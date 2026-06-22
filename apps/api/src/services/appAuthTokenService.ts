import crypto from 'crypto';

type AppAuthTokenPayload = {
    typ: 'propai-app-session';
    sub: string;
    email: string;
    phone?: string | null;
    full_name?: string | null;
    app_role?: string | null;
    iat: number;
    exp: number;
};

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const TOKEN_ISSUER = 'propai';
const TOKEN_AUDIENCE = 'propai-web';

function base64UrlEncode(input: string | Buffer) {
    return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string) {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
}

function getSecret() {
    const secret = String(
        process.env.JWT_SECRET ||
        process.env.SUPABASE_JWT_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        '',
    ).trim();
    if (!secret) {
        throw new Error('JWT_SECRET or SUPABASE_SERVICE_ROLE_KEY is not configured');
    }
    return secret;
}

function signPayload(payload: AppAuthTokenPayload) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const data = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
        .createHmac('sha256', getSecret())
        .update(data)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    return `${data}.${signature}`;
}

function verifySignature(token: string) {
    const parts = token.split('.');
    if (parts.length !== 3) {
        return null;
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const data = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = crypto
        .createHmac('sha256', getSecret())
        .update(data)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

    if (signature.length !== expectedSignature.length) {
        return null;
    }

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return null;
    }

    try {
        const payload = JSON.parse(base64UrlDecode(encodedPayload)) as AppAuthTokenPayload;
        if (!payload || payload.typ !== 'propai-app-session') {
            return null;
        }

        const now = Math.floor(Date.now() / 1000);
        if (!Number.isFinite(payload.exp) || payload.exp <= now) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}

export function createAppSessionToken(input: {
    userId: string;
    email: string;
    phone?: string | null;
    fullName?: string | null;
    appRole?: string | null;
}) {
    const now = Math.floor(Date.now() / 1000);
    const payload: AppAuthTokenPayload = {
        typ: 'propai-app-session',
        sub: input.userId,
        email: input.email,
        phone: input.phone || null,
        full_name: input.fullName || null,
        app_role: input.appRole || null,
        iat: now,
        exp: now + TOKEN_TTL_SECONDS,
    };

    return signPayload(payload);
}

export function verifyAppSessionToken(token: string) {
    return verifySignature(token);
}

export function getAppSessionExpiryMs() {
    return TOKEN_TTL_SECONDS * 1000;
}

export function getAppSessionTtlSeconds() {
    return TOKEN_TTL_SECONDS;
}
