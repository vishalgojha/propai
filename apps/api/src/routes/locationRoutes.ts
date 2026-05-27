import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { locationEnrichmentService } from '../services/locationEnrichmentService';

const router = Router();

router.use(authMiddleware);

router.post('/detect', async (req, res) => {
  try {
    const text = String(req.body?.text || req.body?.rawHint || '').trim();
    if (!text) {
      return res.status(400).json({ locality: null });
    }

    const locality = await locationEnrichmentService.detectLocality(text);
    return res.json({ locality });
  } catch (error: any) {
    return res.status(500).json({
      locality: null,
      error: error?.message || 'Failed to detect locality',
    });
  }
});

router.post('/enrich', async (req, res) => {
  try {
    const buildingName = String(req.body?.buildingName || req.body?.building_name || '').trim();
    const rawHint = String(req.body?.rawHint || req.body?.raw_hint || '').trim();
    const result = await locationEnrichmentService.enrichLocation({ buildingName, rawHint });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      locality: null,
      city: null,
      error: error?.message || 'Failed to enrich location',
    });
  }
});

export default router;
