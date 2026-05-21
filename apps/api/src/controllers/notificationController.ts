import { Request, Response } from 'express';
import { notificationService } from '../services/notificationService';

export async function subscribePush(req: Request, res: Response) {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { subscription, userAgent } = req.body;
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Invalid subscription' });
    }

    try {
        await notificationService.subscribe(tenantId, subscription, userAgent);
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to subscribe' });
    }
}

export async function unsubscribePush(req: Request, res: Response) {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Invalid subscription' });
    }

    await notificationService.unsubscribe(tenantId, subscription);
    return res.json({ success: true });
}
