import { Router, Request, Response } from 'express';
import { intelligenceApi } from './IntelligenceAPI';

// Feature flag check - defaults to enabled if not set (for easier local dev)
function requireIntelligenceEnabled(req: Request, res: Response, next: any) {
  // Default to enabled if not explicitly disabled
  const enabled = process.env.INTELLIGENCE_ENABLED;
  const isEnabled = enabled === undefined || enabled === 'true' || enabled === '1';
  if (!isEnabled) {
    return res.status(503).json({ code: 'INTELLIGENCE_UNAVAILABLE', message: 'Intelligence is temporarily disabled' });
  }
  next();
}

const router = Router();

// Health is always public - always returns OK
router.get('/health', async (_req: Request, res: Response) => {
  const enabled = process.env.INTELLIGENCE_ENABLED;
  const isEnabled = enabled === undefined || enabled === 'true' || enabled === '1';
  res.json({ ok: true, component: 'intelligence', enabled: isEnabled });
});

// Status and analyze require intelligence to be enabled
router.get('/status', requireIntelligenceEnabled, async (_req: Request, res: Response) => {
  try {
    const status = await intelligenceApi.getStatus();
    res.json(status);
  } catch (e) {
    res.status(500).json({ code: 'INTEL_STATUS_FAIL', message: 'Failed to get status' });
  }
});

router.post('/analyze', requireIntelligenceEnabled, async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const result = await intelligenceApi.analyze(payload);
    res.json(result);
  } catch (e) {
    res.status(500).json({ code: 'INTEL_ANALYZE_FAIL', message: 'Failed to analyze data' });
  }
});

export default router;