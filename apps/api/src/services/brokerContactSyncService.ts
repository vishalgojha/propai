import { supabaseAdmin } from '../config/supabase';
import { generateBroadcastLists } from './broadcastListGenerator';
import { normalizePhoneFromJid } from '../utils/whatsappJidPhone';

const db = supabaseAdmin;

type StoredGroupRow = {
  group_jid: string | null;
  group_name: string | null;
  locality: string | null;
  category: string | null;
  session_label: string | null;
  participant_jids: string[] | null;
  is_archived?: boolean | null;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

type PhoneGroupMeta = {
  id: string;
  name: string;
  locality: string | null;
  category: string | null;
  sessionLabel: string | null;
};

export class BrokerContactSyncService {
  async syncFromStoredGroups(tenantId: string, options?: { sessionLabel?: string | null; minOverlap?: number }) {
    if (!db) {
      throw new Error('Database admin client is not configured');
    }

    const minOverlap = Math.max(1, Number(options?.minOverlap || 1));
    let query = db
      .from('whatsapp_groups')
      .select('group_jid, group_name, locality, category, session_label, participant_jids, is_archived')
      .eq('workspace_id', tenantId)
      .eq('is_archived', false);

    if (options?.sessionLabel) {
      query = query.eq('session_label', options.sessionLabel);
    }

    const { data: groups, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const phoneGroups = new Map<string, Map<string, PhoneGroupMeta>>();

    for (const group of (groups || []) as StoredGroupRow[]) {
      const groupJid = String(group.group_jid || '').trim();
      if (!groupJid) continue;

      const participants = Array.isArray(group.participant_jids) ? group.participant_jids : [];
      const phones = Array.from(new Set(participants.map((jid) => normalizePhoneFromJid(jid)).filter(Boolean)));
      for (const phone of phones) {
        const existing = phoneGroups.get(phone) || new Map<string, PhoneGroupMeta>();
        existing.set(groupJid, {
          id: groupJid,
          name: String(group.group_name || groupJid),
          locality: group.locality || null,
          category: group.category || null,
          sessionLabel: group.session_label || null,
        });
        phoneGroups.set(phone, existing);
      }
    }

    const contacts = Array.from(phoneGroups.entries())
      .map(([phone, sourceGroups]) => {
        const groupRows = Array.from(sourceGroups.values());
        return {
          phone,
          sourceGroups: groupRows.map((group) => group.id),
          groupCount: groupRows.length,
          inferredAreas: uniqueStrings(groupRows.map((group) => group.locality)),
          displayName: null as string | null,
        };
      });

    const overlappingContacts = contacts.filter((contact) => contact.groupCount >= minOverlap).length;

    let contactsUpserted = 0;
    for (const contact of contacts) {
      const { data: existing, error: existingError } = await db
        .from('broker_contacts')
        .select('id, display_name, inferred_areas, source_groups, group_count')
        .eq('tenant_id', tenantId)
        .eq('phone', contact.phone)
        .maybeSingle();

      if (existingError) {
        throw new Error(existingError.message);
      }

      const mergedAreas = uniqueStrings([...(existing?.inferred_areas || []), ...contact.inferredAreas]);
      const mergedGroups = uniqueStrings([...(existing?.source_groups || []), ...contact.sourceGroups]);

      if (existing?.id) {
        const { error: updateError } = await db
          .from('broker_contacts')
          .update({
            display_name: existing.display_name || contact.displayName,
            inferred_areas: mergedAreas,
            source_groups: mergedGroups,
            group_count: mergedGroups.length,
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (updateError) {
          throw new Error(updateError.message);
        }
      } else {
        const { error: insertError } = await db
          .from('broker_contacts')
          .insert({
            tenant_id: tenantId,
            phone: contact.phone,
            display_name: contact.displayName,
            inferred_areas: contact.inferredAreas,
            source_groups: contact.sourceGroups,
            group_count: contact.groupCount,
          });

        if (insertError) {
          throw new Error(insertError.message);
        }
      }

      contactsUpserted += 1;
    }

    const listsGenerated = await generateBroadcastLists(tenantId);

    return {
      groupsScanned: Array.isArray(groups) ? groups.length : 0,
      overlappingContacts,
      contactsUpserted,
      listsGenerated,
      minOverlap,
      sessionLabel: options?.sessionLabel || null,
    };
  }
}

export const brokerContactSyncService = new BrokerContactSyncService();
