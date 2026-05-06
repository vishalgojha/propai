import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { streamAPI } from '../apis';
import type { StreamItem } from '../apis';

const router = Router();

router.use(authMiddleware);

// Get stream items with filters
router.get('/', async (req, res) => {
  const tenantId = (req as any).user?.id;
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
});

// Get stream stats
router.get('/stats', async (req, res) => {
  const tenantId = (req as any).user?.id;
  const stats = await streamAPI.getStats(tenantId);
  res.json(stats);
});

// Mark stream item as read
router.post('/:id/read', async (req, res) => {
  const tenantId = (req as any).user?.id;
  const itemId = req.params.id;
  
  await streamAPI.markAsRead(tenantId, itemId);
  res.json({ success: true });
});

// Correct stream item
router.post('/:id/correct', async (req, res) => {
  const tenantId = (req as any).user?.id;
  const itemId = req.params.id;
  const updates = req.body;
  
  await streamAPI.correctItem(tenantId, itemId, updates);
  res.json({ success: true });
});

export default router;
