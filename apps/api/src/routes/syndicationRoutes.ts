import { Router } from 'express';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

function requireAdminClient(res: any) {
  if (!supabaseAdmin) {
    res.status(503).json({ error: 'Database admin client is not configured' });
    return false;
  }
  return true;
}

function isMissingSyndicationSchemaError(error: unknown) {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const haystack = [
    candidate?.message,
    candidate?.details,
    candidate?.hint,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  return candidate?.code === '42P01'
    || candidate?.code === '42703'
    || haystack.includes('broker_syndications')
    || haystack.includes('requester_label')
    || haystack.includes('acceptor_label')
    || haystack.includes('schema cache');
}

// ── POST /invite — generate a syndication invite token ────────────────────
router.post('/invite', async (req, res) => {
  try {
    if (!requireAdminClient(res)) return;

    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const workspaceId = context.workspaceOwnerId;

    const { scope } = req.body || {};
    const validScope = Array.isArray(scope) ? scope.filter((s: string) => ['rent', 'sale', 'requirement'].includes(s)) : ['rent', 'sale'];

    const { data: profile } = await supabaseAdmin!
      .from('profiles')
      .select('full_name')
      .eq('id', workspaceId)
      .maybeSingle();

    const requesterLabel = (profile as any)?.full_name || context.currentUserEmail || 'Broker';

    const { data: syndication, error } = await supabaseAdmin!
      .from('broker_syndications')
      .insert({
        requester_workspace_id: workspaceId,
        status: 'pending',
        scope: validScope,
        requester_label: requesterLabel,
      })
      .select()
      .single();

    if (error) {
      if (isMissingSyndicationSchemaError(error)) {
        return res.status(503).json({ error: 'Syndication feature is not yet available', details: 'The database schema is still being provisioned.' });
      }
      console.error('[Syndication] Invite insert failed:', error);
      return res.status(500).json({ error: 'Failed to create syndication invite', details: error.message });
    }

    res.status(201).json({
      id: syndication.id,
      token: syndication.syndication_token,
      inviteLink: `https://app.propai.live/syndication/accept?token=${syndication.syndication_token}`,
      scope: syndication.scope,
      status: syndication.status,
      createdAt: syndication.created_at,
    });
  } catch (error: unknown) {
    console.error('[Syndication] Invite error:', error);
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to create invite') });
  }
});

// ── POST /accept — accept a syndication invite via token ──────────────────
router.post('/accept', async (req, res) => {
  try {
    if (!requireAdminClient(res)) return;

    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const acceptorWorkspaceId = context.workspaceOwnerId;

    const { token } = req.body || {};
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Syndication token is required' });
    }

    const { data: syndication, error: fetchError } = await supabaseAdmin!
      .from('broker_syndications')
      .select('*')
      .eq('syndication_token', token)
      .maybeSingle();

    if (fetchError) {
      console.error('[Syndication] Accept fetch failed:', fetchError);
      return res.status(500).json({ error: 'Failed to look up invite', details: fetchError.message });
    }

    if (!syndication) {
      return res.status(404).json({ error: 'Invalid or expired syndication token' });
    }

    if (syndication.status !== 'pending') {
      return res.status(409).json({ error: `Syndication is already ${syndication.status}` });
    }

    if (syndication.requester_workspace_id === acceptorWorkspaceId) {
      return res.status(400).json({ error: 'Cannot accept your own syndication invite' });
    }

    // Fetch acceptor's display name
    const { data: acceptorProfile } = await supabaseAdmin!
      .from('profiles')
      .select('full_name')
      .eq('id', acceptorWorkspaceId)
      .maybeSingle();
    const acceptorLabel = (acceptorProfile as any)?.full_name || context.currentUserEmail || 'Broker';

    const { data: updated, error: updateError } = await supabaseAdmin!
      .from('broker_syndications')
      .update({
        acceptor_workspace_id: acceptorWorkspaceId,
        acceptor_label: acceptorLabel,
        status: 'active',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', syndication.id)
      .select()
      .single();

    if (updateError) {
      console.error('[Syndication] Accept update failed:', updateError);
      return res.status(500).json({ error: 'Failed to accept syndication', details: updateError.message });
    }

    res.json({
      id: updated.id,
      status: updated.status,
      partnerName: updated.requester_label,
      scope: updated.scope,
      acceptedAt: updated.accepted_at,
    });
  } catch (error: unknown) {
    console.error('[Syndication] Accept error:', error);
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to accept invite') });
  }
});

// ── GET /feed — exposed listing feed, authenticated via syndication_token ──
router.get('/feed', async (req, res) => {
  try {
    if (!requireAdminClient(res)) return;

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Syndication token required' });
    }

    const token = authHeader.split(' ')[1];

    const { data: syndication, error: fetchError } = await supabaseAdmin!
      .from('broker_syndications')
      .select('*')
      .eq('syndication_token', token)
      .maybeSingle();

    if (fetchError || !syndication) {
      return res.status(401).json({ error: 'Invalid syndication token' });
    }

    if (syndication.status !== 'active') {
      return res.status(403).json({ error: `Syndication is ${syndication.status}, not active` });
    }

    const workspaceId = syndication.requester_workspace_id;
    const scope = syndication.scope || ['rent', 'sale'];

    // Map scope values to stream_items type values
    const typeMap: Record<string, string[]> = {
      rent: ['Rent', 'Lease', 'Pre-leased'],
      sale: ['Sale'],
      requirement: ['Requirement'],
    };
    const allowedTypes = scope.flatMap((s: string) => typeMap[s.toLowerCase()] || []);

    const { data: items, error: itemsError } = await supabaseAdmin!
      .from('stream_items')
      .select('id, type, locality, city, bhk, price_numeric, price_label, area_sqft, property_category, furnishing, floor_number, total_floors, parsed_payload, raw_text, created_at')
      .eq('tenant_id', workspaceId)
      .in('type', allowedTypes)
      .not('ingestion_status', 'in', '("suppressed","expired")')
      .order('created_at', { ascending: false })
      .limit(100);

    if (itemsError) {
      console.error('[Syndication] Feed query failed:', itemsError);
      return res.status(500).json({ error: 'Failed to fetch feed' });
    }

    // Strip phone numbers from all returned data
    const stripPhone = (text: string): string =>
      String(text || '').replace(/(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, '[redacted]');

    const feed = (items || []).map((item: any) => ({
      external_id: item.id,
      type: item.type,
      locality: item.locality,
      city: item.city,
      bhk: item.bhk,
      priceNumeric: item.price_numeric,
      priceLabel: item.price_label,
      areaSqft: item.area_sqft,
      propertyCategory: item.property_category,
      furnishing: item.furnishing,
      floorNumber: item.floor_number,
      totalFloors: item.total_floors,
      title: stripPhone(String((item.parsed_payload as any)?.displayTitle || item.parsed_payload?.title || '')),
      description: stripPhone(String(item.parsed_payload?.description || '')),
      rawText: stripPhone(String(item.raw_text || '')),
      createdAt: item.created_at,
    }));

    res.json({
      workspaceId,
      partnerLabel: syndication.acceptor_label || 'Partner',
      count: feed.length,
      items: feed,
    });
  } catch (error: unknown) {
    console.error('[Syndication] Feed error:', error);
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to serve feed') });
  }
});

// ── GET /list — list all syndication relationships for current workspace ───
router.get('/list', async (req, res) => {
  try {
    if (!requireAdminClient(res)) return;

    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const workspaceId = context.workspaceOwnerId;

    const { data: asRequester, error: reqErr } = await supabaseAdmin!
      .from('broker_syndications')
      .select('*')
      .eq('requester_workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (reqErr) {
      if (isMissingSyndicationSchemaError(reqErr)) {
        return res.json({ outgoing: [], incoming: [] });
      }
      console.error('[Syndication] List requester query failed:', reqErr);
      return res.status(500).json({ error: 'Failed to list syndications' });
    }

    const { data: asAcceptor, error: accErr } = await supabaseAdmin!
      .from('broker_syndications')
      .select('*')
      .eq('acceptor_workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (accErr) {
      if (isMissingSyndicationSchemaError(accErr)) {
        return res.json({ outgoing: [], incoming: [] });
      }
      console.error('[Syndication] List acceptor query failed:', accErr);
      return res.status(500).json({ error: 'Failed to list syndications' });
    }

    const enrichPartnerName = (row: any, partnerIdField: string, labelField: string) => ({
      id: row.id,
      status: row.status,
      scope: row.scope,
      partnerName: row[labelField] || 'Unknown',
      direction: partnerIdField === 'acceptor_workspace_id' ? 'outgoing' : 'incoming',
      createdAt: row.created_at,
      acceptedAt: row.accepted_at,
    });

    res.json({
      outgoing: (asRequester || []).map((r) => enrichPartnerName(r, 'acceptor_workspace_id', 'acceptor_label')),
      incoming: (asAcceptor || []).map((r) => enrichPartnerName(r, 'requester_workspace_id', 'requester_label')),
    });
  } catch (error: unknown) {
    console.error('[Syndication] List error:', error);
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to list syndications') });
  }
});

// ── DELETE /:id — revoke a syndication relationship ────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    if (!requireAdminClient(res)) return;

    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const workspaceId = context.workspaceOwnerId;
    const syndicationId = req.params.id;

    const { data: existing, error: fetchError } = await supabaseAdmin!
      .from('broker_syndications')
      .select('*')
      .eq('id', syndicationId)
      .maybeSingle();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Syndication not found' });
    }

    if (existing.requester_workspace_id !== workspaceId && existing.acceptor_workspace_id !== workspaceId) {
      return res.status(403).json({ error: 'You do not own this syndication' });
    }

    const { error: updateError } = await supabaseAdmin!
      .from('broker_syndications')
      .update({ status: 'revoked' })
      .eq('id', syndicationId);

    if (updateError) {
      console.error('[Syndication] Revoke failed:', updateError);
      return res.status(500).json({ error: 'Failed to revoke syndication' });
    }

    res.json({ id: syndicationId, status: 'revoked' });
  } catch (error: unknown) {
    console.error('[Syndication] Revoke error:', error);
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to revoke syndication') });
  }
});

export default router;
