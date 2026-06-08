import { Router } from 'express';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { brokerContactSyncService } from '../services/brokerContactSyncService';
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
  group_count: number | null;
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

type WhatsAppGroupRow = {
  workspace_id: string | null;
  group_jid: string | null;
  group_name: string | null;
  locality: string | null;
  category: string | null;
  participant_jids: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

type BrokerContactAggregate = {
  id: string;
  tenant_id: string;
  phone: string;
  display_name: string | null;
  inferred_areas: string[];
  source_groups: string[];
  group_count: number;
  unsubscribed: boolean;
  unsubscribed_at: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  listing_count: number;
  asset_types: string[];
  price_range_low: number | null;
  price_range_high: number | null;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function aggregateContacts(rows: BrokerContactRow[]): BrokerContactAggregate[] {
  const byPhone = new Map<string, BrokerContactAggregate>();

  for (const row of rows || []) {
    const phone = normalizePhoneFromJid(row.phone);
    if (!phone) continue;

    const existing = byPhone.get(phone) || {
      id: phone,
      tenant_id: String(row.tenant_id || ''),
      phone,
      display_name: row.display_name || null,
      inferred_areas: [],
      source_groups: [],
      group_count: 0,
      unsubscribed: false,
      unsubscribed_at: null,
      last_seen_at: row.last_seen_at || new Date(0).toISOString(),
      created_at: row.created_at || new Date(0).toISOString(),
      updated_at: row.updated_at || new Date(0).toISOString(),
      listing_count: 0,
      asset_types: [],
      price_range_low: row.price_range_low ?? null,
      price_range_high: row.price_range_high ?? null,
    };

    const inferredAreas = uniqueStrings([...(existing.inferred_areas || []), ...((row.inferred_areas || []) as string[])]);
    const sourceGroups = uniqueStrings([...(existing.source_groups || []), ...((row.source_groups || []) as string[])]);
    const assetTypes = uniqueStrings([
      ...(existing.asset_types || []),
      ...((row.asset_types || []) as string[]),
      ...((row.bhk_types || []) as string[]),
    ]);
    const nextLastSeen = existing.last_seen_at > String(row.last_seen_at || '') ? existing.last_seen_at : String(row.last_seen_at || existing.last_seen_at);
    const nextCreatedAt = existing.created_at < String(row.created_at || existing.created_at) ? existing.created_at : String(row.created_at || existing.created_at);
    const nextUpdatedAt = existing.updated_at > String(row.updated_at || '') ? existing.updated_at : String(row.updated_at || existing.updated_at);

    byPhone.set(phone, {
      ...existing,
      tenant_id: existing.tenant_id || String(row.tenant_id || ''),
      display_name: existing.display_name || row.display_name || null,
      inferred_areas: inferredAreas,
      source_groups: sourceGroups,
      group_count: sourceGroups.length,
      unsubscribed: existing.unsubscribed || Boolean(row.unsubscribed),
      unsubscribed_at: existing.unsubscribed_at || row.unsubscribed_at || null,
      last_seen_at: nextLastSeen,
      created_at: nextCreatedAt,
      updated_at: nextUpdatedAt,
      listing_count: existing.listing_count + Number(row.listing_count || 0),
      asset_types: assetTypes,
      price_range_low: existing.price_range_low ?? row.price_range_low ?? null,
      price_range_high: existing.price_range_high ?? row.price_range_high ?? null,
    });
  }

  return Array.from(byPhone.values()).sort((left, right) => {
    if (right.listing_count !== left.listing_count) return right.listing_count - left.listing_count;
    if (right.group_count !== left.group_count) return right.group_count - left.group_count;
    return String(left.display_name || left.phone).localeCompare(String(right.display_name || right.phone));
  });
}

function aggregateContactsFromGroups(rows: WhatsAppGroupRow[]): BrokerContactAggregate[] {
  const byPhone = new Map<string, BrokerContactAggregate>();

  for (const row of rows || []) {
    const tenantId = String(row.workspace_id || '').trim();
    const groupJid = String(row.group_jid || '').trim();
    if (!tenantId || !groupJid) continue;

    const participants = Array.isArray(row.participant_jids) ? row.participant_jids : [];
    const phones: string[] = Array.from(new Set(participants.map((jid) => normalizePhoneFromJid(jid)).filter(Boolean)));

    for (const phone of phones) {
      const existing = byPhone.get(phone) || {
        id: `${tenantId}:${phone}`,
        tenant_id: tenantId,
        phone,
        display_name: null,
        inferred_areas: [],
        source_groups: [],
        group_count: 0,
        unsubscribed: false,
        unsubscribed_at: null,
        last_seen_at: row.updated_at || row.created_at || new Date().toISOString(),
        created_at: row.created_at || new Date(0).toISOString(),
        updated_at: row.updated_at || row.created_at || new Date().toISOString(),
        listing_count: 0,
        asset_types: [],
        price_range_low: null,
        price_range_high: null,
      };

      const nextSourceGroups = uniqueStrings([...(existing.source_groups || []), groupJid]);
      const nextInferredAreas = uniqueStrings([...(existing.inferred_areas || []), row.locality || null]);

      byPhone.set(phone, {
        ...existing,
        tenant_id: existing.tenant_id || tenantId,
        source_groups: nextSourceGroups,
        group_count: nextSourceGroups.length,
        inferred_areas: nextInferredAreas,
        last_seen_at: existing.last_seen_at > String(row.updated_at || row.created_at || '') ? existing.last_seen_at : String(row.updated_at || row.created_at || existing.last_seen_at),
        created_at: existing.created_at < String(row.created_at || existing.created_at) ? existing.created_at : String(row.created_at || existing.created_at),
        updated_at: existing.updated_at > String(row.updated_at || row.created_at || '') ? existing.updated_at : String(row.updated_at || row.created_at || existing.updated_at),
      });
    }
  }

  return Array.from(byPhone.values());
}

router.post('/lists/generate', async (req, res) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Database admin client is not configured' });
    }

    const result = await brokerContactSyncService.syncFromStoredGroups(context.workspaceOwnerId);
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error('[BrokerContacts] Generate lists error:', error);
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to generate broadcast lists') });
  }
});

