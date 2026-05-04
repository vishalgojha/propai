import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { intelligenceAPI } from '../services/IntelligenceAPI';

const router = Router();

router.get('/igr/building', authMiddleware, async (req, res) => {
  const name = String(req.query.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const data = await intelligenceAPI.getLastTransactionForBuilding(name);
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to query IGR building transaction' });
  }
});

router.get('/igr/locality', authMiddleware, async (req, res) => {
  const name = String(req.query.name || '').trim();
  const months = Number(req.query.months || 6);

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const data = await intelligenceAPI.getLocalityStats(name, Number.isFinite(months) ? months : 6);
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to query IGR locality stats' });
  }
});

export default router;
