import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { whatsappCloudApiService } from '../services/whatsappCloudApiService';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { z } from 'zod';

const router = Router();

const saveCloudConfigSchema = z.object({
    enabled: z.boolean().default(true),
    phoneNumberId: z.string().trim().min(1),
    businessAccountId: z.string().trim().optional().nullable(),
    displayPhoneNumber: z.string().trim().optional().nullable(),
    apiVersion: z.string().trim().optional().nullable(),
    verifyToken: z.string().trim().optional().nullable(),
    accessToken: z.string().trim().optional().nullable(),
});

router.get('/webhook', async (req: Request, res: Response) => {
    try {
        const mode = String(req.query['hub.mode'] || '').trim();
        const verifyToken = String(req.query['hub.verify_token'] || '').trim();
        const challenge = String(req.query['hub.challenge'] || '').trim();

        if (mode !== 'subscribe') {
            return res.status(400).json({ error: 'Invalid webhook mode' });
        }

        const result = await whatsappCloudApiService.verifyWebhookToken(verifyToken);
        if (!result.ok) {
            return res.status(result.status).send(result.error);
        }

        return res.status(200).send(challenge);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Webhook verification failed';
        return res.status(500).json({ error: message });
    }
});

router.post('/webhook', async (req: Request, res: Response) => {
    try {
        void whatsappCloudApiService.handleWebhook(req.body || {}).catch((error) => {
            console.error('[whatsappCloudRoutes] background webhook processing failed', error);
        });

        return res.status(200).json({
            success: true,
            queued: true,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Webhook processing failed';
        console.error('[whatsappCloudRoutes] webhook error', error);
        return res.status(500).json({ error: message });
    }
});

router.use(authMiddleware);

router.get('/config', async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const tenantId = context.workspaceOwnerId;
        const config = await whatsappCloudApiService.getConfig(tenantId);
        return res.json({ config });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load WhatsApp Cloud config';
        return res.status(500).json({ error: message });
    }
});

router.post('/config', validate(saveCloudConfigSchema), async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const tenantId = context.workspaceOwnerId;
        const config = await whatsappCloudApiService.saveConfig({
            tenantId,
            enabled: Boolean(req.body?.enabled),
            phoneNumberId: String(req.body?.phoneNumberId || '').trim(),
            businessAccountId: req.body?.businessAccountId ? String(req.body.businessAccountId).trim() : null,
            displayPhoneNumber: req.body?.displayPhoneNumber ? String(req.body.displayPhoneNumber).trim() : null,
            apiVersion: req.body?.apiVersion ? String(req.body.apiVersion).trim() : null,
            verifyToken: req.body?.verifyToken ? String(req.body.verifyToken).trim() : null,
            accessToken: req.body?.accessToken ? String(req.body.accessToken).trim() : null,
        });
        return res.json({ success: true, config });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save WhatsApp Cloud config';
        return res.status(500).json({ error: message });
    }
});

export default router;
