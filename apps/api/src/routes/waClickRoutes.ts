import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { waClickAPI } from '../apis';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';

const router = Router();

router.use(authMiddleware);

router.post('/', async (req, res) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const { listing_id, source, device } = req.body;
        if (!listing_id) {
            return res.status(400).json({ error: 'listing_id is required' });
        }

        const workspaceId = (req as any).tenantId || userId;
        const brokerPhone = await waClickAPI.getBrokerPhone(listing_id, workspaceId);
        if (!brokerPhone) {
            return res.status(404).json({ error: 'Listing not found' });
        }

        const result = await waClickAPI.logClick({
            listingId: listing_id,
            brokerPhone,
            userId,
            workspaceId,
            source: source || 'stream',
            device: device || 'web',
        });

        if (result.error) {
            return res.status(500).json({ error: result.error });
        }

        const cleanPhone = brokerPhone.replace(/^\+/, '');
        const redirectUrl = `https://wa.me/${cleanPhone}`;

        res.json({ redirect_url: redirectUrl, logged: true });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to log WA click') });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const workspaceId = (req as any).tenantId || userId;
        const date = req.query.date as string | undefined;
        const stats = await waClickAPI.getStats(workspaceId, date);

        res.json(stats);
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load WA click stats') });
    }
});

router.get('/listing/:id', async (req, res) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const workspaceId = (req as any).tenantId || userId;
        const listingId = req.params.id;
        const log = await waClickAPI.getListingLog(listingId, workspaceId);

        res.json(log);
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load listing click log') });
    }
});

router.get('/export', async (req, res) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const workspaceId = (req as any).tenantId || userId;
        const date = req.query.date as string | undefined;
        const rows = await waClickAPI.getExportRows(workspaceId, date);

        const header = 'clicked_at,listing_id,source,device\n';
        const csv = rows.map((row: any) =>
            `"${row.clicked_at}","${row.listing_id}","${row.source}","${row.device}"`
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="wa-clicks-${date || 'all'}.csv"`);
        res.send(header + csv);
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to export clicks') });
    }
});

export default router;
