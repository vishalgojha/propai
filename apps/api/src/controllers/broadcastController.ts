import { Request, Response } from 'express';
import { channelService } from '../services/channelService';

export const parseBroadcast = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const tenantId = String(req.body?.tenant_id || user?.id || '').trim();
        const message = String(req.body?.message || '').trim();
        const senderPhone = String(req.body?.sender_phone || '').trim();
        const senderName = String(req.body?.sender_name || '').trim();
        const remoteJid = String(req.body?.remote_jid || '').trim() || (senderPhone ? `${senderPhone}@s.whatsapp.net` : null);

        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant ID is required' });
        }

        if (!message) {
            return res.status(400).json({ success: false, error: 'Message is required' });
        }

        const items = await channelService.previewMessageParse(tenantId, {
            id: `preview:${Date.now()}`,
            session_label: 'preview',
            remote_jid: remoteJid,
            sender: senderName || senderPhone || 'preview',
            text: message,
            timestamp: new Date().toISOString(),
            created_at: new Date().toISOString(),
        });

        return res.json({
            success: true,
            total: items.length,
            items,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            error: error?.message || 'Failed to parse broadcast message',
        });
    }
};
