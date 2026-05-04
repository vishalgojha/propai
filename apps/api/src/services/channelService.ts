import { supabase, supabaseAdmin } from '../config/supabase';
import { normalizeMumbaiLocation } from '../utils/locationNormalization';
import { normalizeIndianPhoneNumber } from '../utils/phoneNormalization';

type BrokerProfileLookup = {
  id: string;
  full_name: string | null;
  agency_name: string | null;
  city: string | null;
  primary_phone: string | null;
  phone: string | null;
  team_contacts: Array<{ name?: string; phone?: string }> | null;
};

type ListingLike = Record<string, unknown> & {
  city?: string;
  broker_name?: string;
  broker_phone?: string;
  sender_name?: string;
  sender_phone?: string;
  locality?: string;
};

function normalizeLocationTag(input: string): string | null {
  const normalized = normalizeMumbaiLocation(input);
  const value = normalized.location || input.trim();
  return value ? value.replace(/\s+/g, ' ').trim() : null;
}

function dedupeLocations(locations: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const location of locations) {
    const normalized = normalizeLocationTag(location);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

async function findBrokerByPhone(senderPhone: string): Promise<BrokerProfileLookup | null> {
  if (!supabaseAdmin) {
    return null;
  }

  const normalizedPhone = normalizeIndianPhoneNumber(senderPhone);
  if (!normalizedPhone) {
    return null;
  }

  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, agency_name, city, primary_phone, phone, team_contacts')
    .or(`primary_phone.eq.${normalizedPhone},phone.eq.${normalizedPhone}`);

  if (error || !profiles?.length) {
    return null;
  }

  const directMatch = profiles.find((profile) => {
    return [profile.primary_phone, profile.phone]
      .map((value) => (value ? normalizeIndianPhoneNumber(value) : null))
      .includes(normalizedPhone);
  });

  if (directMatch) {
    return directMatch as BrokerProfileLookup;
  }

  const teamMatch = profiles.find((profile) => {
    const contacts = Array.isArray(profile.team_contacts) ? profile.team_contacts : [];
    return contacts.some((contact: { phone?: string }) => normalizeIndianPhoneNumber(contact.phone || '') === normalizedPhone);
  });

  return (teamMatch as BrokerProfileLookup) || null;
}

async function findBrokerByField(field: 'full_name' | 'agency_name', value: string): Promise<BrokerProfileLookup | null> {
  if (!supabaseAdmin || !value.trim()) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, agency_name, city, primary_phone, phone, team_contacts')
    .ilike(field, value.trim())
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }

  return (data as BrokerProfileLookup | null) ?? null;
}

export async function findBrokerByName(senderName: string): Promise<BrokerProfileLookup | null> {
  return findBrokerByField('full_name', senderName);
}

export async function findBrokerByAgency(senderName: string): Promise<BrokerProfileLookup | null> {
  return findBrokerByField('agency_name', senderName);
}

export async function resolveBrokerName(senderPhone: string, senderName: string): Promise<string> {
  const byPhone = await findBrokerByPhone(senderPhone);
  if (byPhone) {
    return byPhone.full_name ?? byPhone.agency_name ?? senderPhone;
  }

  const byName = await findBrokerByName(senderName);
  if (byName) {
    return byName.full_name ?? byName.agency_name ?? senderName;
  }

  const byAgency = await findBrokerByAgency(senderName);
  if (byAgency) {
    return byAgency.agency_name ?? senderName;
  }

  return senderName || senderPhone || 'Unknown';
}

export async function getBrokerProfileBySender(senderPhone: string, senderName: string): Promise<BrokerProfileLookup | null> {
  return (
    (await findBrokerByPhone(senderPhone)) ||
    (await findBrokerByName(senderName)) ||
    (await findBrokerByAgency(senderName)) ||
    null
  );
}

export async function syncBrokerChannels(brokerId: string, city: string, locations: string[]): Promise<void> {
  const normalizedLocations = dedupeLocations(locations);
  const normalizedCity = city.trim();

  if (!normalizedCity || normalizedLocations.length === 0) {
    const { error } = await supabase
      .from('channels')
      .delete()
      .eq('broker_id', brokerId)
      .eq('auto_created', true);

    if (error) {
      throw error;
    }

    return;
  }

  for (const locality of normalizedLocations) {
    const channelName = `${normalizedCity} | ${locality}`;
    const { data: existing } = await supabase
      .from('channels')
      .select('id')
      .eq('broker_id', brokerId)
      .eq('name', channelName)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('channels').insert({
        broker_id: brokerId,
        name: channelName,
        city: normalizedCity,
        locality,
        auto_created: true,
        created_at: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }
    }
  }

  const { data: existingChannels, error: fetchError } = await supabase
    .from('channels')
    .select('id, locality')
    .eq('broker_id', brokerId)
    .eq('auto_created', true);

  if (fetchError) {
    throw fetchError;
  }

  const desired = new Set(normalizedLocations.map((location) => location.toLowerCase()));
  const staleIds = (existingChannels || [])
    .filter((channel) => !desired.has(String(channel.locality || '').toLowerCase()))
    .map((channel) => channel.id);

  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('channels')
      .delete()
      .eq('broker_id', brokerId)
      .eq('auto_created', true)
      .in('id', staleIds);

    if (deleteError) {
      throw deleteError;
    }
  }
}

export function normalizeProfileLocations(locations: unknown): string[] {
  if (!Array.isArray(locations)) {
    return [];
  }

  return dedupeLocations(
    locations
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

export function normalizeTeamContacts(teamContacts: unknown): Array<{ name: string; phone: string }> {
  if (!Array.isArray(teamContacts)) {
    return [];
  }

  const unique = new Map<string, { name: string; phone: string }>();

  for (const entry of teamContacts) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const name = typeof (entry as { name?: unknown }).name === 'string'
      ? (entry as { name: string }).name.trim()
      : '';
    const phone = typeof (entry as { phone?: unknown }).phone === 'string'
      ? normalizeIndianPhoneNumber((entry as { phone: string }).phone)
      : null;

    if (!name || !phone) {
      continue;
    }

    unique.set(phone, { name, phone });
  }

  return Array.from(unique.values());
}

export async function applyBrokerProfileFallbacks(parsedItem: ListingLike, senderPhone: string, senderName: string): Promise<ListingLike> {
  const brokerProfile = await getBrokerProfileBySender(senderPhone, senderName);

  if (!parsedItem.broker_name) {
    parsedItem.broker_name = await resolveBrokerName(senderPhone, senderName);
  }

  if (!parsedItem.broker_phone) {
    parsedItem.broker_phone = normalizeIndianPhoneNumber(senderPhone) ?? senderPhone;
  }

  if (!parsedItem.city || parsedItem.city === 'Unknown') {
    parsedItem.city = brokerProfile?.city ?? 'Unknown';
  }

  return parsedItem;
}
