import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ status: 'error', message: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];
    
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
