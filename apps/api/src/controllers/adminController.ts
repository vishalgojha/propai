import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { whatsappGroupService } from '../services/whatsappGroupService';
import { createImpersonationToken, resolveImpersonationToken, revokeImpersonationToken, listActiveImpersonations } from '../services/impersonationStore';
import { recordAuditEvent, getAuditLog } from '../services/auditLog';

const OWNER_SUPER_ADMIN_EMAILS = new Set([
    'vishal@chaoscraftlabs.com',
    'vishal@chaoscraftslabs.com',
]);

function isOwnerSuperAdminEmail(email?: string | null) {
    return OWNER_SUPER_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}

async function requireSuperAdmin(req: Request) {
    const user = (req as any).user;
    const email = String(user?.email || '').trim().toLowerCase();

    if (isOwnerSuperAdminEmail(email)) return;

    if (!supabaseAdmin) {
        const error = new Error('Supabase admin unavailable');
        (error as any).statusCode = 503;
        throw error;
    }

    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('app_role')
        .eq('id', user?.id)
        .maybeSingle();

    if (error) throw error;

    if (data?.app_role !== 'super_admin') {
        const forbidden = new Error('Super admin access required');
        (forbidden as any).statusCode = 403;
        throw forbidden;
    }
}

function getAdminInfo(req: Request) {
    const user = (req as any).user;
    return {
        adminId: String(user?.id || ''),
        adminEmail: String(user?.email || ''),
    };
}

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

        const [profilesResult, subscriptionsResult, healthResult] = await Promise.all([
            supabaseAdmin
                .from('profiles')
                .select('id, email, full_name, phone, app_role, created_at')
                .order('created_at', { ascending: false }),
            supabaseAdmin
                .from('subscriptions')
                .select('tenant_id, plan, status, created_at, renewal_date'),
            supabaseAdmin
                .from('whatsapp_ingestion_health')
                .select('tenant_id, connection_status, group_count, active_groups_24h, messages_received_24h, messages_parsed_24h, messages_failed_24h, parser_success_rate, updated_at'),
        ]);

        if (profilesResult.error) throw profilesResult.error;
        if (subscriptionsResult.error) throw subscriptionsResult.error;
        if (healthResult.error) throw healthResult.error;

        const subscriptionMap = new Map<string, any>(
            (subscriptionsResult.data || []).map((row: any) => [row.tenant_id, row]),
        );

        const healthMap = new Map<string, any>();
        for (const row of healthResult.data || []) {
            const current = healthMap.get(row.tenant_id) || {
                connectedSessions: 0, connectingSessions: 0, disconnectedSessions: 0,
                groupCount: 0, activeGroups24h: 0, messagesReceived24h: 0,
                messagesParsed24h: 0, messagesFailed24h: 0, parserSuccessRate: 100,
                lastUpdatedAt: null as string | null,
            };
            if (row.connection_status === 'connected') current.connectedSessions += 1;
            if (row.connection_status === 'connecting') current.connectingSessions += 1;
            if (row.connection_status === 'disconnected') current.disconnectedSessions += 1;
            current.groupCount += Number(row.group_count || 0);
            current.activeGroups24h += Number(row.active_groups_24h || 0);
            current.messagesReceived24h += Number(row.messages_received_24h || 0);
            current.messagesParsed24h += Number(row.messages_parsed_24h || 0);
            current.messagesFailed24h += Number(row.messages_failed_24h || 0);
            current.parserSuccessRate = Math.min(current.parserSuccessRate, Number(row.parser_success_rate || 100));
            if (!current.lastUpdatedAt || new Date(row.updated_at).getTime() > new Date(current.lastUpdatedAt).getTime()) {
                current.lastUpdatedAt = row.updated_at;
            }
            healthMap.set(row.tenant_id, current);
        }

        let workspaces = (profilesResult.data || []).map((profile: any) => {
            const subscription = subscriptionMap.get(profile.id) || null;
            const health = healthMap.get(profile.id) || {
                connectedSessions: 0, connectingSessions: 0, disconnectedSessions: 0,
                groupCount: 0, activeGroups24h: 0, messagesReceived24h: 0,
                messagesParsed24h: 0, messagesFailed24h: 0, parserSuccessRate: 100, lastUpdatedAt: null,
            };
            const role = isOwnerSuperAdminEmail(profile.email) ? 'super_admin' : (profile.app_role || 'partner');
            return {
                id: profile.id,
                email: profile.email,
                fullName: profile.full_name,
                phone: profile.phone,
                createdAt: profile.created_at || null,
                role,
                subscription: {
                    plan: isOwnerSuperAdminEmail(profile.email) ? 'Team' : subscription?.plan || 'Free',
                    status: isOwnerSuperAdminEmail(profile.email) ? 'active' : subscription?.status || 'trial',
                    createdAt: subscription?.created_at || profile.created_at || null,
                    renewalDate: isOwnerSuperAdminEmail(profile.email) ? null : subscription?.renewal_date || null,
                },
                whatsapp: {
                    connectedSessions: health.connectedSessions,
                    connectingSessions: health.connectingSessions,
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
                    w.email.toLowerCase().includes(search) ||
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
                if (w.subscription.status === 'trial' || w.subscription.plan === 'Free') acc.trialWorkspaces += 1;
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
    } catch (error: any) {
        res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to load admin workspaces' });
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
            plan: plan || existing?.plan || 'Free',
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
    } catch (error: any) {
        res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to update subscription' });
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
    } catch (error: any) {
        res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to create impersonation session' });
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
    } catch (error: any) {
        res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to revoke impersonation' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// GET /impersonations — list active sessions
// ────────────────────────────────────────────────────────────────────────────
export const listImpersonations = async (req: Request, res: Response) => {
    try {
        await requireSuperAdmin(req);
        res.json({ success: true, sessions: listActiveImpersonations() });
    } catch (error: any) {
        res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to list impersonations' });
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
    } catch (error: any) {
        res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to load audit log' });
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
    } catch (error: any) {
        res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to load workspace groups' });
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
    } catch (error: any) {
        res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to update workspace group' });
    }
};
