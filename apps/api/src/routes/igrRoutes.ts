import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { igrQueryService } from '../services/igrQueryService';
import { igrLiveFetchService } from '../services/igrLiveFetchService';

const router = Router();

router.use(authMiddleware);

router.get('/search', async (req, res) => {
    try {
        const buildingName = String(req.query.building_name || req.query.buildingName || '').trim();
        const locality = String(req.query.locality || '').trim();
        const months = Math.min(Math.max(Number(req.query.months || 6) || 6, 1), 24);
        const limit = Math.min(Math.max(Number(req.query.limit || 10) || 10, 1), 25);

        if (!buildingName && !locality) {
            return res.status(400).json({ error: 'building_name or locality is required' });
        }

        const [transactions, localityStats, latest] = await Promise.all([
            buildingName
                ? igrQueryService.getRecentTransactionsForListing(buildingName, locality || null, limit)
                : igrQueryService.searchTransactions({
                    locality: locality || undefined,
                }),
            locality
                ? igrQueryService.getLocalityStats(locality, months)
                : Promise.resolve(null),
            buildingName
                ? igrQueryService.getLastTransactionForBuilding(buildingName)
                : Promise.resolve(null),
        ]);

        return res.json({
            buildingName: buildingName || null,
            locality: locality || null,
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

        const result = await igrLiveFetchService.fetchAndStore({ buildingName, locality });

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.json(result);
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            error: error?.message || 'Failed to fetch live IGR data',
        });
    }
});

export default router;
