import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { whatsappGroupService } from '../services/whatsappGroupService';
import { createImpersonationToken, resolveImpersonationToken, revokeImpersonationToken, listActiveImpersonations } from '../services/impersonationStore';
import { recordAuditEvent, getAuditLog } from '../services/auditLog';
import { normalizePlanName } from '../services/subscriptionService';
import { requireSuperAdmin, getAdminInfo, HttpError, isOwnerSuperAdminEmail } from '../utils/controllerHelpers';
import { pushRecentAction } from '../services/identityService';
import '../types/express';

type SessionCounts = { connected: number; connecting: number; disconnected: number };

type WorkspaceHealth = {
  connectedSessions: number;
  connectingSessions: number;
  disconnectedSessions: number;
  groupCount: number;
  activeGroups24h: number;
  messagesReceived24h: number;
  messagesParsed24h: number;
  messagesFailed24h: number;
  parserSuccessRate: number;
  lastUpdatedAt: string | null;
};

function getWorkspaceHealthStatus(row: Record<string, unknown>) {
  return String(row?.connection_status || row?.status || row?.connectionStatus || 'disconnected');
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const emptyHealth: WorkspaceHealth = {
  connectedSessions: 0, connectingSessions: 0, disconnectedSessions: 0,
  groupCount: 0, activeGroups24h: 0, messagesReceived24h: 0,
  messagesParsed24h: 0, messagesFailed24h: 0, parserSuccessRate: 100, lastUpdatedAt: null,
};

// ────────────────────────────────────────────────────────────────────────────
// GET /workspaces — searchable, filterable, paginated
// ────────────────────────────────────────────────────────────────────────────
export const listAdminWorkspaces = async (req: Request, res: Response) => {
  try {
    await requireSuperAdmin(req);

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase admin unavailable' });
    }

    const search = String(req.query.search || '').trim().toLowerCase();
    const filterPlan = String(req.query.plan || '').trim();
    const filterStatus = String(req.query.status || '').trim();
    const filterConnected = req.query.connected === 'true';
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;

    const [profilesResult, subscriptionsResult, healthResult, sessionsResult] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('id, email, full_name, phone, app_role, created_at')
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('subscriptions')
        .select('tenant_id, plan, status, created_at, renewal_date'),
      supabaseAdmin
        .from('whatsapp_ingestion_health')
        .select('*'),
      supabaseAdmin
        .from('whatsapp_sessions')
        .select('tenant_id, status'),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (subscriptionsResult.error) throw subscriptionsResult.error;
    if (healthResult.error) throw healthResult.error;

    const sessionStatusMap = new Map<string, SessionCounts>();
    for (const row of sessionsResult.data || []) {
      const current = sessionStatusMap.get(row.tenant_id) || { connected: 0, connecting: 0, disconnected: 0 };
      const status = String(row.status || 'disconnected');
      if (status === 'connected') current.connected += 1;
      else if (status === 'connecting') current.connecting += 1;
      else current.disconnected += 1;
      sessionStatusMap.set(row.tenant_id, current);
    }

    const subscriptionMap = new Map<string, Record<string, unknown>>(
      (subscriptionsResult.data || []).map((row) => [row.tenant_id, row]),
    );

    const healthMap = new Map<string, WorkspaceHealth>();
    for (const row of healthResult.data || []) {
      const current = healthMap.get(row.tenant_id) || { ...emptyHealth };
      const connectionStatus = getWorkspaceHealthStatus(row);
      if (connectionStatus === 'connected') current.connectedSessions += 1;
      if (connectionStatus === 'connecting') current.connectingSessions += 1;
      if (connectionStatus === 'disconnected') current.disconnectedSessions += 1;
      current.groupCount += toNumber(row.group_count ?? 0);
      current.activeGroups24h += toNumber(row.active_groups_24h ?? 0);
      current.messagesReceived24h += toNumber(row.messages_received_24h ?? row.processed_count ?? 0);
      current.messagesParsed24h += toNumber(row.messages_parsed_24h ?? row.processed_count ?? 0);
      current.messagesFailed24h += toNumber(row.messages_failed_24h ?? row.failed_count ?? 0);
      current.parserSuccessRate = Math.min(current.parserSuccessRate, Number(row.parser_success_rate ?? 100));
      const updatedAt = row.updated_at || row.last_event_at || null;
      if (!current.lastUpdatedAt || (updatedAt && new Date(updatedAt).getTime() > new Date(current.lastUpdatedAt).getTime())) {
        current.lastUpdatedAt = updatedAt;
      }
      healthMap.set(row.tenant_id, current);
    }

    type WorkspaceRow = {
      id: string;
      email?: string;
      full_name?: string;
      phone?: string;
      app_role?: string;
      created_at?: string;
    };

    let workspaces = (profilesResult.data || []).map((profile: WorkspaceRow) => {
      const subscription = subscriptionMap.get(profile.id) || null;
      const health = healthMap.get(profile.id) || {
        ...emptyHealth,
        connectedSessions: sessionStatusMap.get(profile.id)?.connected || 0,
        connectingSessions: sessionStatusMap.get(profile.id)?.connecting || 0,
        disconnectedSessions: sessionStatusMap.get(profile.id)?.disconnected || 0,
      };
      const sessionCounts = sessionStatusMap.get(profile.id) || { connected: 0, connecting: 0, disconnected: 0 };
      const role = isOwnerSuperAdminEmail(profile.email) ? 'super_admin' : (profile.app_role || 'partner');
      return {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        phone: profile.phone,
        createdAt: profile.created_at || null,
        role,
        subscription: {
          plan: isOwnerSuperAdminEmail(profile.email) ? 'Team' : normalizePlanName(String((subscription as Record<string, unknown>)?.plan || 'Trial')),
          status: isOwnerSuperAdminEmail(profile.email) ? 'active' : String((subscription as Record<string, unknown>)?.status || 'trial'),
          createdAt: (subscription as Record<string, unknown>)?.created_at || profile.created_at || null,
          renewalDate: isOwnerSuperAdminEmail(profile.email) ? null : (subscription as Record<string, unknown>)?.renewal_date || null,
        },
        whatsapp: {
          connectedSessions: health.connectedSessions || sessionCounts.connected,
          connectingSessions: health.connectingSessions || sessionCounts.connecting,
          groupCount: health.groupCount,
          activeGroups24h: health.activeGroups24h,
          messagesReceived24h: health.messagesReceived24h,
          messagesParsed24h: health.messagesParsed24h,
          messagesFailed24h: health.messagesFailed24h,
          parserSuccessRate: health.parserSuccessRate,
          lastUpdatedAt: health.lastUpdatedAt,
        },
      };
    });

    // Apply filters
    if (search) {
      workspaces = workspaces.filter(
        (w) =>
          (w.email || '').toLowerCase().includes(search) ||
          (w.fullName || '').toLowerCase().includes(search) ||
          (w.phone || '').includes(search),
      );
    }
    if (filterPlan) workspaces = workspaces.filter((w) => w.subscription.plan.toLowerCase() === filterPlan.toLowerCase());
    if (filterStatus) workspaces = workspaces.filter((w) => w.subscription.status.toLowerCase() === filterStatus.toLowerCase());
    if (filterConnected) workspaces = workspaces.filter((w) => w.whatsapp.connectedSessions > 0);

    const total = workspaces.length;

    const summary = workspaces.reduce(
      (acc, w) => {
        acc.totalWorkspaces += 1;
        if (w.subscription.status === 'trial' || w.subscription.plan === 'Trial') acc.trialWorkspaces += 1;
        if (w.whatsapp.connectedSessions > 0) acc.connectedWorkspaces += 1;
        acc.messagesParsed24h += w.whatsapp.messagesParsed24h;
        return acc;
      },
      { totalWorkspaces: 0, trialWorkspaces: 0, connectedWorkspaces: 0, messagesParsed24h: 0 },
    );

    res.json({
      success: true,
      summary,
      workspaces: workspaces.slice(offset, offset + limit),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    res.status(statusCode).json({ error: error instanceof Error ? error.message : 'Failed to load admin workspaces' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// POST /workspaces/:tenantId/subscription
// ────────────────────────────────────────────────────────────────────────────
export const updateWorkspaceSubscription = async (req: Request, res: Response) => {
  try {
    await requireSuperAdmin(req);

    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase admin unavailable' });

    const tenantId = String(req.params.tenantId || '').trim();
    const plan = String(req.body?.plan || '').trim();
    const status = String(req.body?.status || '').trim();
    const extendTrialDays = Number(req.body?.extendTrialDays || 0);
    const { adminId, adminEmail } = getAdminInfo(req);

    const { data: existing } = await supabaseAdmin
      .from('subscriptions')
      .select('tenant_id, plan, status, created_at, renewal_date')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', tenantId)
      .maybeSingle();

    const createdAt = existing?.created_at || new Date().toISOString();
    const existingRenewal = existing?.renewal_date ? new Date(existing.renewal_date) : new Date();
    const nextRenewal = extendTrialDays > 0
      ? new Date(existingRenewal.getTime() + extendTrialDays * 86_400_000).toISOString()
      : existing?.renewal_date || null;

    const payload = {
      tenant_id: tenantId,
      plan: normalizePlanName(plan || existing?.plan || 'Trial'),
      status: status || existing?.status || 'trial',
      created_at: createdAt,
      renewal_date: nextRenewal,
    };

    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .upsert(payload, { onConflict: 'tenant_id' })
      .select('tenant_id, plan, status, created_at, renewal_date')
      .single();

    if (error || !data) throw error || new Error('Failed to update subscription');

    const action = status === 'cancelled' ? 'subscription_cancel' : extendTrialDays > 0 ? 'trial_extended' : 'subscription_update';
    recordAuditEvent({
      action,
      adminId, adminEmail,
      targetId: tenantId,
      targetEmail: profile?.email,
      payload: { plan, status, extendTrialDays, result: { plan: data.plan, status: data.status } },
    });

    void pushRecentAction(tenantId, `Subscription updated to ${data.plan} (${data.status})`);

    res.json({
      success: true,
      subscription: {
        tenantId: data.tenant_id,
        plan: data.plan,
        status: data.status,
        createdAt: data.created_at,
        renewalDate: data.renewal_date,
      },
    });
  } catch (error: unknown) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    res.status(statusCode).json({ error: error instanceof Error ? error.message : 'Failed to update subscription' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// POST /workspaces/:tenantId/impersonate — generate access link
// ────────────────────────────────────────────────────────────────────────────
export const impersonateWorkspace = async (req: Request, res: Response) => {
  try {
    await requireSuperAdmin(req);

    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase admin unavailable' });

    const tenantId = String(req.params.tenantId || '').trim();
    const { adminId, adminEmail } = getAdminInfo(req);

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, app_role')
      .eq('id', tenantId)
      .maybeSingle();

    if (error || !profile) {
      return res.status(404).json({ error: 'Partner workspace not found' });
    }

    if (isOwnerSuperAdminEmail(profile.email)) {
      return res.status(400).json({ error: 'Cannot impersonate another super admin account' });
    }

    const token = createImpersonationToken({
      partnerId: profile.id,
      partnerEmail: profile.email,
      partnerFullName: profile.full_name || null,
      partnerRole: profile.app_role || 'partner',
      tenantId,
      adminId,
      adminEmail,
    });

    recordAuditEvent({
      action: 'impersonation_created',
      adminId, adminEmail,
      targetId: tenantId,
      targetEmail: profile.email,
      payload: { partnerEmail: profile.email },
    });

    const appOrigin = process.env.APP_ORIGIN || 'https://app.propai.live';

    res.json({
      success: true,
      token,
      partnerEmail: profile.email,
      partnerName: profile.full_name,
      expiresIn: '1 hour',
      accessUrl: `${appOrigin}/impersonate?token=${token}`,
    });
  } catch (error: unknown) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    res.status(statusCode).json({ error: error instanceof Error ? error.message : 'Failed to create impersonation session' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GET /impersonation/resolve?token=imp_xxx — used by frontend to resolve token
// ────────────────────────────────────────────────────────────────────────────
export const resolveImpersonation = async (req: Request, res: Response) => {
  const token = String(req.query.token || '').trim();
  if (!token.startsWith('imp_')) {
    return res.status(400).json({ error: 'Invalid impersonation token format' });
  }

  const session = resolveImpersonationToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Impersonation token expired or invalid' });
  }

  res.json({
    success: true,
    token,
    partnerId: session.partnerId,
    partnerEmail: session.partnerEmail,
    partnerFullName: session.partnerFullName,
    partnerRole: session.partnerRole,
    tenantId: session.tenantId,
    adminEmail: session.adminEmail,
    expiresAt: session.expiresAt,
  });
};

// ────────────────────────────────────────────────────────────────────────────
// DELETE /impersonation/:token — revoke active session
// ────────────────────────────────────────────────────────────────────────────
export const revokeImpersonation = async (req: Request, res: Response) => {
  try {
    await requireSuperAdmin(req);
    const token = String(req.params.token || '').trim();
    const { adminId, adminEmail } = getAdminInfo(req);
    const session = resolveImpersonationToken(token);
    revokeImpersonationToken(token);
    if (session) {
      recordAuditEvent({
        action: 'impersonation_revoked',
        adminId, adminEmail,
        targetId: session.partnerId,
        targetEmail: session.partnerEmail,
        payload: { token },
      });
    }
    res.json({ success: true });
  } catch (error: unknown) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    res.status(statusCode).json({ error: error instanceof Error ? error.message : 'Failed to revoke impersonation' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GET /impersonations — list active sessions
// ────────────────────────────────────────────────────────────────────────────
export const listImpersonations = async (req: Request, res: Response) => {
  try {
    await requireSuperAdmin(req);
    res.json({ success: true, sessions: listActiveImpersonations() });
  } catch (error: unknown) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    res.status(statusCode).json({ error: error instanceof Error ? error.message : 'Failed to list impersonations' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GET /audit
// ────────────────────────────────────────────────────────────────────────────
export const getAdminAuditLog = async (req: Request, res: Response) => {
  try {
    await requireSuperAdmin(req);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    res.json({ success: true, events: getAuditLog(limit) });
  } catch (error: unknown) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    res.status(statusCode).json({ error: error instanceof Error ? error.message : 'Failed to load audit log' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Groups (existing, now with audit logging)
// ────────────────────────────────────────────────────────────────────────────
export const listWorkspaceGroups = async (req: Request, res: Response) => {
  try {
    await requireSuperAdmin(req);
    const tenantId = String(req.params.tenantId || '').trim();
    if (!tenantId) return res.status(400).json({ error: 'Workspace tenant ID is required' });
    const groups = await whatsappGroupService.listGroups(tenantId, { includeArchived: true });
    res.json({ success: true, groups });
  } catch (error: unknown) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    res.status(statusCode).json({ error: error instanceof Error ? error.message : 'Failed to load workspace groups' });
  }
};

export const updateWorkspaceGroup = async (req: Request, res: Response) => {
  try {
    await requireSuperAdmin(req);
    const tenantId = String(req.params.tenantId || '').trim();
    const groupJid = decodeURIComponent(String(req.params.groupJid || '').trim());
    if (!tenantId || !groupJid) return res.status(400).json({ error: 'Workspace tenant ID and group JID are required' });

    const { adminId, adminEmail } = getAdminInfo(req);
    const group = await whatsappGroupService.updateGroup(tenantId, groupJid, {
      groupName: req.body?.groupName ?? undefined,
      locality: req.body?.locality ?? undefined,
      city: req.body?.city ?? undefined,
      category: req.body?.category ?? undefined,
      tags: Array.isArray(req.body?.tags) ? req.body.tags : undefined,
      broadcastEnabled: typeof req.body?.broadcastEnabled === 'boolean' ? req.body.broadcastEnabled : undefined,
      isArchived: typeof req.body?.isArchived === 'boolean' ? req.body.isArchived : undefined,
    });

    recordAuditEvent({
      action: 'group_updated',
      adminId, adminEmail,
      targetId: tenantId,
      payload: { groupJid, changes: req.body },
    });

    res.json({ success: true, group });
  } catch (error: unknown) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    res.status(statusCode).json({ error: error instanceof Error ? error.message : 'Failed to update workspace group' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /backfill/listings — backfill listings table from stream_items
// ─────────────────────────────────────────────────────────────────────────────
export const backfillListings = async (req: Request, res: Response) => {
  try {
    await requireSuperAdmin(req);

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase admin unavailable' });
    }

    const { data: existing } = await supabaseAdmin
      .from('listings')
      .select('id, raw_text');
    const existingRawTexts = new Set((existing || []).map((r: any) => (r.raw_text || '').trim()));

    const { data: items, error } = await supabaseAdmin
      .from('stream_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!items || !items.length) {
      return res.json({ inserted: 0, message: 'No stream_items found.' });
    }

    const toInsert = (items as any[]).filter((item) => {
      const raw = (item.raw_text || '').trim();
      return raw && !existingRawTexts.has(raw);
    });

    if (!toInsert.length) {
      return res.json({ inserted: 0, message: 'Nothing to backfill.' });
    }

    const rows = toInsert.map((item: any) => ({
      tenant_id: item.tenant_id,
      source_group_id: item.source_group_id || null,
      structured_data: {
        bhk: item.bhk || null,
        locality: item.locality || null,
        city: item.city || null,
        type: (item.type || '').toLowerCase() || null,
        deal_type: item.deal_type || null,
        price_numeric: item.price_numeric || null,
        price: item.price_label || null,
        area_sqft: item.area_sqft || null,
        furnishing: item.furnishing || null,
        floor_number: item.floor_number || null,
        total_floors: item.total_floors || null,
        asset_class: item.asset_class || null,
        property_use: item.property_use || null,
        property_category: item.property_category || null,
        confidence: item.confidence_score || null,
        title: [item.bhk, item.locality, item.type === 'Rent' ? 'for Rent' : item.type === 'Sale' ? 'for Sale' : ''].filter(Boolean).join(' ') || 'Property Listing',
        building: null,
        micro_location: null,
      },
      raw_text: item.raw_text || '',
      status: 'Active',
      created_at: item.created_at,
    }));

    const BATCH = 100;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error: insertError } = await supabaseAdmin.from('listings').insert(batch);
      if (insertError) {
        console.error(`Backfill batch ${i / BATCH} failed:`, insertError.message);
      } else {
        inserted += batch.length;
      }
    }

    recordAuditEvent({
      action: 'backfill_listings',
      adminId: (req as any).adminInfo?.userId || 'unknown',
      adminEmail: (req as any).adminInfo?.email || 'unknown',
      payload: { inserted, total: rows.length },
    });

    res.json({ inserted, total: rows.length });
  } catch (error: unknown) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    res.status(statusCode).json({ error: error instanceof Error ? error.message : 'Backfill failed' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /backfill/public-listings — backfill public_listings from stream_items
// ─────────────────────────────────────────────────────────────────────────────
export const backfillPublicListings = async (req: Request, res: Response) => {
  try {
    await requireSuperAdmin(req);

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase admin unavailable' });
    }

    const { data: existing } = await supabaseAdmin
      .from('public_listings')
      .select('source_message_id');
    const existingIds = new Set((existing || []).map((r: any) => r.source_message_id));

    const { data: items, error } = await supabaseAdmin
      .from('stream_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!items || !items.length) {
      return res.json({ inserted: 0, message: 'No stream_items found.' });
    }

    const toInsert = (items as any[]).filter((item) => {
      const mid = item.source_message_id || item.message_id;
      return !existingIds.has(mid);
    });

    if (!toInsert.length) {
      return res.json({ inserted: 0, message: 'Nothing to backfill.' });
    }

    function parseBhk(bhk: string | null | undefined): number | null {
      if (!bhk) return null;
      const m = String(bhk).match(/(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    }

    function extractPhone(text: string): string | null {
      const m = text.match(/(?:\+?91)?[6-9]\d{9}/);
      return m ? m[0] : null;
    }

    const rows = toInsert.map((item: any) => {
      const mid = item.source_message_id || item.message_id;
      const phone = item.source_phone || extractPhone(item.raw_text || '');
      const listingType = (() => {
        const t = (item.type || '').toLowerCase();
        if (t === 'rent') return 'listing_rent';
        if (t === 'sale') return 'listing_sale';
        if (t === 'pre-leased') return 'listing_rent';
        return 'requirement';
      })();
      const title = [item.bhk, item.locality, item.type === 'Rent' ? 'for Rent' : item.type === 'Sale' ? 'for Sale' : ''].filter(Boolean).join(' ') || 'Property Listing';
      return {
        source_message_id: mid,
        source_group_id: item.source_group_id || null,
        source_group_name: item.source_group_name || null,
        listing_type: listingType,
        area: item.locality || null,
        sub_area: null,
        location: item.locality || 'Unknown',
        price: item.price_numeric || null,
        price_type: item.type === 'Rent' ? 'monthly' : item.type === 'Sale' ? 'total' : null,
        size_sqft: item.area_sqft || null,
        furnishing: item.furnishing || null,
        bhk: parseBhk(item.bhk),
        property_type: null,
        title,
        description: item.raw_text || '',
        raw_message: item.raw_text || null,
        cleaned_message: null,
        sender_number: phone,
        primary_contact_name: item.source_label || item.source_group_name || null,
        primary_contact_number: phone,
        primary_contact_wa: phone ? `91${phone.replace(/^\+?91/, '')}` : null,
        contacts: [],
        confidence: item.confidence_score ?? 0.8,
        message_timestamp: item.created_at || new Date().toISOString(),
        search_text: [item.raw_text, item.locality, item.bhk, item.type].filter(Boolean).join(' '),
      };
    });

    const { error: insertError } = await supabaseAdmin.from('public_listings').upsert(rows, {
      onConflict: 'source_message_id',
      ignoreDuplicates: true,
    });

    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    recordAuditEvent({
      action: 'backfill_public_listings',
      adminId: (req as any).adminInfo?.userId || 'unknown',
      adminEmail: (req as any).adminInfo?.email || 'unknown',
      payload: { inserted: rows.length },
    });

    res.json({ inserted: rows.length, total: rows.length });
  } catch (error: unknown) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    res.status(statusCode).json({ error: error instanceof Error ? error.message : 'Backfill failed' });
  }
};
