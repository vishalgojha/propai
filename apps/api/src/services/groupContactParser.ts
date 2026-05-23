import { supabaseAdmin } from '../config/supabase';
import { MUMBAI_LOCALITIES } from '../data/mumbai-localities';
import { sessionManager } from '../whatsapp/SessionManager';
import { generateBroadcastLists } from './broadcastListGenerator';

const db = supabaseAdmin;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractAreas(groupName: string): string[] {
  const normalized = normalize(groupName);
  if (!normalized) return [];

  const parts = normalized
    .split(/[-|&,]+|\band\b/)
    .map(s => s.trim())
    .filter(Boolean);

  const matched = new Set<string>();

  for (const part of parts) {
    for (const locality of MUMBAI_LOCALITIES) {
      const key = normalize(locality);
      if (key.length < 3) continue;
      if (part.includes(key)) {
        matched.add(locality);
      }
    }
  }

  return Array.from(matched);
}

/**
 * Returns true only for valid Indian mobile numbers.
 * Accepts:
 *   - 10 digits starting with 6-9  (e.g. 9820056180)
 *   - 12 digits starting with 91 followed by 6-9  (e.g. 919820056180)
 * Rejects international numbers, group JIDs, and any non-mobile strings.
 */
function isValidBrokerPhone(phone: string): boolean {
  if (/^[6-9]\d{9}$/.test(phone)) return true;
  if (/^91[6-9]\d{9}$/.test(phone)) return true;
  return false;
}

/**
 * Normalises a valid Indian mobile to a consistent 10-digit string.
 * Strips the leading "91" country code if present.
 */
function normalizeIndianPhone(phone: string): string {
  if (phone.startsWith('91') && phone.length === 12) return phone.slice(2);
  return phone;
}

function uniqueMerge<T>(a: T[], b: T[]): T[] {
  return Array.from(new Set([...a, ...b]));
}

export async function parseGroupsForContacts(tenantId: string): Promise<{
  contacts_upserted: number;
  groups_parsed: number;
  lists_generated: number;
}> {
  const sessions = await sessionManager.getAllSessionsForTenant(tenantId);
  if (!sessions.length) {
    throw new Error('No active WhatsApp sessions found for this workspace');
  }

  let contactsUpserted = 0;
  let groupsParsed = 0;
  const seenPhones = new Set<string>();

  for (const client of sessions) {
    let groups: any[];
    try {
      groups = await client.getGroups();
    } catch {
      continue;
    }

    for (const group of groups) {
      const areas = extractAreas(group.name);
      if (!areas.length) continue;

      groupsParsed++;

      let metadata: any;
      try {
        const sock = (client as any).socket;
        metadata = await sock?.groupMetadata?.(group.id);
      } catch {
        continue;
      }

      if (!metadata?.participants?.length) continue;

      for (const participant of metadata.participants) {
        const rawPhone = (participant.id || '').split('@')[0];
        if (!isValidBrokerPhone(rawPhone)) continue;
        const phone = normalizeIndianPhone(rawPhone);
        seenPhones.add(phone);

        const { data: existing } = await db!
          .from('broker_contacts')
          .select('id, inferred_areas, source_groups')
          .eq('tenant_id', tenantId)
          .eq('phone', phone)
          .maybeSingle();

        if (existing) {
          const mergedAreas = uniqueMerge(existing.inferred_areas || [], areas);
          const mergedGroups = uniqueMerge(existing.source_groups || [], [group.id]);

          const { error } = await db!
            .from('broker_contacts')
            .update({
              inferred_areas: mergedAreas,
              source_groups: mergedGroups,
              group_count: mergedGroups.length,
              last_seen_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          if (!error) contactsUpserted++;
        } else {
          const { error } = await db!
            .from('broker_contacts')
            .insert({
              tenant_id: tenantId,
              phone,
              display_name: participant.notify || participant.name || null,
              inferred_areas: areas,
              source_groups: [group.id],
              group_count: 1,
            });

          if (!error) contactsUpserted++;
        }
      }
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const listsGenerated = await generateBroadcastLists(tenantId);

  return {
    contacts_upserted: contactsUpserted,
    groups_parsed: groupsParsed,
    lists_generated: listsGenerated,
  };
}
