import { Router, Request, Response } from 'express';
import { evolutionWebhookService } from '../services/evolutionWebhookService';

const router = Router();

router.post('/webhook/evolution', async (req: Request, res: Response) => {
    try {
        const rawBody = JSON.stringify(req.body || {});
        const signature = String(req.headers['x-evolution-signature'] || '').trim();

        const isValid = evolutionWebhookService.validateSignature(rawBody, signature);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const result = await evolutionWebhookService.handleWebhook(req.body || {}, rawBody);

        if (!result.ok) {
            return res.status(400).json({ error: result.message });
        }

        return res.status(200).json({ success: true, message: result.message });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Evolution webhook processing failed';
        console.error('[evolutionWebhookRoutes] error', error);
        return res.status(500).json({ error: message });
    }
});

export default router;
