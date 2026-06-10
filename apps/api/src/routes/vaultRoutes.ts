import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { subscriptionService } from '../services/subscriptionService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import { supabaseAdmin } from '../config/supabase';
import { findLocality, validateLocalityPrice } from '../data/mumbai-localities';
import { parseIndianLocation, type ParsedLocation } from '../utils/locationParser';

const router = Router();

type VaultPostItem = {
  type: 'listing' | 'requirement';
  locality: string;
  bhk: string;
  dealType: 'rent' | 'sale' | 'lease';
  price?: number | string | null;
  budget?: number | string | null;
  furnishing?: string;
  areaSqft?: number | string | null;
  notes?: string;
};

type NormalizedVaultItem = {
  index: number;
  type: 'listing' | 'requirement';
  locality: string;
  bhk: string;
  dealType: VaultPostItem['dealType'];
  price: number | null;
  budget: number | null;
  areaSqft: number | null;
  furnishing: string | null;
  notes: string | null;
  localityInfo: ParsedLocation | null;
};

type BrokerContact = {
  name: string | null;
  phone: string;
};

const formatINR = (value: number) => `₹${new Intl.NumberFormat('en-IN').format(value)}`;

const coerceNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const raw = String(value).toLowerCase().replace(/,/g, ' ').trim();
  const unitMatch = raw.match(/(\d+(?:\.\d+)?)\s*(cr|crore|crores|lakh|lakhs|lac|lacs|l|k|thousand)\b/i);
  if (unitMatch) {
    const amount = Number(unitMatch[1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const unit = unitMatch[2].toLowerCase();
    if (unit === 'cr' || unit === 'crore' || unit === 'crores') return amount * 10000000;
    if (unit === 'lakh' || unit === 'lakhs' || unit === 'lac' || unit === 'lacs' || unit === 'l') return amount * 100000;
    if (unit === 'k' || unit === 'thousand') return amount * 1000;
  }

  const parsed = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const normalizeDealLabel = (dealType: VaultPostItem['dealType']) => {
  if (dealType === 'rent') return 'Rent';
  if (dealType === 'lease') return 'Lease';
  return 'Sale';
};

const makeLeadId = (tenantId: string) => `manual:${tenantId}:${Date.now()}:${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

const normalizeIndianMobile = (value?: string | null): string | null => {
  const digits = String(value || '').replace(/\D/g, '');
  const normalized = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.slice(-10);
  if (!/^[6-9]\d{9}$/.test(normalized)) return null;
  return `91${normalized}`;
};

const extractBrokerContacts = (text: string): BrokerContact[] => {
  const contacts: BrokerContact[] = [];
  const seen = new Set<string>();
  const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const cleaned = line.replace(/[*_`~]/g, ' ').replace(/\s+/g, ' ').trim();
    const matches = [...cleaned.matchAll(/(?:\+?\s*91[\s-]*)?([6-9]\d{2}[\s-]?\d{3}[\s-]?\d{4})\b/g)];
    for (const match of matches) {
      const phone = normalizeIndianMobile(match[0]);
      if (!phone || seen.has(phone)) continue;
      const before = cleaned.slice(0, match.index || 0).replace(/[-–—:|]+$/g, '').trim();
      const label = before.split(/\s+/).filter((word) => /^[A-Za-z][A-Za-z.]*$/.test(word)).slice(-2).join(' ') || null;
      contacts.push({ name: label, phone });
      seen.add(phone);
    }
  }

  return contacts;
};

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
    const payload = req.body as { items?: VaultPostItem[] } & Partial<VaultPostItem>;
    const items = Array.isArray(payload.items) && payload.items.length > 0
      ? payload.items
      : payload.type
        ? [payload as VaultPostItem]
        : [];

    if (items.length === 0) {
      return res.status(400).json({ error: 'Provide at least one manual listing or requirement.' });
    }

    const isSuperAdmin = await subscriptionService.isOwnerSuperAdmin(tenantId, userEmail);
    const canUseManualPosting = isSuperAdmin || plan === 'Pro';
    if (!canUseManualPosting) {
      return res.status(403).json({ error: 'Manual Vault posting is available on Pro and owner accounts only.' });
    }

    const listingLimit = await subscriptionService.getLimitForTenant(tenantId, plan, 'manualListings', userEmail);
    const requirementLimit = await subscriptionService.getLimitForTenant(tenantId, plan, 'manualRequirements', userEmail);

    const [listingCountRes, requirementCountRes] = await Promise.all([
      supabaseAdmin.from('stream_items_residential').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('source', 'manual').eq('record_type', 'listing'),
      supabaseAdmin.from('stream_items_residential').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('source', 'manual').eq('record_type', 'requirement'),
    ]);

    const requestedListingCount = items.filter((item) => item.type === 'listing').length;
    const requestedRequirementCount = items.filter((item) => item.type === 'requirement').length;

    if ((listingCountRes.count || 0) + requestedListingCount > listingLimit) {
      return res.status(403).json({ error: `Manual listing limit (${listingLimit}) reached. Upgrade to increase.` });
    }

    if ((requirementCountRes.count || 0) + requestedRequirementCount > requirementLimit) {
      return res.status(403).json({ error: `Manual requirement limit (${requirementLimit}) reached. Upgrade to increase.` });
    }

    const validationErrors: Array<{ index: number; errors: string[] }> = [];
    const normalizedItems: NormalizedVaultItem[] = items.map((item, index) => {
      const errors: string[] = [];
      const type = item.type === 'requirement' ? 'requirement' : 'listing';
      const locality = String(item.locality || '').trim();
      const bhk = String(item.bhk || '').trim();
      const dealType: VaultPostItem['dealType'] = item.dealType === 'sale' || item.dealType === 'lease' ? item.dealType : 'rent';
      const price = coerceNumber(item.price);
      const budget = coerceNumber(item.budget);
      const areaSqft = coerceNumber(item.areaSqft);
      const furnishing = String(item.furnishing || '').trim();
      const notes = String(item.notes || '').trim();

      if (!locality) errors.push('Locality is required');
      if (!bhk && type === 'listing' && !areaSqft) errors.push('Configuration or area is required');
      if (!bhk && type === 'requirement') errors.push('BHK is required');
      if (!item.dealType) errors.push('Deal type is required');
      if (type === 'listing' && !price) errors.push('Valid price is required for listings');
      if (type === 'requirement' && !budget) errors.push('Valid budget is required for requirements');

      const localityInfo = locality ? parseIndianLocation(locality) : null;
      if (locality && !localityInfo) {
        errors.push('Locality not recognized — please choose from the list');
      }

      const valueForCheck = type === 'listing' ? price : budget;
      const localityRecord = localityInfo ? findLocality(localityInfo.locality) : null;
      if (localityRecord && valueForCheck && dealType) {
        const priceCheck = validateLocalityPrice(localityRecord, dealType, valueForCheck);
        if (!priceCheck.valid) errors.push(priceCheck.message);
      }

      if (errors.length > 0) {
        validationErrors.push({ index, errors });
      }

      return {
        index,
        type,
        locality,
        bhk,
        dealType,
        price,
        budget,
        areaSqft,
        furnishing: furnishing || null,
        notes: notes || null,
        localityInfo,
      };
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: validationErrors });
    }

    const profile = await supabaseAdmin
      .from('profiles')
      .select('full_name, phone')
      .eq('id', tenantId)
      .maybeSingle();

    const brokerName = profile?.data?.full_name || null;
    const brokerPhone = profile?.data?.phone || null;
    const now = new Date().toISOString();

    const contactsByIndex = new Map<number, BrokerContact[]>();
    for (const item of normalizedItems) {
      contactsByIndex.set(item.index, extractBrokerContacts(item.notes || ''));
    }

    const listingsToInsert = normalizedItems
      .filter((item) => item.type === 'listing')
      .map((item) => {
        const contacts = contactsByIndex.get(item.index) || [];
        const primaryContact = contacts[0] || null;
        const messageId = `manual:${tenantId}:${Date.now()}:${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}:${item.index}`;
        const dealLabel = normalizeDealLabel(item.dealType);
        const priceLabel = item.price ? formatINR(item.price) : 'Price on Request';
        const configuration = item.bhk || (item.areaSqft ? `${item.areaSqft} sqft` : 'Property');
        const title = `${configuration} ${dealLabel} in ${item.locality}`.trim();
        const rawText = item.notes || `${configuration} in ${item.locality} — ${item.dealType} at ${priceLabel}${item.furnishing ? `, ${item.furnishing}` : ''}${item.areaSqft ? `, ${item.areaSqft} sqft` : ''}`;
        return {
          tenant_id: tenantId,
          source_group_id: 'vault-manual',
          structured_data: {
            bhk: configuration,
            locality: item.locality,
            deal_type: item.dealType,
            type: dealLabel,
            price_numeric: item.price,
            price: priceLabel,
            area_sqft: item.areaSqft,
            furnishing: item.furnishing,
            title,
            building: null,
            micro_location: item.localityInfo?.matchedAlias || item.locality,
            notes: item.notes,
            source: 'vault_manual',
            broker_name: primaryContact?.name || brokerName,
            broker_phone: primaryContact?.phone || brokerPhone,
            broker_contacts: contacts,
          },
          raw_text: rawText,
          status: 'Active',
          created_at: now,
        };
      });

    const requirementsToInsert = normalizedItems
      .filter((item) => item.type === 'requirement')
      .map((item) => {
        const leadId = makeLeadId(tenantId);
        const configuration = item.bhk || (item.areaSqft ? `${item.areaSqft} sqft` : 'Property');
        const rawText = item.notes || `${configuration} requirement in ${item.locality} — ${item.dealType} budget ${item.budget ? formatINR(item.budget) : 'TBD'}${item.furnishing ? `, ${item.furnishing}` : ''}`;
        const localityCanonical = item.localityInfo?.locality || item.locality;
        return {
          tenant_id: tenantId,
          lead_id: leadId,
          phone: brokerPhone || 'unknown',
          name: brokerName || 'Manual Requirement',
          record_type: 'buyer_requirement',
          dataset_mode: 'mixed',
          deal_type: item.dealType,
          asset_class: 'residential',
          price_basis: 'unknown',
          area_sqft: null,
          area_basis: 'unknown',
          budget: item.budget,
          location_hint: localityCanonical,
          city: item.localityInfo?.city || null,
          city_canonical: item.localityInfo?.city || null,
          locality_canonical: localityCanonical,
          micro_market: localityCanonical,
          matched_alias: item.localityInfo?.matchedAlias || localityCanonical,
          confidence: item.localityInfo ? Math.max(0.72, item.localityInfo.confidence / 100) : 0.72,
          unresolved_flag: !item.localityInfo,
          resolution_method: item.localityInfo?.resolvedVia || 'manual',
          urgency: 'medium',
          priority_bucket: 'P2',
          priority_score: 76,
          sentiment_score: 0.2,
          intent_score: 0.82,
          recency_score: 1,
          sentiment_risk: 0,
          raw_text: rawText,
          source: 'vault_manual',
          created_at: now,
          updated_at: now,
          payload: {
            source: 'vault_manual',
            postedBy: tenantId,
            postedAt: now,
            notes: item.notes || null,
            brokerName,
            brokerPhone,
          },
        };
      });

    const streamRows = normalizedItems.map((item) => {
      const contacts = contactsByIndex.get(item.index) || [];
      const primaryContact = contacts[0] || null;
      const sourcePhone = primaryContact?.phone || brokerPhone;
      const sourceLabel = primaryContact?.name || brokerName;
      const brokerWaMeLinks = contacts.length > 0
        ? contacts.map((contact) => `https://wa.me/${contact.phone}`)
        : (sourcePhone ? [`https://wa.me/${String(sourcePhone).replace(/\D/g, '')}`] : null);
      const messageId = `manual:${tenantId}:${Date.now()}:${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}:${item.index}`;
      const dealLabel = normalizeDealLabel(item.dealType);
      const priceNumeric = item.type === 'listing' ? item.price : item.budget;
      const priceLabel = priceNumeric ? formatINR(priceNumeric) : 'Price on Request';
      const configuration = item.bhk || (item.areaSqft ? `${item.areaSqft} sqft` : 'Property');
      const rawText = item.notes || `${configuration} in ${item.locality} — ${item.dealType} at ${priceLabel}${item.furnishing ? `, ${item.furnishing}` : ''}${item.areaSqft ? `, ${item.areaSqft} sqft` : ''}`;
      return {
        tenant_id: tenantId,
        message_id: messageId,
        raw_text: rawText,
        type: dealLabel,
        record_type: item.type,
        locality: item.locality,
        bhk: configuration,
        price_label: priceLabel,
        price_numeric: priceNumeric,
        furnishing: item.furnishing || null,
        area_sqft: item.areaSqft || null,
        property_category: 'residential',
        source: 'manual',
        source_phone: sourcePhone,
        broker_name: sourceLabel,
        broker_wa_me_links: brokerWaMeLinks,
        is_syndicated: true,
        confidence_score: 100,
        parsed_payload: {
          source: 'manual',
          postedBy: tenantId,
          postedAt: now,
          displayTitle: `${configuration} in ${item.locality} — ${dealLabel}`,
          notes: item.notes || null,
          brokerName: sourceLabel,
          brokerPhone: sourcePhone,
          brokerContacts: contacts,
          sourcePhone,
          sourceLabel,
          contactName: sourceLabel,
          contactPhone: sourcePhone,
        },
        ingestion_status: 'accepted',
        created_at: now,
      };
    });

    const [listingsInsertResult, requirementsInsertResult, streamInsertResult] = await Promise.all([
      listingsToInsert.length
        ? supabaseAdmin.from('listings').insert(listingsToInsert)
        : Promise.resolve({ error: null }),
      requirementsToInsert.length
        ? supabaseAdmin.from('lead_records').upsert(requirementsToInsert, { onConflict: 'tenant_id,lead_id' })
        : Promise.resolve({ error: null }),
      streamRows.length
        ? supabaseAdmin.from('stream_items_residential').insert(streamRows)
        : Promise.resolve({ error: null }),
    ]);

    const firstError = listingsInsertResult?.error || requirementsInsertResult?.error || streamInsertResult?.error;
    if (firstError) {
      return res.status(500).json({ error: `Failed to save: ${firstError.message}` });
    }

    res.status(201).json({
      success: true,
      listings: listingsToInsert.length,
      requirements: requirementsToInsert.length,
      streamItems: streamRows.length,
      message: `Saved ${listingsToInsert.length} listing(s) and ${requirementsToInsert.length} requirement(s). They are now visible in Vault and the shared stream.`,
    });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to post to vault') });
  }
});

export default router;
