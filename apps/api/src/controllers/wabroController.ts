import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import { parseGroupsForContacts } from '../services/groupContactParser';
import { generateWabroDeviceToken, hashWabroDeviceToken, maskWabroDeviceToken } from '../services/wabroDeviceProvisioningService';

function getTenant(req: Request): string {
  return req.user?.id || (req as any).wabroDeviceContext?.tenantId || '';
}

function getAppOrigin(req: Request): string {
  const configured = String(process.env.APP_URL || process.env.APP_ORIGIN || '').trim().replace(/\/+$/, '');
  if (configured) {
    return configured;
  }

  const host = String(req.get('host') || '').trim();
  if (!host) {
    return 'https://app.propai.live';
  }

  if (host.startsWith('api.')) {
    return `${req.protocol}://${host.replace(/^api\./, 'app.')}`;
  }

  return `${req.protocol}://${host}`;
}

function getDeviceContext(req: Request): {
  registrationId?: string;
  tenantId?: string;
  deviceLabel?: string;
  platform?: string;
  claimedDeviceId?: string;
} {
  return (req as any).wabroDeviceContext || {};
}

// ── Campaigns ──────────────────────────────────────────

export async function createCampaign(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { name, message_template, media_url, skills_config, contacts, schedule_at } = req.body;
    if (!name || !message_template) {
      return res.status(400).json({ error: 'name and message_template required' });
    }

    const { data: campaign, error: ce } = await supabaseAdmin!
      .from('wabro_campaigns')
      .insert({ tenant_id: tenantId, name, message_template, media_url, skills_config: skills_config || {}, schedule_at, total_contacts: contacts?.length || 0 })
      .select()
      .single();
    if (ce) throw ce;

    if (contacts?.length) {
      const campaignContacts = contacts.map((c: { phone: string; name?: string }) => ({
        campaign_id: campaign.id,
        phone: c.phone,
        name: c.name || '',
      }));
      const { error: ccErr } = await supabaseAdmin!.from('wabro_campaign_contacts').insert(campaignContacts);
      if (ccErr) throw ccErr;
    }

    if (schedule_at) {
      await supabaseAdmin!
        .from('wabro_campaigns')
        .update({ status: 'pending' })
        .eq('id', campaign.id);
    }

    res.json({ success: true, campaign });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

export async function listCampaigns(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { data, error } = await supabaseAdmin!
      .from('wabro_campaigns')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ campaigns: data || [] });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

