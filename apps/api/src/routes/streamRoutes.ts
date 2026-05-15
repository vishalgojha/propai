import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { streamAPI } from '../apis';
import type { StreamItem } from '../apis';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';

const router = Router();

router.use(authMiddleware);

// Get stream items with filters
router.get('/', async (req, res) => {
  try {
    const tenantId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const filters = {
      type: req.query.type ? String(req.query.type).split(',') : undefined,
      category: req.query.category as 'residential' | 'commercial' | undefined,
      locality: req.query.locality as string | undefined,
      minConfidence: req.query.minConfidence ? Number(req.query.minConfidence) : undefined,
      source: req.query.source as string | undefined,
      channelId: req.query.channelId as string | undefined,
      isRead: req.query.isRead ? req.query.isRead === 'true' : undefined,
      search: req.query.search as string | undefined,
    };

    const items = await streamAPI.getStreamItems(tenantId, filters);
    res.json(items);
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load stream items') });
  }
});

// Get stream stats
router.get('/stats', async (req, res) => {
  try {
    const tenantId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const stats = await streamAPI.getStats(tenantId);
    res.json(stats);
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load stream stats') });
  }
});

// Mark stream item as read
router.post('/:id/read', async (req, res) => {
  try {
    const tenantId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const itemId = req.params.id;
    await streamAPI.markAsRead(tenantId, itemId);
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to mark item as read') });
  }
});

// Correct stream item
router.post('/:id/correct', async (req, res) => {
  try {
    const tenantId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const itemId = req.params.id;
    const updates = req.body;
    await streamAPI.correctItem(tenantId, itemId, updates);
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to correct item') });
  }
});

export default router;