router.get('/lists', async (req, res) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Database admin client is not configured' });
    }

    const { data, error } = await supabaseAdmin
      .from('broadcast_lists')
      .select('id, name, contact_count, auto_generated')
      .eq('tenant_id', context.workspaceOwnerId)
      .order('contact_count', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch broadcast lists', details: error.message });
    }

    res.json({ lists: data || [] });
  } catch (error: unknown) {
    console.error('[BrokerContacts] Lists error:', error);
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load broadcast lists') });
  }
});

router.get('/overlaps', async (req, res) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Database admin client is not configured' });
    }

    const { data: contactRows, error: contactsError } = await supabaseAdmin
      .from('broker_contacts')
      .select('tenant_id, phone, display_name, inferred_areas, source_groups, group_count, unsubscribed, unsubscribed_at, last_seen_at, created_at, updated_at, listing_count, asset_types, price_range_low, price_range_high');

    if (contactsError) {
      return res.status(500).json({ error: 'Failed to fetch broker contacts', details: contactsError.message });
    }

    const aggregatedContacts = aggregateContacts((contactRows || []) as BrokerContactRow[]);

    const { data: groups, error: groupsError } = await supabaseAdmin
      .from('whatsapp_groups')
      .select('workspace_id, group_jid, group_name, locality, category, participant_jids')
      .eq('is_archived', false);

    if (groupsError) {
      return res.status(500).json({ error: 'Failed to fetch group membership data', details: groupsError.message });
    }

    const phoneGroups = new Map<string, Map<string, {
      id: string;
      name: string;
      locality: string | null;
      category: string | null;
      workspaceId: string | null;
    }>>();

    for (const group of groups || []) {
      const participants: string[] = Array.isArray((group as any).participantJids) ? (group as any).participantJids : [];
      const phones: string[] = Array.from(new Set(participants.map((jid) => normalizePhoneFromJid(jid)).filter(Boolean)));
      for (const phone of phones) {
        const existing = phoneGroups.get(phone) || new Map<string, {
          id: string;
          name: string;
          locality: string | null;
          category: string | null;
          workspaceId: string | null;
        }>();
        const groupJid = String((group as any).group_jid || '').trim();
        const workspaceId = String((group as any).workspace_id || '').trim();
        if (!groupJid) continue;

        const groupKey = `${workspaceId || 'workspace'}:${groupJid}`;
        existing.set(groupKey, {
          id: groupKey,
          name: String((group as any).name || groupJid || ''),
          locality: (group as any).locality || null,
          category: (group as any).category || null,
          workspaceId: workspaceId || null,
        });
        phoneGroups.set(phone, existing);
      }
    }

    const contactsByPhone = new Map(aggregatedContacts.map((contact) => [contact.phone, contact]));

    const overlaps = Array.from(phoneGroups.entries())
      .filter(([, sourceGroups]) => sourceGroups.size > 1)
      .map(([phone, sourceGroupsMap]) => {
        const sourceGroups = Array.from(sourceGroupsMap.values())
          .sort((left, right) => left.name.localeCompare(right.name));
        const contact = contactsByPhone.get(phone) || null;
        const inferredAreas = Array.from(new Set([
          ...((Array.isArray(contact?.inferred_areas) ? contact.inferred_areas : []) as string[]),
          ...sourceGroups.map((group) => group.locality).filter(Boolean) as string[],
        ]));

        return {
          id: contact?.id || phone,
          phone,
          display_name: contact?.display_name || null,
          inferred_areas: inferredAreas,
          source_groups: sourceGroups,
          group_count: sourceGroups.length,
          unsubscribed: Boolean(contact?.unsubscribed),
          last_seen_at: contact?.last_seen_at || null,
          listing_count: Number(contact?.listing_count || 0),
          asset_types: Array.isArray(contact?.asset_types) ? contact.asset_types : [],
          price_range_low: contact?.price_range_low ?? null,
          price_range_high: contact?.price_range_high ?? null,
        };
      })
      .sort((left, right) => {
        if (right.group_count !== left.group_count) return right.group_count - left.group_count;
        if (right.listing_count !== left.listing_count) return right.listing_count - left.listing_count;
        return String(left.display_name || left.phone).localeCompare(String(right.display_name || right.phone));
      });

    res.json(overlaps);
  } catch (error: unknown) {
    console.error('[BrokerContacts] Overlap unexpected error:', error);
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load overlapping contacts') });
  }
});

