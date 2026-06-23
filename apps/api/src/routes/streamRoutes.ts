import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { streamAPI } from '../apis';
import { channelService } from '../services/channelService';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import { resolveStreamAccess } from '../services/streamAccessService';
import { unifiedSearch } from '../services/searchService';
import { supabaseAdmin } from '../config/supabase';

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

// Unified search with NLP parsing + fuzzy matching
router.post('/search', async (req, res) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const tenantId = context.workspaceOwnerId;
    const access = await resolveStreamAccess(tenantId, context.currentUserEmail);

    const { asset_class, query_string, limit, offset } = req.body;
    if (!query_string || typeof query_string !== 'string') {
      return res.status(400).json({ error: 'query_string is required' });
    }

    const assetClass = asset_class === 'commercial' ? 'commercial' : 'residential';
    const result = await unifiedSearch(
      tenantId,
      assetClass,
      query_string,
      Math.min(Number(limit) || 50, 200),
      Number(offset) || 0,
    );

    res.json({
      items: result.items,
      total: result.total,
      suggestions: result.suggestions,
      network_mode: access.networkMode,
    });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Search failed') });
  }
});

// Get photos for a stream item
router.get('/:id/photos', async (req, res) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const tenantId = context.workspaceOwnerId;
    const itemId = req.params.id;

    const tables = ['stream_items_residential', 'stream_items_commercial'] as const;
    let fileIds: string[] = [];

    for (const table of tables) {
      const { data } = await supabaseAdmin!
        .from(table)
        .select('parsed_payload')
        .eq('id', itemId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (data?.parsed_payload?.files && Array.isArray(data.parsed_payload.files)) {
        fileIds = data.parsed_payload.files;
        break;
      }
    }

    if (fileIds.length === 0) {
      return res.json({ photos: [] });
    }

    const { data: files } = await supabaseAdmin!
      .from('workspace_files')
      .select('id, file_name, mime_type, byte_size, storage_bucket, storage_path')
      .in('id', fileIds);

    if (!files || !Array.isArray(files)) {
      return res.json({ photos: [] });
    }

    const photos = await Promise.all(files.map(async (file) => {
      const isImage = String(file.mime_type || '').startsWith('image/');
      if (!isImage) return null;

      const { data: signed } = await supabaseAdmin!
        .storage
        .from(file.storage_bucket)
        .createSignedUrl(file.storage_path, 3600);

      if (!signed?.signedUrl) return null;

      return {
        id: file.id,
        url: signed.signedUrl,
        fileName: file.file_name,
        mimeType: file.mime_type,
        byteSize: file.byte_size,
      };
    }));

    res.json({ photos: photos.filter(Boolean) });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load photos') });
  }
});

export default router;
