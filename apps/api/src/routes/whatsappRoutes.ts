import { Router } from 'express';
import { connectWhatsApp, getQR, getStatus, disconnectWhatsApp, getMessages, getParseTargets, sendMessage, updateGroupMonitor, updateParseConsent } from '../controllers/whatsappController';
import { sessionManager } from '../whatsapp/SessionManager';
import { Request, Response } from 'express';
import { whatsappParseConsentService } from '../services/whatsappParseConsentService';

const router = Router();

router.post('/connect', connectWhatsApp);
router.get('/qr', getQR);
router.get('/status', getStatus);
router.get('/messages', getMessages);
router.get('/parse-targets', getParseTargets);
router.post('/parse-consent', updateParseConsent);
router.post('/send', sendMessage);
router.post('/disconnect', disconnectWhatsApp);

router.get('/groups', async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user?.id;
    if (!tenantId) return res.status(400).json({ error: 'User not authenticated' });

    const clients = (await sessionManager.getAllSessionsForTenant(tenantId)).filter(Boolean) as any[];
    if (clients.length === 0) return res.status(404).json({ error: 'No session' });

    const discoveredGroups = new Map<string, { id: string; name: string; participantsCount?: number }>();

    for (const client of clients) {
        const groups = await client.getGroups();
        await whatsappParseConsentService.syncGroups(
            tenantId,
            client.getSessionLabel?.() || null,
            groups
        );

        for (const group of groups) {
            if (!discoveredGroups.has(group.id)) {
                discoveredGroups.set(group.id, group);
            }
        }
    }

    res.json(Array.from(discoveredGroups.values()));
});

router.post('/config', updateGroupMonitor);

export default router;
