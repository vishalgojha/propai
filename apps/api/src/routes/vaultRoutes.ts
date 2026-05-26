import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

router.use(authMiddleware);

// GET /api/vault — broker's saved listings and requirements
router.get('/', async (req, res) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const tenantId = context.workspaceOwnerId;

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Database client not configured' });
    }

    const [listingsRes, requirementsRes] = await Promise.all([
      supabaseAdmin
        .from('listings')
        .select('id, structured_data, raw_text, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabaseAdmin
        .from('lead_records')
        .select('lead_id, name, phone, location_hint, locality_canonical, budget, raw_text, created_at')
        .eq('tenant_id', tenantId)
        .eq('record_type', 'buyer_requirement')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    res.json({
      listings: listingsRes.data ?? [],
      requirements: requirementsRes.data ?? [],
    });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load vault') });
  }
});

export default router;
