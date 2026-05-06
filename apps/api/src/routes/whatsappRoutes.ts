import { Router, Request, Response } from 'express';
import { connectWhatsApp, getQR, forceRefreshQR, getStatus, getMonitor, getInbox, disconnectWhatsApp, getMessages, sendMessage, sendBulkDirectMessages, getProfile, saveProfile, broadcastToGroups, getIngestionHealth, getDetailedHealth, getGroupHealth, getEvents, getGroups, getOutboundRecipients } from '../controllers/whatsappController';
import { ROUTE_PATHS } from './routePaths';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

router.post(ROUTE_PATHS.whatsapp.connect, connectWhatsApp);
router.get(ROUTE_PATHS.whatsapp.qr, getQR);
router.post(ROUTE_PATHS.whatsapp.qrForceRefresh, forceRefreshQR);
router.get(ROUTE_PATHS.whatsapp.status, getStatus);
router.get(ROUTE_PATHS.whatsapp.monitor, getMonitor);
router.get(ROUTE_PATHS.whatsapp.inbox, getInbox);
router.get(ROUTE_PATHS.whatsapp.health, getIngestionHealth);
router.get(ROUTE_PATHS.whatsapp.healthDetailed, getDetailedHealth);
router.get(ROUTE_PATHS.whatsapp.groupsHealth, getGroupHealth);
router.get(ROUTE_PATHS.whatsapp.events, getEvents);
router.get(ROUTE_PATHS.whatsapp.profile, getProfile);
router.post(ROUTE_PATHS.whatsapp.profile, saveProfile);
router.get(ROUTE_PATHS.whatsapp.messages, getMessages);
router.post(ROUTE_PATHS.whatsapp.send, sendMessage);
router.post(ROUTE_PATHS.whatsapp.sendBulk, sendBulkDirectMessages);
router.post(ROUTE_PATHS.whatsapp.broadcast, broadcastToGroups);
router.post(ROUTE_PATHS.whatsapp.disconnect, disconnectWhatsApp);
router.get(ROUTE_PATHS.whatsapp.groups, getGroups);
router.get(ROUTE_PATHS.whatsapp.recipients, getOutboundRecipients);

router.post(ROUTE_PATHS.whatsapp.config, async (req: Request, res: Response) => {
    const { group_id, behavior } = req.body;
    const tenant_id = (req as any).user?.id;
    // Simplified update for the prompt
    const { error } = await (require('../config/supabase').supabase)
        .from('group_configs')
        .upsert({ group_id, tenant_id, behavior });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

export default router;
