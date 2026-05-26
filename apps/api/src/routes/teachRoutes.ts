import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import { localityAliasService } from '../services/localityAliasService';

const router = Router();

router.use(authMiddleware);

// GET /api/teach/unresolved — items needing review (last 7 days)
router.get('/unresolved', async (req, res) => {
  try {
    const parsedDays = typeof req.query.days === 'string' ? Number(req.query.days) : NaN;
    const days = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.min(90, Math.max(1, parsedDays)) : null;
    const limit = typeof req.query.limit === 'string' ? Math.min(500, Math.max(10, Number(req.query.limit))) : 200;
    const items = await localityAliasService.getUnresolvedItems(days, limit);
    res.json({ items, count: items.length });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load unresolved items') });
  }
});

// POST /api/teach/correct — save a correction + alias
router.post('/correct', async (req, res) => {
  try {
    const user = (req as any).user;
    const context = await workspaceAccessService.resolveContext(user ?? {});
    const tenantId = context.workspaceOwnerId;

    const { itemId, locality, bhk, type, priceNumeric, aliasFragment } = req.body as {
      itemId: string;
      locality?: string;
      bhk?: string;
      type?: string;
      priceNumeric?: number;
      aliasFragment?: string;
    };

    if (!itemId) {
      return res.status(400).json({ error: 'itemId is required' });
    }

    // Update the specific stream item
    await localityAliasService.correctItem(tenantId, itemId, { locality, bhk, type, priceNumeric });

    // If an alias was provided, save and propagate it
    let aliasResult: { id: string; updatedCount: number } | null = null;
    if (aliasFragment && locality) {
      aliasResult = await localityAliasService.saveAlias(aliasFragment, locality, user?.id || tenantId);
    }

    res.json({
      success: true,
      alias: aliasResult,
      message: aliasResult
        ? `Item updated. Alias saved — ${aliasResult.updatedCount} historical records also corrected.`
        : 'Item updated successfully.',
    });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to save correction') });
  }
});

// POST /api/teach/process-all — background batch backfill for all unresolved stream_items
router.post('/process-all', async (req, res) => {
  try {
    // Run synchronously with timeout protection
    const result = await localityAliasService.processAll();
    res.json({
      success: true,
      ...result,
      message: `Processed ${result.total} records. Resolved ${result.resolved}. ${result.queued} need review.`,
    });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to process all') });
  }
});

export default router;
