import { Router } from 'express';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

function normalizePhoneFromJid(value?: string | null) {
  const jid = String(value || '').trim().toLowerCase();
  if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@c.us')) {
    return '';
  }

  const digits = jid.split('@')[0]?.replace(/\D/g, '') || '';
  if (/^91[6-9]\d{9}$/.test(digits)) return digits.slice(2);
  if (/^[6-9]\d{9}$/.test(digits)) return digits;
  return '';
}

function normalizeBrokerContact(contact: any) {
  const assetTypes = Array.isArray(contact?.asset_types)
    ? contact.asset_types
    : Array.isArray(contact?.bhk_types)
      ? contact.bhk_types
      : [];

  return {
    ...contact,
    asset_types: assetTypes,
  };
}

router.get('/overlaps', async (req, res) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const tenantId = context.workspaceOwnerId;

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Database admin client is not configured' });
    }

    const { data: groups, error: groupsError } = await supabaseAdmin
      .from('whatsapp_groups')
      .select('group_jid, group_name, locality, category, participant_jids, session_label, is_archived')
      .eq('workspace_id', tenantId)
      .eq('is_archived', false);

    if (groupsError) {
      console.error('[BrokerContacts] Overlap group query failed:', groupsError);
      return res.status(500).json({ error: 'Failed to fetch overlapping contacts', details: groupsError.message });
    }

    const phoneGroups = new Map<string, Map<string, {
      id: string;
      name: string;
      locality: string | null;
      category: string | null;
      sessionLabel: string | null;
    }>>();

    for (const group of groups || []) {
      const participants: string[] = Array.isArray((group as any).participant_jids) ? (group as any).participant_jids : [];
      const phones: string[] = Array.from(new Set(participants.map((jid) => normalizePhoneFromJid(jid)).filter(Boolean)));
      for (const phone of phones) {
        const existing = phoneGroups.get(phone) || new Map<string, {
          id: string;
          name: string;
          locality: string | null;
          category: string | null;
          sessionLabel: string | null;
        }>();
        const groupJid = String((group as any).group_jid || '').trim();
        if (!groupJid) continue;

        existing.set(groupJid, {
          id: String((group as any).group_jid || ''),
          name: String((group as any).group_name || (group as any).group_jid || ''),
          locality: (group as any).locality || null,
          category: (group as any).category || null,
          sessionLabel: (group as any).session_label || null,
        });
        phoneGroups.set(phone, existing);
      }
    }

    const overlappingPhones = Array.from(phoneGroups.entries())
      .filter(([, sourceGroups]) => sourceGroups.size > 1)
      .map(([phone]) => phone);

    let contactsByPhone = new Map<string, any>();
    if (overlappingPhones.length > 0) {
      const contactLookupPhones = Array.from(new Set([
        ...overlappingPhones,
        ...overlappingPhones.map((phone) => `91${phone}`),
      ]));
      const { data: contacts, error: contactsError } = await supabaseAdmin
        .from('broker_contacts')
        .select('id, phone, display_name, inferred_areas, source_groups, group_count, unsubscribed, last_seen_at, listing_count, bhk_types, price_range_low, price_range_high')
        .eq('tenant_id', tenantId)
        .in('phone', contactLookupPhones);

      if (contactsError) {
        console.error('[BrokerContacts] Overlap contact query failed:', contactsError);
        return res.status(500).json({ error: 'Failed to fetch overlapping contacts', details: contactsError.message });
      }

      contactsByPhone = new Map((contacts || []).map((contact: any) => {
        const normalized = normalizeBrokerContact(contact);
        return [normalizePhoneFromJid(normalized.phone), normalized];
      }));
    }

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
    const tenantId = context.workspaceOwnerId;

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Database admin client is not configured' });
    }

    const { data: contacts, error } = await supabaseAdmin
      .from('broker_contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('listing_count', { ascending: false })
      .order('last_seen_at', { ascending: false });

    if (error) {
      console.error('[BrokerContacts] DB query failed:', error);
      return res.status(500).json({ error: 'Failed to fetch broker contacts', details: error.message });
    }

    res.json((contacts || []).map((contact: any) => normalizeBrokerContact(contact)));
  } catch (error: unknown) {
    console.error('[BrokerContacts] Unexpected error:', error);
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load broker contacts') });
  }
});

export default router;
