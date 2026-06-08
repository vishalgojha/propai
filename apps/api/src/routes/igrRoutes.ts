import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { igrQueryService } from '../services/igrQueryService';
import { igrEnrichmentService } from '../services/igrEnrichmentService';
import { igrLiveFetchService } from '../services/igrLiveFetchService';

const router = Router();

router.use(authMiddleware);

router.get('/building-names', async (req, res) => {
    try {
        const search = String(req.query.search || '').trim() || undefined;
        const names = await igrQueryService.getBuildingNames(search);
        const queueStatuses = await igrEnrichmentService.getQueueStatusPreviews(
            names.map((item) => ({
                buildingName: item.name,
                city: item.city,
            })),
        ).catch((error) => {
            const message = error instanceof Error ? error.message : String(error || '');
            if (!/igr_enrichment_queue|building_name|last_checked_at|status/i.test(message)) {
                console.warn('[IGRRoutes] Failed to load building queue statuses:', message);
            }
            return names.map(() => null);
        });
        return res.json({
            names: names.map((item, index) => ({
                ...item,
                igrQueueStatus: queueStatuses[index] || null,
            })),
        });
    } catch (error: any) {
        return res.status(500).json({
            error: error?.message || 'Failed to load building names',
        });
    }
});

router.get('/search', async (req, res) => {
    try {
        const buildingName = String(req.query.building_name || req.query.buildingName || '').trim();
        const locality = String(req.query.locality || '').trim();
        const city = String(req.query.city || '').trim();
        const months = Math.min(Math.max(Number(req.query.months || 6) || 6, 1), 24);
        const limit = Math.min(Math.max(Number(req.query.limit || 10) || 10, 1), 25);

        if (!buildingName && !locality && !city) {
            return res.status(400).json({ error: 'building_name, locality, or city is required' });
        }

        const [transactions, localityStats, latest] = await Promise.all([
            buildingName
                ? igrQueryService.getRecentTransactionsForListing(buildingName, locality || null, city || null, limit)
                : igrQueryService.searchTransactions({
                    locality: locality || undefined,
                    city: city || undefined,
                }),
            locality
                ? igrQueryService.getLocalityStats(locality, months)
                : Promise.resolve(null),
            buildingName
                ? igrQueryService.getLastTransactionForBuilding(buildingName, locality || null, city || null)
                : Promise.resolve(null),
        ]);

        return res.json({
            buildingName: buildingName || null,
            locality: locality || null,
            city: city || null,
            months,
            transactions,
            latestTransaction: latest,
            localityStats,
        });
    } catch (error: any) {
        return res.status(500).json({
            error: error?.message || 'Failed to load IGR data',
        });
    }
});

router.post('/fetch', async (req, res) => {
    try {
        const buildingName = String(req.body?.buildingName || req.body?.building_name || '').trim();
        const locality = String(req.body?.locality || '').trim();
        const city = String(req.body?.city || '').trim();

        if (!buildingName && !locality && !city) {
            return res.status(400).json({
                success: false,
                error: 'buildingName, locality, or city is required',
            });
        }

        const result = await Promise.race([
            igrLiveFetchService.fetchAndStore({ buildingName, locality }),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('IGR fetch timed out after 60 seconds')), 60_000)
            ),
        ]);

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.json(result);
    } catch (error: any) {
        const message = error?.message || 'Failed to fetch live IGR data';
        if (message.includes('timed out')) {
            return res.status(504).json({
                success: false,
                error: 'IGR fetch timed out. The government portal may be slow or unreachable. Try again later.',
            });
        }
        return res.status(500).json({
            success: false,
            error: message,
        });
    }
});

export default router;
