/// <reference types="node" />
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
declare const process: any;

type ExistingContactRow = {
  tenant_id: string;
  phone: string;
  display_name: string | null;
  inferred_areas: string[] | null;
  source_groups: string[] | null;
  unsubscribed: boolean | null;
  unsubscribed_at: string | null;
  last_seen_at: string | null;
};

type StoredGroupRow = {
  workspace_id: string | null;
  group_jid: string | null;
  group_name: string | null;
  locality: string | null;
  category: string | null;
  participant_jids: string[] | null;
};

type GroupSeed = {
  phone: string;
  sourceGroups: Set<string>;
  inferredAreas: Set<string>;
};

function normalizePhoneFromJidStrict(value?: string | null) {
  const jid = String(value || '').trim().toLowerCase();
  if (!jid) return '';

  const localPart = jid.split('@')[0] || '';
  const deviceSeparatorIndex = localPart.indexOf(':');
  const phoneCandidate = deviceSeparatorIndex >= 0 ? localPart.slice(0, deviceSeparatorIndex) : localPart;
  const digits = phoneCandidate.replace(/\D/g, '');

  if (/^91[6-9]\d{9}$/.test(digits)) return digits.slice(2);
  if (/^[6-9]\d{9}$/.test(digits)) return digits;
  return '';
}

function isValidBrokerPhone(phone: string) {
  return /^[6-9]\d{9}$/.test(String(phone || '').replace(/\D/g, ''));
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

async function deleteAllContactsForTenants(client: any, tenantIds: string[]) {
  if (tenantIds.length === 0) return 0;

  const { error } = await client
    .from('broker_contacts')
    .delete()
    .in('tenant_id', tenantIds);

  if (error) {
    throw new Error(error.message);
  }

  return tenantIds.length;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured');
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const dryRun = process.argv.includes('--dry-run');

  const { data: existingContacts, error: existingContactsError } = await client
    .from('broker_contacts')
    .select('tenant_id, phone, display_name, inferred_areas, source_groups, unsubscribed, unsubscribed_at, last_seen_at');
  if (existingContactsError) {
    throw new Error(existingContactsError.message);
  }

  const { data: groupRows, error: groupError } = await client
    .from('whatsapp_groups')
    .select('workspace_id, group_jid, group_name, locality, category, participant_jids')
    .eq('is_archived', false);
  if (groupError) {
    throw new Error(groupError.message);
  }

  const existingByTenantPhone = new Map<string, Map<string, ExistingContactRow>>();
  for (const row of (existingContacts || []) as ExistingContactRow[]) {
    const tenantId = String(row.tenant_id || '').trim();
    const phone = normalizePhoneFromJidStrict(row.phone);
    if (!tenantId || !phone) continue;

    const tenantMap = existingByTenantPhone.get(tenantId) || new Map<string, ExistingContactRow>();
    tenantMap.set(phone, row);
    existingByTenantPhone.set(tenantId, tenantMap);
  }

  const seedsByTenant = new Map<string, Map<string, GroupSeed>>();
  for (const row of (groupRows || []) as StoredGroupRow[]) {
    const tenantId = String(row.workspace_id || '').trim();
    const groupJid = String(row.group_jid || '').trim();
    if (!tenantId || !groupJid) continue;

    const participants = Array.isArray(row.participant_jids) ? row.participant_jids : [];
    for (const participantJid of participants) {
      const phone = normalizePhoneFromJidStrict(participantJid);
      if (!phone) continue;

      const tenantSeeds = seedsByTenant.get(tenantId) || new Map<string, GroupSeed>();
      const existing = tenantSeeds.get(phone) || {
        phone,
        sourceGroups: new Set<string>(),
        inferredAreas: new Set<string>(),
      };
      existing.sourceGroups.add(groupJid);
      if (row.locality) existing.inferredAreas.add(row.locality);
      tenantSeeds.set(phone, existing);
      seedsByTenant.set(tenantId, tenantSeeds);
    }
  }

  const invalidContacts = (existingContacts || []).filter((row: any) => !isValidBrokerPhone(String(row.phone || '')));
  const affectedTenantIds = uniqueStrings([
    ...Array.from(existingByTenantPhone.keys()),
    ...Array.from(seedsByTenant.keys()),
    ...uniqueStrings((invalidContacts as any[]).map((row) => String(row.tenant_id || '').trim())),
  ]);
  console.log(
    `[broker-cleanup] contacts=${existingContacts?.length || 0} invalid=${invalidContacts.length} affectedTenants=${affectedTenantIds.length}`,
  );

  if (dryRun) {
    console.log('[broker-cleanup] dry run only; no changes written');
    return;
  }

  await deleteAllContactsForTenants(client, affectedTenantIds);
  console.log(`[broker-cleanup] deleted broker_contacts for ${affectedTenantIds.length} tenants`);

  for (const tenantId of affectedTenantIds) {
    const tenantSeeds = seedsByTenant.get(tenantId) || new Map<string, GroupSeed>();
    const existingForTenant = existingByTenantPhone.get(tenantId) || new Map<string, ExistingContactRow>();
    let upserted = 0;

    for (const seed of tenantSeeds.values()) {
      const existing = existingForTenant.get(seed.phone) || null;
      const inferredAreas = uniqueStrings([
        ...(existing?.inferred_areas || []),
        ...Array.from(seed.inferredAreas),
      ]);
      const sourceGroups = uniqueStrings([
        ...(existing?.source_groups || []),
        ...Array.from(seed.sourceGroups),
      ]);

      const payload = {
        tenant_id: tenantId,
        phone: seed.phone,
        display_name: existing?.display_name || null,
        inferred_areas: inferredAreas,
        source_groups: sourceGroups,
        group_count: sourceGroups.length,
        unsubscribed: Boolean(existing?.unsubscribed),
        unsubscribed_at: existing?.unsubscribed_at || null,
        last_seen_at: existing?.last_seen_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await client
        .from('broker_contacts')
        .upsert(payload, { onConflict: 'tenant_id,phone' });
      if (error) {
        throw new Error(error.message);
      }
      upserted += 1;
    }

    console.log(`[broker-cleanup] rebuilt tenant=${tenantId} contacts=${upserted} groups=${tenantSeeds.size}`);
  }

  const { data: remainingContacts, error: remainingError } = await client
    .from('broker_contacts')
    .select('tenant_id, phone');
  if (remainingError) {
    throw new Error(remainingError.message);
  }

  const stillInvalid = (remainingContacts || []).filter((row: any) => !isValidBrokerPhone(String(row.phone || '')));
  console.log(`[broker-cleanup] remaining_invalid=${stillInvalid.length}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
