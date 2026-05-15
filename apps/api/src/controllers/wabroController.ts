import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';

function getTenant(req: Request): string {
  return req.user?.id || '';
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

export async function registerDevice(req: Request, res: Response) {
  try {
    const tenantId = getTenant(req);
    const { device_id, device_model, android_version, app_version } = req.body;
    if (!device_id) return res.status(400).json({ error: 'device_id required' });

    const { error } = await supabaseAdmin!.from('wabro_devices').upsert({
      device_id,
      tenant_id: tenantId,
      device_model: device_model || '',
      android_version: android_version || '',
      app_version: app_version || '',
      last_poll_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
    }, { onConflict: 'device_id' });
    if (error) throw error;
    res.json({ success: true });
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
      return { ...campaign, contacts: contacts || [] };
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

    const { error } = await supabaseAdmin!.from('wabro_send_logs').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
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
    const { device_id, device_model, android_version, app_version, stack_trace } = req.body;

    await supabaseAdmin!.from('wabro_devices').upsert({
      device_id: device_id || 'unknown',
      tenant_id: tenantId,
      device_model: device_model || '',
      android_version: android_version || '',
      app_version: app_version || '',
      last_sync_at: new Date().toISOString(),
    }, { onConflict: 'device_id' });

    res.json({ success: true });
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
      .select('device_id, device_model, last_poll_at')
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
    });
  } catch (error: unknown) {
    res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Operation failed') });
  }
}