router.get('/', async (req, res) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Database admin client is not configured' });
    }

    try {
      if (!context.isSuperAdmin) {
        await brokerContactSyncService.syncFromStoredGroups(context.workspaceOwnerId);
      }
    } catch (syncError) {
      console.error('[BrokerContacts] Sync failed:', syncError);
    }

    const [contactQuery, groupQuery] = await Promise.all([
      supabaseAdmin
        .from('broker_contacts')
        .select('*')
        .order('updated_at', { ascending: false }),
      supabaseAdmin
        .from('whatsapp_groups')
        .select('workspace_id, group_jid, group_name, locality, category, participant_jids, created_at, updated_at')
        .eq('is_archived', false)
        .order('updated_at', { ascending: false }),
    ]);

    if (contactQuery.error) {
      console.error('[BrokerContacts] DB query failed:', contactQuery.error);
      return res.status(500).json({ error: 'Failed to fetch broker contacts', details: contactQuery.error.message });
    }

    if (groupQuery.error) {
      console.error('[BrokerContacts] Group query failed:', groupQuery.error);
      return res.status(500).json({ error: 'Failed to fetch broker group data', details: groupQuery.error.message });
    }

    const contacts = (contactQuery.data || []) as BrokerContactRow[];
    const groups = (groupQuery.data || []) as WhatsAppGroupRow[];

    const contactsForScope = [...aggregateContacts(contacts), ...aggregateContactsFromGroups(groups)];

    const mergedByPhone = new Map<string, BrokerContactAggregate>();
    for (const contact of contactsForScope) {
      const existing = mergedByPhone.get(contact.phone);
      if (!existing) {
        mergedByPhone.set(contact.phone, contact);
        continue;
      }

      mergedByPhone.set(contact.phone, {
        ...existing,
        tenant_id: existing.tenant_id || contact.tenant_id,
        display_name: existing.display_name || contact.display_name || null,
        inferred_areas: uniqueStrings([...(existing.inferred_areas || []), ...(contact.inferred_areas || [])]),
        source_groups: uniqueStrings([...(existing.source_groups || []), ...(contact.source_groups || [])]),
        group_count: uniqueStrings([...(existing.source_groups || []), ...(contact.source_groups || [])]).length,
        unsubscribed: existing.unsubscribed || contact.unsubscribed,
        unsubscribed_at: existing.unsubscribed_at || contact.unsubscribed_at,
        last_seen_at: existing.last_seen_at > contact.last_seen_at ? existing.last_seen_at : contact.last_seen_at,
        created_at: existing.created_at < contact.created_at ? existing.created_at : contact.created_at,
        updated_at: existing.updated_at > contact.updated_at ? existing.updated_at : contact.updated_at,
        listing_count: existing.listing_count + contact.listing_count,
        asset_types: uniqueStrings([...(existing.asset_types || []), ...(contact.asset_types || [])]),
        price_range_low: existing.price_range_low ?? contact.price_range_low ?? null,
        price_range_high: existing.price_range_high ?? contact.price_range_high ?? null,
      });
    }

    const normalizedContacts = Array.from(mergedByPhone.values())
      .filter((contact) => Boolean(contact.phone))
      .sort((left, right) => {
        if (right.listing_count !== left.listing_count) return right.listing_count - left.listing_count;
        if (right.group_count !== left.group_count) return right.group_count - left.group_count;
        return String(left.display_name || left.phone).localeCompare(String(right.display_name || right.phone));
      });

    res.json(normalizedContacts);
  } catch (error: unknown) {
    console.error('[BrokerContacts] Unexpected error:', error);
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load broker contacts') });
  }
});

export default router;
