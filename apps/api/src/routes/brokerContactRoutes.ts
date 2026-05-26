import { Router } from 'express';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { brokerContactSyncService } from '../services/brokerContactSyncService';
import { whatsappGroupService } from '../services/whatsappGroupService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import { normalizePhoneFromJid } from '../utils/whatsappJidPhone';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

function normalizeBrokerContact(contact: any) {
  const assetTypes = Array.isArray(contact?.asset_types)
    ? contact.asset_types
    : Array.isArray(contact?.bhk_types)
      ? contact.bhk_types
      : [];
  const phone = normalizePhoneFromJid(contact?.phone);

  return {
    ...contact,
    asset_types: assetTypes,
    phone,
  };
}

router.get('/overlaps', async (req, res) => {
  try {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const tenantId = context.workspaceOwnerId;

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Database admin client is not configured' });
    }

    const groups = await whatsappGroupService.listGroups(tenantId, {
      includeArchived: false,
    });

    const phoneGroups = new Map<string, Map<string, {
      id: string;
      name: string;
      locality: string | null;
      category: string | null;
      sessionLabel: string | null;
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
          sessionLabel: string | null;
        }>();
        const groupJid = String((group as any).groupJid || '').trim();
        if (!groupJid) continue;

        existing.set(groupJid, {
          id: groupJid,
          name: String((group as any).name || groupJid || ''),
          locality: (group as any).locality || null,
          category: (group as any).category || null,
          sessionLabel: (group as any).sessionLabel || null,
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
      try {
        const { data: contacts, error: contactsError } = await supabaseAdmin
          .from('broker_contacts')
          .select('*')
          .eq('tenant_id', tenantId)
          .in('phone', contactLookupPhones);

        if (contactsError) {
          console.warn('[BrokerContacts] Overlap contact lookup failed, returning group-only overlaps:', contactsError);
        } else {
          contactsByPhone = new Map((contacts || []).map((contact: any) => {
            const normalized = normalizeBrokerContact(contact);
            return [normalized.phone, normalized];
          }));
        }
      } catch (lookupError) {
        console.warn('[BrokerContacts] Overlap contact lookup threw, returning group-only overlaps:', lookupError);
      }
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

    const loadContacts = async () => await supabaseAdmin!
      .from('broker_contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('listing_count', { ascending: false })
      .order('last_seen_at', { ascending: false });

    let { data: contacts, error } = await loadContacts();

    if (error) {
      console.error('[BrokerContacts] DB query failed:', error);
      return res.status(500).json({ error: 'Failed to fetch broker contacts', details: error.message });
    }

    if ((contacts || []).length <= 1) {
      try {
        await brokerContactSyncService.syncFromStoredGroups(tenantId, {
          minOverlap: 2,
        });
        const reloaded = await loadContacts();
        contacts = reloaded.data || [];
        error = reloaded.error;
      } catch (syncError) {
        console.error('[BrokerContacts] Bootstrap sync failed:', syncError);
      }
    }

    if (error) {
      console.error('[BrokerContacts] DB query failed after bootstrap sync:', error);
      return res.status(500).json({ error: 'Failed to fetch broker contacts', details: error.message });
    }

    const normalizedContacts = (contacts || [])
      .map((contact: any) => normalizeBrokerContact(contact))
      .filter((contact: any) => Boolean(contact.phone));
    res.json(normalizedContacts);
  } catch (error: unknown) {
    console.error('[BrokerContacts] Unexpected error:', error);
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load broker contacts') });
  }
});

export default router;
