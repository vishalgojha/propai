import { Router } from 'express';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import { normalizePhoneFromJid } from '../utils/whatsappJidPhone';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

type BrokerContactRow = {
  tenant_id: string | null;
  phone: string | null;
  display_name: string | null;
  inferred_areas: string[] | null;
  source_groups: string[] | null;
  unsubscribed: boolean | null;
  unsubscribed_at: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  listing_count: number | null;
  asset_types?: string[] | null;
  bhk_types?: string[] | null;
  price_range_low?: number | null;
  price_range_high?: number | null;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

router.get('/', async (_req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Database admin client is not configured' });
    }

    // The directory is WABA-native. Contacts enter it through broker onboarding
    // and direct broker CRM activity, never through WhatsApp group membership.
    const { data, error } = await supabaseAdmin
      .from('broker_contacts')
      .select('tenant_id, phone, display_name, inferred_areas, source_groups, unsubscribed, unsubscribed_at, last_seen_at, created_at, updated_at, listing_count, asset_types, bhk_types, price_range_low, price_range_high')
      .order('updated_at', { ascending: false });
    if (error) {
      return res.status(500).json({ error: 'Failed to fetch broker network', details: error.message });
    }

    const byPhone = new Map<string, Record<string, unknown>>();
    for (const row of (data || []) as BrokerContactRow[]) {
      const phone = normalizePhoneFromJid(row.phone);
      if (!phone) continue;

      const existing = byPhone.get(phone);
      const inferredAreas = uniqueStrings([...(Array.isArray(existing?.inferred_areas) ? existing.inferred_areas as string[] : []), ...(row.inferred_areas || [])]);
      const assetTypes = uniqueStrings([
        ...(Array.isArray(existing?.asset_types) ? existing.asset_types as string[] : []),
        ...(row.asset_types || []),
        ...(row.bhk_types || []),
      ]);
      byPhone.set(phone, {
        id: phone,
        tenant_id: String(existing?.tenant_id || row.tenant_id || ''),
        phone,
        display_name: existing?.display_name || row.display_name || null,
        inferred_areas: inferredAreas,
        // Kept for API compatibility; it now records onboarding/CRM sources,
        // not WhatsApp groups.
        source_groups: uniqueStrings([...(Array.isArray(existing?.source_groups) ? existing.source_groups as string[] : []), ...(row.source_groups || [])]),
        group_count: 0,
        unsubscribed: Boolean(existing?.unsubscribed) || Boolean(row.unsubscribed),
        unsubscribed_at: existing?.unsubscribed_at || row.unsubscribed_at || null,
        last_seen_at: String(existing?.last_seen_at || row.last_seen_at || new Date(0).toISOString()),
        created_at: String(existing?.created_at || row.created_at || new Date(0).toISOString()),
        updated_at: String(existing?.updated_at || row.updated_at || new Date(0).toISOString()),
        listing_count: Number(existing?.listing_count || 0) + Number(row.listing_count || 0),
        asset_types: assetTypes,
        price_range_low: existing?.price_range_low ?? row.price_range_low ?? null,
        price_range_high: existing?.price_range_high ?? row.price_range_high ?? null,
      });
    }

    const contacts = Array.from(byPhone.values())
      .sort((left, right) => Number(right.listing_count || 0) - Number(left.listing_count || 0));
    res.json(contacts);
  } catch (error: unknown) {
    console.error('[BrokerContacts] Unexpected error:', error);
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load broker network') });
  }
});

export default router;