export async function getCampaign(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { id } = req.params;
    const { data, error } = await supabaseAdmin!
      .from('wabro_campaigns')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();
    if (error) return res.status(404).json({ error: 'Campaign not found' });

    const { data: contacts } = await supabaseAdmin!
      .from('wabro_campaign_contacts')
      .select('*')
      .eq('campaign_id', id)
      .order('status');

    res.json({ campaign: data, contacts: contacts || [] });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

export async function updateCampaignStatus(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { id } = req.params;
    const { status } = req.body;
    const valid = ['draft', 'pending', 'running', 'paused', 'completed', 'cancelled'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${valid.join(', ')}` });
    }

    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'running') updates.started_at = new Date().toISOString();
    if (status === 'completed') updates.completed_at = new Date().toISOString();

    const { error } = await supabaseAdmin!
      .from('wabro_campaigns')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

export async function deleteCampaign(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { id } = req.params;
    const { error } = await supabaseAdmin!
      .from('wabro_campaigns')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

export async function scheduleCampaign(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { id } = req.params;
    const { schedule_at } = req.body;
    if (!schedule_at) return res.status(400).json({ error: 'schedule_at required' });

    const { error } = await supabaseAdmin!
      .from('wabro_campaigns')
      .update({ schedule_at, status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

// ── Contacts (Broadcast Lists) ─────────────────────────

export async function listContactLists(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { data, error } = await supabaseAdmin!
      .from('wabro_contacts')
      .select('list_name')
      .eq('tenant_id', tenantId)
      .order('list_name');
    if (error) throw error;

    const listMap = new Map<string, number>();
    for (const row of data || []) {
      listMap.set(row.list_name, (listMap.get(row.list_name) || 0) + 1);
    }
    const lists = Array.from(listMap.entries()).map(([name, count]) => ({ name, count }));
    res.json({ lists });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

export async function getContactsByList(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { listName } = req.params;
    const { data, error } = await supabaseAdmin!
      .from('wabro_contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('list_name', listName)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ contacts: data || [] });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

export async function addContacts(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { list_name, contacts } = req.body;
    if (!list_name || !contacts?.length) {
      return res.status(400).json({ error: 'list_name and contacts array required' });
    }

    const rows = contacts.map((c: { phone: string; name?: string; locality?: string; budget?: string; language?: string }) => ({
      tenant_id: tenantId,
      list_name,
      phone: c.phone,
      name: c.name || '',
      locality: c.locality || null,
      budget: c.budget || null,
      language: c.language || null,
    }));

    const { error } = await supabaseAdmin!.from('wabro_contacts').upsert(rows, {
      onConflict: 'tenant_id, list_name, phone',
      ignoreDuplicates: false,
    });
    if (error) throw error;
    res.json({ success: true, count: rows.length });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

export async function deleteContact(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { id } = req.params;
    const { error } = await supabaseAdmin!
      .from('wabro_contacts')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

// ── Device & Sync ──────────────────────────────────────

export async function listDevices(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const [{ data: devices, error: devicesError }, { data: registrations, error: registrationsError }] = await Promise.all([
      supabaseAdmin!
        .from('wabro_devices')
        .select('device_id, device_model, android_version, app_version, platform, last_poll_at, last_sync_at, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }),
      supabaseAdmin!
        .from('wabro_device_registrations')
        .select('id, device_label, platform, status, expires_at, claimed_at, claimed_device_id, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }),
    ]);

    if (devicesError) throw devicesError;
    if (registrationsError) throw registrationsError;

    const registrationByDeviceId = new Map<string, any>();
    for (const registration of registrations || []) {
      if (registration.claimed_device_id) {
        registrationByDeviceId.set(registration.claimed_device_id, registration);
      }
    }

    res.json({
      devices: (devices || []).map((device) => {
        const registration = registrationByDeviceId.get(device.device_id);
        return {
          device_id: device.device_id,
          display_name: registration?.device_label || device.device_model || device.device_id,
          device_model: device.device_model || null,
          android_version: device.android_version || null,
          app_version: device.app_version || null,
          platform: device.platform || registration?.platform || 'android',
          registration_status: registration?.status || 'claimed',
          last_poll_at: device.last_poll_at,
          last_sync_at: device.last_sync_at,
          claimed_at: registration?.claimed_at || null,
          created_at: device.created_at,
          updated_at: device.updated_at,
        };
      }),
      pending_registrations: (registrations || [])
        .filter((registration) => !registration.claimed_device_id)
        .map((registration) => ({
          id: registration.id,
          device_label: registration.device_label,
          platform: registration.platform,
          status: registration.status,
          expires_at: registration.expires_at,
          created_at: registration.created_at,
        })),
    });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to list WaBro devices') });
  }
}

export async function createDeviceProvision(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const actorId = req.user?.id || tenantId;
    const { device_label, platform = 'android', expires_in_days = 7 } = req.body;

    const token = generateWabroDeviceToken();
    const tokenHash = hashWabroDeviceToken(token);
    const expiresAt = new Date(Date.now() + expires_in_days * 86_400_000).toISOString();

    const { data, error } = await supabaseAdmin!
      .from('wabro_device_registrations')
      .insert({
        tenant_id: tenantId,
        created_by: actorId,
        device_label,
        platform,
        token_hash: tokenHash,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select('id, device_label, platform, status, expires_at, created_at')
      .single();

    if (error) throw error;

    res.json({
      registration: data,
      token,
      token_masked: maskWabroDeviceToken(token),
    });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to provision WaBro device') });
  }
}

export async function getAppVersion(req: Request, res: Response) {
  const apkUrl = `${getAppOrigin(req)}/wabro.apk`;
  res.json({
    versionCode: 1,
    versionName: '1.0.0',
    apkUrl,
    releaseNotes: 'Use the shared PropAI WaBro workspace and device provisioning flow. Do not run a second Baileys session from Android.',
    forceUpdate: false,
  });
}

export async function registerDevice(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { device_id, device_model, android_version, app_version, deviceName, appVersion, platform } = req.body;
    const deviceContext = getDeviceContext(req);
    const resolvedDeviceId = device_id || deviceName;
    const resolvedAppVersion = app_version || appVersion || '';
    const resolvedLabel = device_model || deviceName || deviceContext.deviceLabel || '';
    if (!resolvedDeviceId) return res.status(400).json({ error: 'device_id required' });

    const { error } = await supabaseAdmin!.from('wabro_devices').upsert({
      device_id: resolvedDeviceId,
      tenant_id: tenantId,
      device_model: resolvedLabel,
      android_version: android_version || '',
      app_version: resolvedAppVersion,
      platform: platform || deviceContext.platform || 'android',
      last_poll_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
    }, { onConflict: 'device_id' });
    if (error) throw error;

    if (deviceContext.registrationId) {
      await supabaseAdmin!
        .from('wabro_device_registrations')
        .update({
          status: 'claimed',
          claimed_device_id: resolvedDeviceId,
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', deviceContext.registrationId)
        .eq('tenant_id', tenantId);
    }

    res.json({
      success: true,
      deviceId: resolvedDeviceId,
      displayName: resolvedLabel || resolvedDeviceId,
    });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

export async function deviceHeartbeat(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { deviceId } = req.params;
    const { error } = await supabaseAdmin!
      .from('wabro_devices')
      .update({ last_poll_at: new Date().toISOString() })
      .eq('device_id', deviceId)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

// ── App Polling ────────────────────────────────────────

export async function getPendingCampaigns(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { deviceId } = req.params;

    await supabaseAdmin!
      .from('wabro_devices')
      .update({ last_poll_at: new Date().toISOString() })
      .eq('device_id', deviceId)
      .eq('tenant_id', tenantId);

    const { data, error } = await supabaseAdmin!
      .from('wabro_campaigns')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'running', 'paused'])
      .order('created_at', { ascending: true });
    if (error) throw error;

    const campaignsWithContacts = await Promise.all((data || []).map(async (campaign) => {
      const { data: contacts } = await supabaseAdmin!
        .from('wabro_campaign_contacts')
        .select('phone, name, status')
        .eq('campaign_id', campaign.id);
      return {
        id: String(campaign.id),
        name: campaign.name,
        messageTemplate: campaign.message_template,
        mediaUrl: campaign.media_url,
        skillsConfigJson: JSON.stringify(campaign.skills_config || {}),
        contacts: contacts || [],
        status: campaign.status,
        totalContacts: Number(campaign.total_contacts || 0),
        sentCount: Number(campaign.sent_count || 0),
        failedCount: Number(campaign.failed_count || 0),
        skippedCount: Number(campaign.skipped_count || 0),
        scheduleAt: campaign.schedule_at,
        startedAt: campaign.started_at,
        completedAt: campaign.completed_at,
        createdAt: campaign.created_at,
        updatedAt: campaign.updated_at,
      };
    }));

    res.json({ campaigns: campaignsWithContacts });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

// ── Sync (App → Server) ───────────────────────────────

export async function syncSendLogs(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { campaign_id, logs } = req.body;
    if (!campaign_id || !logs?.length) {
      return res.status(400).json({ error: 'campaign_id and logs array required' });
    }

    const rows = logs.map((log: { phone: string; name?: string; status: string; error?: string }) => ({
      campaign_id,
      tenant_id: tenantId,
      contact_phone: log.phone,
      contact_name: log.name || '',
      status: log.status,
      error: log.error || null,
    }));

    const { error } = await supabaseAdmin!.from('wabro_send_logs').insert(rows);
    if (error) throw error;

    // Update campaign counters
    const { data: counts } = await supabaseAdmin!
      .from('wabro_send_logs')
      .select('status')
      .eq('campaign_id', campaign_id);

    let sent = 0, failed = 0, skipped = 0;
    for (const row of counts || []) {
      if (row.status === 'sent') sent++;
      else if (row.status === 'failed') failed++;
      else if (row.status === 'skipped') skipped++;
    }

    const done = sent + failed + skipped;
    const { data: totalRow } = await supabaseAdmin!
      .from('wabro_campaigns')
      .select('total_contacts')
      .eq('id', campaign_id)
      .single();
    const total = totalRow?.total_contacts || 0;

    const updates: Record<string, unknown> = { sent_count: sent, failed_count: failed, skipped_count: skipped };
    if (done >= total) {
      updates.status = 'completed';
      updates.completed_at = new Date().toISOString();
    }

    await supabaseAdmin!.from('wabro_campaigns').update(updates).eq('id', campaign_id);

    res.json({ success: true, sent, failed, skipped, total });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

export async function syncCampaignProgress(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { campaignId } = req.params;
    const { sent_count, failed_count, skipped_count, status } = req.body;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (sent_count !== undefined) updates.sent_count = sent_count;
    if (failed_count !== undefined) updates.failed_count = failed_count;
    if (skipped_count !== undefined) updates.skipped_count = skipped_count;
    if (status) {
      updates.status = status;
      if (status === 'completed') updates.completed_at = new Date().toISOString();
      if (status === 'running') updates.started_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin!
      .from('wabro_campaigns')
      .update(updates)
      .eq('id', campaignId)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

// ── Crash Reporting ────────────────────────────────────

export async function reportCrash(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const deviceContext = getDeviceContext(req);
    const { device_id, device_model, android_version, app_version, stack_trace } = req.body;

    await supabaseAdmin!.from('wabro_devices').upsert({
      device_id: device_id || 'unknown',
      tenant_id: tenantId,
      device_model: device_model || deviceContext.deviceLabel || '',
      android_version: android_version || '',
      app_version: app_version || '',
      platform: deviceContext.platform || 'android',
      last_sync_at: new Date().toISOString(),
    }, { onConflict: 'device_id' });

    res.json({ success: true });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

// ── Broker Contacts (Group Parsed) ─────────────────────

export async function syncBrokerContacts(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const result = await parseGroupsForContacts(tenantId);
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

export async function listBrokerContacts(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const page = Math.max(1, parseInt(String(req.query.page || '1')));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'))));
    const area = String(req.query.area || '').trim();
    const search = String(req.query.search || '').trim();
    const offset = (page - 1) * limit;

    let query = supabaseAdmin!
      .from('broker_contacts')
      .select('id, display_name, phone, inferred_areas, source_groups, group_count, last_seen_at, created_at', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (area) {
      query = query.contains('inferred_areas', [area]);
    }

    if (search) {
      query = query.or(`display_name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order('group_count', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const contacts = (data || []).map(c => ({
      id: c.id,
      display_name: c.display_name,
      phone_masked: c.phone ? c.phone.slice(0, 5) + ' •••••' : null,
      inferred_areas: c.inferred_areas,
      group_count: c.group_count,
      last_seen_at: c.last_seen_at,
    }));

    res.json({
      contacts,
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

// ── Broadcast Lists ────────────────────────────────────

export async function listBroadcastLists(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { data, error } = await supabaseAdmin!
      .from('broadcast_lists')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('contact_count', { ascending: false });

    if (error) throw error;
    res.json({ lists: data || [] });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

export async function sendToBroadcastList(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { id } = req.params;
    const { message_template, media_url, schedule_at } = req.body;

    if (!message_template) {
      return res.status(400).json({ error: 'message_template required' });
    }

    const { data: list, error: listError } = await supabaseAdmin!
      .from('broadcast_lists')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (listError || !list) {
      return res.status(404).json({ error: 'Broadcast list not found' });
    }

    // Get contact phones for this list
    const { data: listContacts, error: lcError } = await supabaseAdmin!
      .from('broadcast_list_contacts')
      .select('contact_id')
      .eq('list_id', id);

    if (lcError) throw lcError;

    const contactIds = (listContacts || []).map(lc => lc.contact_id);

    if (!contactIds.length) {
      return res.status(400).json({ error: 'Broadcast list has no contacts' });
    }

    const { data: contacts } = await supabaseAdmin!
      .from('broker_contacts')
      .select('phone, display_name')
      .in('id', contactIds)
      .eq('tenant_id', tenantId);

    // Create a campaign from this broadcast list
    const campaignContacts = (contacts || []).map(c => ({
      phone: c.phone,
      name: c.display_name || '',
    }));

    const { data: campaign, error: ce } = await supabaseAdmin!
      .from('wabro_campaigns')
      .insert({
        tenant_id: tenantId,
        name: `Broadcast: ${list.name}`,
        message_template,
        media_url: media_url || null,
        schedule_at: schedule_at || null,
        total_contacts: campaignContacts.length,
      })
      .select()
      .single();

    if (ce) throw ce;

    if (campaignContacts.length) {
      const { error: ccErr } = await supabaseAdmin!
        .from('wabro_campaign_contacts')
        .insert(
          campaignContacts.map(c => ({
            campaign_id: campaign.id,
            phone: c.phone,
            name: c.name,
          }))
        );

      if (ccErr) throw ccErr;
    }

    res.json({ success: true, campaign });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

// ── Areas (unique inferred areas across contacts) ──────

export async function listAreas(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { data, error } = await supabaseAdmin!
      .from('broker_contacts')
      .select('inferred_areas')
      .eq('tenant_id', tenantId);

    if (error) throw error;

    const areaSet = new Set<string>();
    for (const row of data || []) {
      for (const area of row.inferred_areas || []) {
        areaSet.add(area);
      }
    }

    res.json({ areas: Array.from(areaSet).sort() });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}

// ── Dashboard Stats ────────────────────────────────────

export async function dashboardStats(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);

    const { data: campaigns } = await supabaseAdmin!
      .from('wabro_campaigns')
      .select('id, name, status, total_contacts, sent_count, failed_count, skipped_count, created_at, completed_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: logs } = await supabaseAdmin!
      .from('wabro_send_logs')
      .select('status')
      .eq('tenant_id', tenantId);

    const { data: devices } = await supabaseAdmin!
      .from('wabro_devices')
      .select('device_id, device_model, platform, app_version, last_poll_at')
      .eq('tenant_id', tenantId);

    let totalSent = 0, totalFailed = 0, totalSkipped = 0;
    for (const log of logs || []) {
      if (log.status === 'sent') totalSent++;
      else if (log.status === 'failed') totalFailed++;
      else if (log.status === 'skipped') totalSkipped++;
    }

    res.json({
      stats: {
        total_campaigns: (campaigns || []).length,
        total_sent: totalSent,
        total_failed: totalFailed,
        total_skipped: totalSkipped,
        active_devices: (devices || []).filter(d => {
          const diff = Date.now() - new Date(d.last_poll_at || 0).getTime();
          return diff < 300000; // active in last 5 min
        }).length,
        total_devices: (devices || []).length,
      },
      campaigns: campaigns || [],
      devices: devices || [],
    });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}
