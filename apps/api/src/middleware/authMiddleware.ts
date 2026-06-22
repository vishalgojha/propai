import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { resolveImpersonationToken } from '../services/impersonationStore';
import { verifyAppSessionToken } from '../services/appAuthTokenService';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ status: 'error', message: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];

    // ── Impersonation path ───────────────────────────────────────────────────
    if (token.startsWith('imp_')) {
        const session = resolveImpersonationToken(token);
        if (!session) {
            return res.status(401).json({ status: 'error', message: 'Impersonation token expired or invalid' });
        }
        (req as any).user = {
            id: session.partnerId,
            email: session.partnerEmail,
            app_metadata: {},
            user_metadata: { full_name: session.partnerFullName },
            is_impersonation: true,
            impersonated_by: session.adminEmail,
        };
        (req as any).tenantId = session.tenantId;
        return next();
    }

    try {
        const appSession = verifyAppSessionToken(token);
        if (appSession) {
            (req as any).user = {
                id: appSession.sub,
                email: appSession.email,
                app_metadata: {
                    app_role: appSession.app_role || 'broker',
                },
                user_metadata: {
                    full_name: appSession.full_name || null,
                    phone: appSession.phone || null,
                },
                phone: appSession.phone || null,
            };
            return next();
        }
    } catch {
        // Fall back to the standard Supabase path below.
    }

    // ── Standard Supabase path ───────────────────────────────────────────────
    if (!supabaseAdmin) {
        return res.status(503).json({
            status: 'error',
            message: 'Supabase auth is not configured on this deployment',
        });
    }

    try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ status: 'error', message: 'Invalid or expired token' });
        }

        (req as any).user = user;
        next();
    } catch (e) {
        return res.status(500).json({ status: 'error', message: 'Authentication internal error' });
    }
};
