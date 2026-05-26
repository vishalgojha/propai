import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { streamAPI } from '../apis';
import { channelService } from '../services/channelService';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import { resolveStreamAccess, STREAM_ACCESS_DENIED_MESSAGE } from '../services/streamAccessService';

const router = Router();

router.use(authMiddleware);

// Get stream items with filters
router.get('/', async (req, res) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const tenantId = context.workspaceOwnerId;
    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const channelId = typeof req.query.channelId === 'string' ? req.query.channelId : null;
    const sessionLabel = typeof req.query.sessionLabel === 'string' ? req.query.sessionLabel : null;

    const access = await resolveStreamAccess(tenantId, context.currentUserEmail);
    if (!access.canViewStream) {
      return res.status(403).json({ error: STREAM_ACCESS_DENIED_MESSAGE });
    }

    const networkMode = access.networkMode;
    const items = await channelService.listStreamItems(tenantId, accessToken, channelId, sessionLabel, networkMode, undefined, context.currentUserEmail);
    res.json({
      items,
      network_mode: networkMode,
      total: items.length,
    });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load stream items') });
  }
});

// Get stream stats
router.get('/stats', async (req, res) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const tenantId = context.workspaceOwnerId;
    const access = await resolveStreamAccess(tenantId, context.currentUserEmail);
    if (!access.canViewStream) {
      return res.status(403).json({ error: STREAM_ACCESS_DENIED_MESSAGE });
    }

    const stats = await streamAPI.getStats(tenantId);
    res.json(stats);
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load stream stats') });
  }
});

// Mark stream item as read
router.post('/:id/read', async (req, res) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const tenantId = context.workspaceOwnerId;
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
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const tenantId = context.workspaceOwnerId;
    const itemId = req.params.id;
    const updates = req.body;
    await streamAPI.correctItem(tenantId, itemId, updates);
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to correct item') });
  }
});

export default router;
