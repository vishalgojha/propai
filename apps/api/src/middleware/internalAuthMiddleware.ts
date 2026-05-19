import { Request, Response, NextFunction } from 'express';

function extractBearerToken(value?: string) {
    const header = String(value || '').trim();
    if (!header) return '';
    if (header.toLowerCase().startsWith('bearer ')) {
        return header.slice(7).trim();
    }
    return header;
}

export function internalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    const expected = String(process.env.WABRO_INTERNAL_TOKEN || '').trim();
    if (!expected) {
        return res.status(503).json({ error: 'Internal auth token is not configured' });
    }

    const candidate = extractBearerToken(req.get('x-internal-token') || req.get('authorization'));
    if (!candidate || candidate !== expected) {
        return res.status(401).json({ error: 'Unauthorized internal request' });
    }

    next();
}
