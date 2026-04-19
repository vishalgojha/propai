import { Router } from 'express';
import { connectWhatsApp, getQR, getStatus, disconnectWhatsApp, getMessages, sendMessage } from '../controllers/whatsappController';
import { sessionManager } from '../whatsapp/SessionManager';
import { Request, Response } from 'express';

const router = Router();

router.post('/connect', connectWhatsApp);
router.get('/qr', getQR);
router.get('/status', getStatus);
router.get('/messages', getMessages);
router.post('/send', sendMessage);
router.post('/disconnect', disconnectWhatsApp);

router.get('/groups', async (req: Request, res: Response) => {
    const { tenantId } = req.query;
    const client = await sessionManager.getSession(tenantId as string);
    if (!client) return res.status(404).json({ error: 'No session' });
    
    const groups = await (client as any).getGroups();
    res.json(groups);
});

router.post('/config', async (req: Request, res: Response) => {
    const { group_id, tenant_id, behavior } = req.body;
    // Simplified update for the prompt
    const { error } = await (require('../config/supabase').supabase)
        .from('group_configs')
        .upsert({ group_id, tenant_id, behavior });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

export default router;
