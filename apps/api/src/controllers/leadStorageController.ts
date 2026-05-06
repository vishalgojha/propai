import { Request, Response } from 'express';
import { leadStorageService } from '../services/leadStorageService';

export const handleLeadStorage = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
        return res.status(401).json({ status: 'failure', error_message: 'Missing authorization token' });
    }

    try {
        const result = await leadStorageService.storeLeads(token, user.id, req.body);

        if (result.status === 'failure') {
            return res.status(400).json(result);
        }

        return res.json(result);
    } catch (error: any) {
        return res.status(500).json({
            status: 'failure',
            stored_count: 0,
            skipped_count: 0,
            error_message: error.message || 'Failed to store leads',
        });
    }
};
