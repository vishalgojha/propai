import { Router } from 'express';
import { supabase } from '../config/supabase';
import { normalizeIndianPhoneNumber } from '../utils/phoneNormalization';
import { normalizeProfileLocations, normalizeTeamContacts, syncBrokerChannels } from '../services/channelService';
import { subscriptionService } from '../services/subscriptionService';

const router = Router();

type RequestUser = {
  id: string;
  email?: string | null;
};

function getUser(req: any): RequestUser {
  return req.user as RequestUser;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

async function getProfilePayload(userId: string) {
  const [{ data: profile, error: profileError }, { count: connectedDevices }, subscription] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, agency_name, city, primary_phone, phone, locations, team_contacts, phone_verified, created_at')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('whatsapp_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', userId)
      .eq('status', 'connected'),
    subscriptionService.getSubscription(userId),
  ]);

  if (profileError) {
    throw profileError;
  }

  return {
    profile,
    plan: subscription,
    devicesConnected: connectedDevices ?? 0,
  };
}

async function getExistingProfile(userId: string) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, phone, full_name, agency_name, city, primary_phone, locations, team_contacts')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return profile;
}

router.get('/', async (req, res) => {
  try {
    const user = getUser(req);
    const payload = await getProfilePayload(user.id);
    return res.json(payload);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to load profile' });
  }
});

router.put('/', async (req, res) => {
  const user = getUser(req);
  const agencyName = normalizeOptionalText(req.body?.agency_name);
  const fullName = normalizeOptionalText(req.body?.full_name);
  const city = normalizeOptionalText(req.body?.city);
  const primaryPhoneInput = normalizeOptionalText(req.body?.primary_phone);
  const primaryPhone = primaryPhoneInput ? normalizeIndianPhoneNumber(primaryPhoneInput) : null;
  const locations = normalizeProfileLocations(req.body?.locations);

  if (primaryPhoneInput && !primaryPhone) {
    return res.status(400).json({ error: 'Primary phone must be a valid Indian mobile number' });
  }

  try {
    const currentProfile = await getExistingProfile(user.id);

    const payload = {
      id: user.id,
      email: currentProfile?.email ?? user.email ?? null,
      phone: currentProfile?.phone ?? user.email ?? `broker-${user.id}`,
      agency_name: agencyName,
      full_name: fullName,
      city,
      primary_phone: primaryPhone,
      locations,
      team_contacts: normalizeTeamContacts(currentProfile?.team_contacts),
    };

    const { data: profile, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select('id, email, full_name, agency_name, city, primary_phone, phone, locations, team_contacts, phone_verified, created_at')
      .single();

    if (error) {
      throw error;
    }

    await syncBrokerChannels(user.id, city ?? '', locations);

    const fullPayload = await getProfilePayload(user.id);
    return res.json({
      success: true,
      ...fullPayload,
      profile,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to update profile' });
  }
});

router.post('/team', async (req, res) => {
  const user = getUser(req);
  const name = normalizeOptionalText(req.body?.name);
  const rawPhone = normalizeOptionalText(req.body?.phone);
  const phone = rawPhone ? normalizeIndianPhoneNumber(rawPhone) : null;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Valid team member name and phone are required' });
  }

  try {
    const profile = await getExistingProfile(user.id);

    const current = normalizeTeamContacts(profile?.team_contacts);
    const next = normalizeTeamContacts([...current, { name, phone }]);

    const { data, error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: profile?.email ?? user.email ?? null,
          phone: profile?.phone ?? user.email ?? `broker-${user.id}`,
          team_contacts: next,
        },
        { onConflict: 'id' }
      )
      .select('team_contacts')
      .single();

    if (error) {
      throw error;
    }

    return res.json({ success: true, team_contacts: normalizeTeamContacts(data.team_contacts) });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to add team contact' });
  }
});

router.delete('/team/:phone', async (req, res) => {
  const user = getUser(req);
  const phone = normalizeIndianPhoneNumber(req.params.phone);

  if (!phone) {
    return res.status(400).json({ error: 'A valid team member phone is required' });
  }

  try {
    const profile = await getExistingProfile(user.id);

    const next = normalizeTeamContacts(profile?.team_contacts).filter((entry) => entry.phone !== phone);

    const { data, error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: profile?.email ?? user.email ?? null,
          phone: profile?.phone ?? user.email ?? `broker-${user.id}`,
          team_contacts: next,
        },
        { onConflict: 'id' }
      )
      .select('team_contacts')
      .single();

    if (error) {
      throw error;
    }

    return res.json({ success: true, team_contacts: normalizeTeamContacts(data.team_contacts) });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to remove team contact' });
  }
});

export default router;
