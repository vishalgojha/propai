import { Request, Response } from 'express';
import { parseBroadcastMessage } from '../services/broadcastParserService';

export const parseBroadcast = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const tenantId = String(req.body?.tenant_id || user?.id || '').trim();
        const message = String(req.body?.message || '').trim();
        const senderPhone = String(req.body?.sender_phone || '').trim();
        const senderName = String(req.body?.sender_name || '').trim();

        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant ID is required' });
        }

        if (!message) {
            return res.status(400).json({ success: false, error: 'Message is required' });
        }

        if (!senderPhone) {
            return res.status(400).json({ success: false, error: 'Sender phone is required' });
        }

        if (!senderName) {
            return res.status(400).json({ success: false, error: 'Sender name is required' });
        }

        const result = await parseBroadcastMessage({
            message,
            senderPhone,
            senderName,
            tenantId,
        });

        return res.json(result);
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            error: error?.message || 'Failed to parse broadcast message',
        });
    }
};
