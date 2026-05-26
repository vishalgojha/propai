import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { subscriptionService } from '../services/subscriptionService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import { supabaseAdmin } from '../config/supabase';
import { findLocality, validateLocalityPrice } from '../data/mumbai-localities';

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

// POST /api/vault/post — manual listing or requirement entry
router.post('/post', async (req, res) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const tenantId = context.workspaceOwnerId;
    const userEmail = context.currentUserEmail;

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Database client not configured' });
    }

    const subscription = await subscriptionService.getSubscription(tenantId, userEmail);
    const plan = subscription.plan;
    const body = req.body as {
      type: 'listing' | 'requirement';
      locality: string;
      bhk: string;
      dealType: 'rent' | 'sale' | 'lease';
      price: number;
      furnishing?: string;
      areaSqft?: number;
      notes?: string;
      budget?: number;
    };

    if (!body.type || !['listing', 'requirement'].includes(body.type)) {
      return res.status(400).json({ error: 'Type must be "listing" or "requirement"' });
    }

    // Validate limits
    if (body.type === 'listing') {
      const limit = await subscriptionService.getLimitForTenant(tenantId, plan, 'manualListings', userEmail);
      const { count } = await supabaseAdmin
        .from('stream_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('record_type', 'listing')
        .eq('source', 'manual');
      if (count != null && count >= limit) {
        return res.status(403).json({ error: `Manual listing limit (${limit}) reached. Upgrade to increase.` });
      }
    } else {
      const limit = await subscriptionService.getLimitForTenant(tenantId, plan, 'manualRequirements', userEmail);
      const { count } = await supabaseAdmin
        .from('stream_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('record_type', 'requirement')
        .eq('source', 'manual');
      if (count != null && count >= limit) {
        return res.status(403).json({ error: `Manual requirement limit (${limit}) reached. Upgrade to increase.` });
      }
    }

    // Validate fields
    const errors: string[] = [];
    if (!body.locality?.trim()) errors.push('Locality is required');
    if (!body.bhk?.trim()) errors.push('BHK is required');
    if (!body.dealType) errors.push('Deal type is required');
    if (!body.price || body.price <= 0) errors.push('Valid price is required');

    // Locality validation
    let localityInfo = null;
    if (body.locality?.trim()) {
      localityInfo = findLocality(body.locality);
      if (!localityInfo) errors.push('Locality not recognized — please choose from the list');
    }

    // Price sanity check
    if (localityInfo && body.price > 0 && body.dealType) {
      const priceCheck = validateLocalityPrice(localityInfo, body.dealType, body.price);
      if (!priceCheck.valid) errors.push(priceCheck.message);
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const profile = await supabaseAdmin
      .from('profiles')
      .select('full_name, phone')
      .eq('id', tenantId)
      .maybeSingle();

    const brokerName = profile?.data?.full_name || null;
    const brokerPhone = profile?.data?.phone || null;
    const messageId = `manual:${tenantId}:${Date.now()}:${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

    const rawText = body.notes?.trim()
      || `${body.bhk} in ${body.locality} — ${body.dealType} at ₹${body.price}${body.furnishing ? `, ${body.furnishing}` : ''}${body.areaSqft ? `, ${body.areaSqft} sqft` : ''}`;

    const streamRow = {
      tenant_id: tenantId,
      message_id: messageId,
      raw_text: rawText,
      type: body.dealType === 'rent' ? 'Rent' : body.dealType === 'lease' ? 'Lease' : 'Sale',
      record_type: body.type,
      locality: body.locality.trim(),
      bhk: body.bhk.trim(),
      price_label: `₹${new Intl.NumberFormat('en-IN').format(body.price)}`,
      price_numeric: body.price,
      furnishing: body.furnishing || null,
      area_sqft: body.areaSqft || null,
      property_category: 'residential',
      source: 'manual',
      source_phone: brokerPhone,
      broker_name: brokerName,
      is_syndicated: true,
      confidence_score: 100,
      parsed_payload: {
        source: 'manual',
        postedBy: tenantId,
        postedAt: new Date().toISOString(),
        displayTitle: `${body.bhk} in ${body.locality} — ${body.dealType === 'rent' ? 'Rent' : body.dealType === 'lease' ? 'Lease' : 'Sale'}`,
        notes: body.notes || null,
        brokerName,
        brokerPhone,
      },
      ingestion_status: 'accepted',
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('stream_items')
      .insert(streamRow)
      .select('id')
      .single();

    if (error) {
      return res.status(500).json({ error: `Failed to save: ${error.message}` });
    }

    res.status(201).json({
      success: true,
      id: data?.id,
      message: `${body.type === 'listing' ? 'Listing' : 'Requirement'} posted successfully. It is now visible in the global stream.`,
    });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to post to vault') });
  }
});

export default router;
