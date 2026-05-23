import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const tenantId = context.workspaceOwnerId;

    const { data: contacts, error } = await supabaseAdmin!
      .from('broker_contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('listing_count', { ascending: false })
      .order('last_seen_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch broker contacts' });
    }

    res.json(contacts || []);
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load broker contacts') });
  }
});

export default router;
