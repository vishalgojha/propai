import { Request, Response } from 'express';
import { sessionManager } from '../whatsapp/SessionManager';
import { supabase, supabaseAdmin } from '../config/supabase';
import { subscriptionService } from '../services/subscriptionService';
import { whatsappHealthService } from '../services/whatsappHealthService';
import { whatsappGroupService } from '../services/whatsappGroupService';
import { workspaceMonitorService } from '../services/workspaceMonitorService';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { workspaceActivityService } from '../services/workspaceActivityService';
import { sendWhatsAppLifecycleEmail } from '../whatsapp/propaiRuntimeHooks';

function getTenantId(req: Request) {
    const user = (req as any).user;
    return user?.id || 'system';
}
const OWNER_SUPER_ADMIN_EMAILS = new Set([
    'vishal@chaoscraftlabs.com',
    'vishal@chaoscraftslabs.com',
]);

function isOwnerSuperAdminEmail(email?: string | null) {
    return OWNER_SUPER_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}

function buildSessionLabel(ownerName?: string, phoneNumber?: string) {
    const raw = `${ownerName || 'Owner'}-${phoneNumber || 'device'}`;
    const lower = raw.toLowerCase();
    let result = '';
    for (const c of lower) {
        if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
            result += c;
        } else {
            if (result.length > 0 && !result.endsWith('-')) {
                result += '-';
            }
        }
    }
    // Trim leading '-'
    while (result.startsWith('-')) result = result.slice(1);
    // Trim trailing '-'
    while (result.endsWith('-')) result = result.slice(0, -1);
    return result.slice(0, 60) || 'owner-device';
}

function getDbClient() {
    return supabaseAdmin || supabase;
}

function normalizeRecipientPhone(value?: string | null) {
    return String(value || '').split('').filter(c => c >= '0' && c <= '9').join('');
}

function toWhatsAppJid(phoneOrJid?: string | null) {
    const value = String(phoneOrJid || '').trim();
    if (!value) return null;
    if (value.includes('@')) return value;

    const phone = normalizeRecipientPhone(value);
    return phone ? `${phone}@s.whatsapp.net` : null;
}

const profileSelectColumns = 'id, full_name, phone, email, phone_verified';

type ConnectionArtifactMode = 'qr' | 'pairing';
type ConnectionArtifact = {
    mode: ConnectionArtifactMode;
    format: 'text';
    value: string;
} | null;

function buildConnectionArtifact(mode: ConnectionArtifactMode, value?: string | null): ConnectionArtifact {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        return null;
    }

    return {
        mode,
        format: 'text',
        value: normalized,
    };
}

function formatProfileResponse(profile: any, fallback?: { id: string; fullName: string; phone: string; email?: string | null }) {
    if (profile) {
        return {
            id: profile.id,
            fullName: profile.full_name,
            phone: profile.phone,
            email: profile.email,
            phoneVerified: profile.phone_verified,
            appRole: profile.app_role || (isOwnerSuperAdminEmail(profile.email || fallback?.email) ? 'super_admin' : 'broker'),
        };
    }

    return {
        id: fallback?.id || '',
        fullName: fallback?.fullName || '',
        phone: fallback?.phone || '',
        email: fallback?.email || null,
        phoneVerified: false,
        appRole: (isOwnerSuperAdminEmail(fallback?.email) ? 'super_admin' : 'broker'),
    };
}

export const connectWhatsApp = async (req: Request, res: Response) => {
    const { phoneNumber, label, ownerName } = req.body;
    const connectMethod = req.body?.connectMethod === 'pairing' ? 'pairing' : 'qr';
    const tenantId = getTenantId(req);
    const sessionLabel = buildSessionLabel(ownerName || label, phoneNumber);

    try {
        if (connectMethod === 'pairing' && !phoneNumber) {
            return res.status(400).json({ error: 'Enter the WhatsApp number to request a pairing code.' });
        }

        const existingSession = await sessionManager.getSession(tenantId, sessionLabel);
        const dbClient = getDbClient();
        const { data: existingRow } = await dbClient
            .from('whatsapp_sessions')
            .select('status, session_data')
            .eq('tenant_id', tenantId)
            .eq('label', sessionLabel)
            .maybeSingle();

        if (existingSession && existingRow?.status === 'connected') {
            return res.json({
                message: 'WhatsApp already connected',
                label: sessionLabel,
                artifact: null,
                qr: null,
                pairingCode: null,
                connected: true,
                mode: 'connected',
            });
        }

        if (connectMethod === 'qr' && existingRow?.status !== 'connected') {
            if (existingSession) {
                await sessionManager.removeSession(tenantId, sessionLabel);
            } else {
                await dbClient
                    .from('whatsapp_sessions')
                    .update({
                        status: 'disconnected',
                        creds: null,
                        keys: null,
                        updated_at: new Date().toISOString(),
                        last_sync: new Date().toISOString(),
                    })
                    .eq('tenant_id', tenantId)
                    .eq('label', sessionLabel);
            }
        }

        await sessionManager.createSession(
            tenantId, 
            () => {}, 
            () => {},
            { 
                phoneNumber,
                label: sessionLabel, 
                ownerName,
                usePairingCode: connectMethod === 'pairing' ? phoneNumber : undefined,
            }
        );

        // QR generation can be async (Baileys emits it after socket init). Poll briefly so the UI
        // usually gets a QR immediately, especially for the 2nd+ device flow.
        const waitForArtifact = async () => {
            const deadline = Date.now() + 7000;
            while (Date.now() < deadline) {
                const current = sessionManager.getQR(tenantId, sessionLabel);
                if (current) return current;
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
            return null;
        };
        const artifactAfterCreate = await waitForArtifact();

        await dbClient
            .from('whatsapp_sessions')
            .upsert({
                tenant_id: tenantId,
                label: sessionLabel,
                owner_name: ownerName || null,
                session_data: {
                    phoneNumber: phoneNumber || null,
                    ownerName: ownerName || null,
                    label: sessionLabel,
                },
                status: 'connecting',
                last_sync: new Date().toISOString(),
            }, { onConflict: 'tenant_id,label' });

        const artifact = sessionManager.getQR(tenantId, sessionLabel) || artifactAfterCreate;
        const connectionArtifact = connectMethod === 'qr'
            ? buildConnectionArtifact('qr', artifact)
            : buildConnectionArtifact('pairing', artifact);
        res.json({
            message: 'Connection initiated',
            label: sessionLabel,
            artifact: connectionArtifact,
            qr: connectMethod === 'qr' ? artifact || null : null,
            pairingCode: connectMethod === 'pairing' ? artifact || null : null,
            mode: connectMethod,
        });

        void workspaceActivityService.track({
            actor: (req as any).user,
            workspaceOwnerId: tenantId,
            eventType: 'whatsapp.session.connecting',
            entityType: 'whatsapp_session',
            entityId: sessionLabel,
            summary: `Started a WhatsApp connection for ${ownerName || phoneNumber || sessionLabel}.`,
            metadata: {
                label: sessionLabel,
                phoneNumber: phoneNumber || null,
                ownerName: ownerName || null,
            },
        });
    } catch (error: any) {
        console.error('Connect Error:', error);
        await getDbClient()
            .from('whatsapp_sessions')
            .update({
                status: 'disconnected',
                last_sync: new Date().toISOString(),
            })
            .eq('tenant_id', tenantId)
            .eq('label', sessionLabel);
        res.status(500).json({ error: error.message || 'Could not start connection. Please try again.' });
    }
};


export const forceRefreshQR = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const { label } = req.body || {};
    const sessionKey = label || undefined;

    try {
        const result = await sessionManager.forceReconnect(tenantId, sessionKey);
        
        // Wait a moment for QR to generate
        setTimeout(() => {
            const qr = sessionManager.getQR(tenantId as string, result.label);
            if (qr) {
                // QR is ready, but we already sent response
            }
        }, 2000);

        res.json({
            success: true,
            message: 'QR regeneration initiated',
            label: result.label,
            status: 'connecting',
        });

        void workspaceActivityService.track({
            actor: (req as any).user,
            workspaceOwnerId: tenantId,
            eventType: 'whatsapp.qr.force_refresh',
            entityType: 'whatsapp_session',
            entityId: result.label,
            summary: `Force refreshed QR code for session ${result.label}.`,
            metadata: { label: result.label },
        });
    } catch (error: any) {
        console.error('Force Refresh QR Error:', error);
        res.status(500).json({ 
            error: error.message || 'Could not refresh QR code. Please try disconnecting and reconnecting.' 
        });
    }
};

export const getQR = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const label = typeof req.query.label === 'string' ? req.query.label : undefined;

    const qr = sessionManager.getQR(tenantId as string, label);
    
    if (qr) {
        return res.json({
            qr,
            artifact: buildConnectionArtifact('qr', qr),
            label,
            ready: true,
        });
    }

    // Check if session exists but QR not ready
    const sessions = sessionManager.getLiveSessionSnapshots(tenantId);
    const targetSession = label 
        ? sessions.find(s => s.label === label)
        : sessions[0];

    if (targetSession?.status === 'connected') {
        return res.json({ 
            ready: true, 
            artifact: null,
            qr: null, 
            label: targetSession.label,
            message: 'WhatsApp already connected' 
        });
    }

    // Check if session is initializing
    const dbClient = getDbClient();
    const { data: sessionRow } = await dbClient
        .from('whatsapp_sessions')
        .select('status, last_sync')
        .eq('tenant_id', tenantId)
        .eq('label', label || targetSession?.label || 'Owner')
        .maybeSingle();

    const waitTime = sessionRow?.last_sync 
        ? Math.round((Date.now() - new Date(sessionRow.last_sync).getTime()) / 1000)
        : 0;

    return res.status(202).json({
        ready: false,
        label: label || targetSession?.label,
        message: waitTime < 10 
            ? 'QR code is being generated...' 
            : 'QR generation is taking longer than expected. Try once more in a few seconds.',
        status: sessionRow?.status || 'initializing',
        waitSeconds: waitTime,
    });
};

export const getStatus = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const user = (req as any).user;

    if (tenantId === 'system') {
        const status = await sessionManager.getSystemStatus();
        return res.json(status);
    }

    const { data, error } = await getDbClient()
        .from('whatsapp_sessions')
        .select('label, owner_name, status, session_data, last_sync')
        .eq('tenant_id', tenantId)
        .in('status', ['connecting', 'connected'])
        .order('last_sync', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const dbSessions = (data || []).map((row: any) => ({
        label: row.label,
        ownerName: row.owner_name,
        status: row.status,
        phoneNumber: row.session_data?.phoneNumber || null,
        sessionData: row.session_data || null,
        lastSync: row.last_sync,
    }));
    const liveSessions = sessionManager.getLiveSessionSnapshots(tenantId);
    const sessionMap = new Map<string, any>();

    for (const session of dbSessions) {
        sessionMap.set(session.label, session);
    }

    for (const liveSession of liveSessions) {
        const existing = sessionMap.get(liveSession.label);
        sessionMap.set(liveSession.label, {
            ...existing,
            ...liveSession,
            lastSync: existing?.lastSync || new Date().toISOString(),
        });
    }

        const sessions = Array.from(sessionMap.values()).sort((a, b) => {
            return new Date(b.lastSync || 0).getTime() - new Date(a.lastSync || 0).getTime();
        });
        const connectedSessions = sessions.filter((session) => session.status === 'connected');
        const connectingSessions = sessions.filter((session) => session.status === 'connecting');
        const plan = await subscriptionService.getSubscription(tenantId, user?.email).catch(() => ({ plan: 'Trial' as const, status: 'active', renewal_date: null }));
        const limit = subscriptionService.getLimit(plan.plan, 'sessions');
        const primaryConnectedSession = connectedSessions[0] || null;

        res.json({
            status: primaryConnectedSession ? 'connected' : connectingSessions.length > 0 ? 'connecting' : 'disconnected',
            activeCount: connectedSessions.length,
            limit,
            plan: plan.plan,
            connectedPhoneNumber: primaryConnectedSession?.phoneNumber || null,
            connectedOwnerName: primaryConnectedSession?.ownerName || null,
            sessions: sessions.map(s => ({
                ...s,
                reconnectAttempts: s.reconnectAttempts || 0,
                isReconnecting: s.isReconnecting || false,
            })),
        });
};

export const getMonitor = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext((req as any).user);
        const sessionLabel = typeof req.query.sessionLabel === 'string' ? req.query.sessionLabel : null;
        const data = await workspaceMonitorService.getMonitorData(context.workspaceOwnerId, false, sessionLabel);

        res.json({
            success: true,
            workspace: {
                ownerId: context.workspaceOwnerId,
                memberRole: context.memberRole,
                canManageTeam: context.canManageTeam,
                canSendOutbound: context.canSendOutbound,
            },
            ...data,
        });
    } catch (error: any) {
        res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to load WhatsApp monitor' });
    }
};

export const getInbox = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext((req as any).user);
        const sessionLabel = typeof req.query.sessionLabel === 'string' ? req.query.sessionLabel : null;
        const data = await workspaceMonitorService.getMonitorData(context.workspaceOwnerId, true, sessionLabel);

        res.json({
            success: true,
            workspace: {
                ownerId: context.workspaceOwnerId,
                memberRole: context.memberRole,
                canManageTeam: context.canManageTeam,
                canSendOutbound: context.canSendOutbound,
            },
            ...data,
        });
    } catch (error: any) {
        res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to load realtor inbox' });
    }
};

export const disconnectWhatsApp = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const { label, sessionKey, phoneNumber } = req.body || {};
    const targetSessionKey = sessionKey || label || phoneNumber;
    const user = (req as any).user;
    const fallbackEmail = String(user?.email || '').trim().toLowerCase() || null;
    const fallbackFullName = String(user?.full_name || user?.name || '').trim() || null;

    try {
        const dbClient = getDbClient();
        const { data: sessionRow } = await dbClient
            .from('whatsapp_sessions')
            .select('label, session_data, owner_name')
            .eq('tenant_id', tenantId)
            .eq('label', String(targetSessionKey || ''))
            .maybeSingle();

        await sessionManager.removeSession(tenantId, targetSessionKey);

        await sendWhatsAppLifecycleEmail({
            tenantId,
            label: String(sessionRow?.label || targetSessionKey || ''),
            status: 'disconnected',
            phoneNumber: sessionRow?.session_data?.phoneNumber || phoneNumber || null,
            fallbackEmail,
            fallbackFullName: sessionRow?.owner_name || fallbackFullName,
        });

        void workspaceActivityService.track({
            actor: (req as any).user,
            workspaceOwnerId: tenantId,
            eventType: 'whatsapp.session.disconnected',
            entityType: 'whatsapp_session',
            entityId: String(targetSessionKey || ''),
            summary: `Disconnected WhatsApp session ${targetSessionKey || 'default'}.`,
            metadata: {
                targetSessionKey: targetSessionKey || null,
            },
        });
        res.json({ message: 'Disconnected successfully' });
    } catch (error: any) {
        console.error('Disconnect Error:', error);
        res.status(500).json({ error: 'Could not disconnect. Please try again.' });
    }
};

export const getIngestionHealth = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);

    try {
        const health = await whatsappHealthService.getHealth(tenantId);
        res.json(health);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to load WhatsApp health' });
    }
};

export const getDetailedHealth = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const user = (req as any).user;

    try {
        const [health, sessionsResult, eventsResult] = await Promise.all([
            whatsappHealthService.getHealth(tenantId),
            getDbClient()
                .from('whatsapp_sessions')
                .select('label, owner_name, status, session_data, last_sync')
                .eq('tenant_id', tenantId)
                .order('last_sync', { ascending: false }),
            whatsappHealthService.getEvents(tenantId, 50),
        ]);

        const sessions = (sessionsResult.data || []).map((row: any) => ({
            label: row.label,
            ownerName: row.owner_name,
            status: row.status,
            phoneNumber: row.session_data?.phoneNumber || null,
            lastSync: row.last_sync,
        }));

        const liveSessions = sessionManager.getLiveSessionSnapshots(tenantId);
        const sessionMap = new Map<string, any>();
        
        for (const session of sessions) {
            sessionMap.set(session.label, { ...session, liveData: null });
        }

        for (const liveSession of liveSessions) {
            const existing = sessionMap.get(liveSession.label) || {};
            sessionMap.set(liveSession.label, {
                ...existing,
                ...liveSession,
                liveData: {
                    reconnectAttempts: (liveSession as any).reconnectAttempts || 0,
                    isReconnecting: (liveSession as any).isReconnecting || false,
                }
            });
        }

        const enrichedSessions = Array.from(sessionMap.values());

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            health,
            sessions: enrichedSessions,
            events: eventsResult || [],
            ops: {
                totalSessions: enrichedSessions.length,
                connectedSessions: enrichedSessions.filter(s => s.status === 'connected').length,
                reconnectingSessions: enrichedSessions.filter(s => s.liveData?.isReconnecting).length,
                totalReconnectAttempts: enrichedSessions.reduce((sum, s) => sum + (s.liveData?.reconnectAttempts || 0), 0),
                healthState: health.summary?.healthState || 'unknown',
            },
        });
    } catch (error: any) {
        res.status(500).json({ 
            error: error.message || 'Failed to load detailed WhatsApp health',
            timestamp: new Date().toISOString(),
        });
    }
};

export const getGroupHealth = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);

    try {
        const groups = await whatsappHealthService.getGroupHealth(tenantId);
        res.json(groups);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to load WhatsApp group health' });
    }
};

export const getEvents = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);

    try {
        const events = await whatsappHealthService.getEvents(tenantId);
        res.json(events);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to load WhatsApp events' });
    }
};

export const getProfile = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);

    const { data, error } = await getDbClient()
        .from('profiles')
        .select(profileSelectColumns)
        .eq('id', tenantId)
        .maybeSingle();

    if (error) {
        return res.status(500).json({ error: error.message || 'Failed to load profile' });
    }

    if (!data) {
        return res.json({ profile: null });
    }

    res.json({
        profile: formatProfileResponse(data),
    });
};

export const saveProfile = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const { fullName, phone } = req.body || {};
    const user = (req as any).user;
    const normalizedFullName = String(fullName || '').trim();

    if (!normalizedFullName || !phone) {
        return res.status(400).json({ error: 'Full name and phone are required' });
    }

    const normalizedPhone = String(phone).split('').filter(c => c >= '0' && c <= '9').join('');
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
        return res.status(400).json({ error: 'Enter the WhatsApp number with country code only, digits only, no spaces or + sign.' });
    }

    const payload: Record<string, unknown> = {
        id: tenantId,
        full_name: normalizedFullName,
        phone: normalizedPhone,
    };

    if (user?.email) {
        payload.email = user.email;
    }

    const dbClient = getDbClient();
    const { error: upsertError } = await dbClient
        .from('profiles')
        .upsert(payload, { onConflict: 'id' });

    if (upsertError) {
        return res.status(500).json({ error: upsertError.message || 'Failed to save profile' });
    }

    const { data, error } = await dbClient
        .from('profiles')
        .select(profileSelectColumns)
        .eq('id', tenantId)
        .maybeSingle();

    if (error) {
        return res.status(500).json({ error: error.message || 'Failed to load saved profile' });
    }

    res.json({
        profile: formatProfileResponse(data, {
            id: tenantId,
            fullName: normalizedFullName,
            phone: normalizedPhone,
            email: user?.email || null,
        }),
    });
};

export const getMessages = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.resolveContext((req as any).user);
    const tenantId = context.workspaceOwnerId;

    const { data, error } = await getDbClient()
        .from('messages')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('timestamp', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    res.json(data);
};

export const getGroups = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const requestedSessionLabel = typeof req.query.sessionLabel === 'string' ? req.query.sessionLabel.trim() : null;

    try {
        const liveClients = requestedSessionLabel
            ? [await sessionManager.getSession(tenantId as string, requestedSessionLabel)].filter(Boolean)
            : await sessionManager.getAllSessionsForTenant(tenantId as string);

        for (const client of liveClients) {
            const groups = await (client as any).getGroups();
            const normalizedGroups = Array.isArray(groups)
                ? groups.map((group: any, index: number) => ({
                    id: String(group.id || group.remoteJid || `group-${index}`),
                    name: String(group.subject || group.name || group.title || group.id || `Group ${index + 1}`),
                    participantsCount: Number(group.participantsCount || group.size || group.participants?.length || 0),
                }))
                : [];

            const sessionSnapshot =
                typeof (client as any).getStatusSnapshot === 'function'
                    ? (client as any).getStatusSnapshot()
                    : null;
            const sessionLabel = String(sessionSnapshot?.label || requestedSessionLabel || 'default');
            await whatsappGroupService.syncGroups(tenantId as string, sessionLabel, normalizedGroups);
        }

        const directoryGroups = await whatsappGroupService.listGroups(tenantId as string);
        const filteredGroups = requestedSessionLabel
            ? directoryGroups.filter((group: any) => String(group.sessionLabel || '') === requestedSessionLabel)
            : directoryGroups;

        const groupIds = filteredGroups.map((group: any) => String(group.id || group.groupJid || '')).filter(Boolean);
        const behaviorMap = new Map<string, string>();

        if (groupIds.length > 0) {
            const dbClient = getDbClient();
            const chunkSize = 200;
            for (let i = 0; i < groupIds.length; i += chunkSize) {
                const chunk = groupIds.slice(i, i + chunkSize);
                const { data: configs, error } = await dbClient
                    .from('group_configs')
                    .select('group_id,behavior')
                    .eq('tenant_id', tenantId)
                    .in('group_id', chunk);

                if (error) {
                    throw error;
                }

                for (const row of configs || []) {
                    if (row?.group_id) {
                        behaviorMap.set(String(row.group_id), String(row.behavior || ''));
                    }
                }
            }
        }

        res.json(filteredGroups.map((group: any) => ({
            ...group,
            behavior: behaviorMap.get(String(group.id)) || 'Listen',
        })));
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to load WhatsApp groups' });
    }
};

export const getOutboundRecipients = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const dbClient = getDbClient();

    try {
        const [{ data: leadsData, error: leadsError }, { data: callbacksData, error: callbacksError }] = await Promise.all([
            dbClient
                .from('lead_records')
                .select('lead_id,name,phone,record_type,locality_canonical,location_hint,source,created_at')
                .eq('tenant_id', tenantId)
                .not('phone', 'is', null)
                .neq('phone', 'unknown')
                .order('created_at', { ascending: false })
                .limit(300),
            dbClient
                .from('follow_up_tasks')
                .select('id,lead_name,lead_phone,priority_bucket,due_at,status,created_at')
                .eq('tenant_id', tenantId)
                .eq('status', 'pending')
                .not('lead_phone', 'is', null)
                .order('due_at', { ascending: true })
                .limit(150),
        ]);

        if (leadsError) return res.status(500).json({ error: leadsError.message });
        if (callbacksError) return res.status(500).json({ error: callbacksError.message });

        const brokerMap = new Map<string, any>();
        const leadMap = new Map<string, any>();

        for (const row of leadsData || []) {
            const normalizedPhone = normalizeRecipientPhone(row.phone);
            if (!normalizedPhone) continue;

            if (row.record_type === 'inventory_listing') {
                if (!brokerMap.has(normalizedPhone)) {
                    brokerMap.set(normalizedPhone, {
                        id: normalizedPhone,
                        name: row.name || 'Broker contact',
                        phone: normalizedPhone,
                        remoteJid: `${normalizedPhone}@s.whatsapp.net`,
                        locality: row.locality_canonical || row.location_hint || null,
                        source: row.source || 'Lead records',
                        latestAt: row.created_at || null,
                    });
                }
            } else {
                if (!leadMap.has(normalizedPhone)) {
                    leadMap.set(normalizedPhone, {
                        id: normalizedPhone,
                        name: row.name || 'Lead contact',
                        phone: normalizedPhone,
                        remoteJid: `${normalizedPhone}@s.whatsapp.net`,
                        locality: row.locality_canonical || row.location_hint || null,
                        source: row.source || 'Lead records',
                        priorityBucket: null,
                        dueAt: null,
                        latestAt: row.created_at || null,
                    });
                }
            }
        }

        for (const row of callbacksData || []) {
            const normalizedPhone = normalizeRecipientPhone(row.lead_phone);
            if (!normalizedPhone) continue;

            const existing = leadMap.get(normalizedPhone);
            leadMap.set(normalizedPhone, {
                id: normalizedPhone,
                name: row.lead_name || existing?.name || 'Lead contact',
                phone: normalizedPhone,
                remoteJid: `${normalizedPhone}@s.whatsapp.net`,
                locality: existing?.locality || null,
                source: existing?.source || 'Follow-up queue',
                priorityBucket: row.priority_bucket || existing?.priorityBucket || null,
                dueAt: row.due_at || existing?.dueAt || null,
                latestAt: existing?.latestAt || row.created_at || null,
            });
        }

        res.json({
            brokers: Array.from(brokerMap.values()),
            leads: Array.from(leadMap.values()),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to load outbound recipients' });
    }
};

export const sendMessage = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.requireOutboundAccess((req as any).user);
    const tenantId = context.workspaceOwnerId;
    const { remoteJid, text } = req.body;
    const user = (req as any).user;
    if (!tenantId || !remoteJid || !text) {
        return res.status(400).json({ error: 'remoteJid and text are required' });
    }

    try {
        const client = await sessionManager.getSession(tenantId);
        if (!client) {
            return res.status(404).json({ error: 'No active WhatsApp session found' });
        }

        await (client as any).sendText(remoteJid, text);
        await getDbClient().from('messages').insert({
            tenant_id: tenantId,
            remote_jid: remoteJid,
            text: String(text).trim(),
            sender: 'Broker',
            timestamp: new Date().toISOString(),
        });
        void workspaceActivityService.track({
            actor: user,
            workspaceOwnerId: tenantId,
            eventType: 'whatsapp.direct.sent',
            entityType: 'conversation',
            entityId: remoteJid,
            summary: `Sent a direct WhatsApp message to ${remoteJid}.`,
            metadata: { remoteJid },
        });
        
        res.json({ message: 'Message sent successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const sendBulkDirectMessages = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.requireOutboundAccess((req as any).user);
    const tenantId = context.workspaceOwnerId;
    const { recipients, text, sessionKey } = req.body || {};
    const user = (req as any).user;

    if (!tenantId || !Array.isArray(recipients) || recipients.length === 0 || !String(text || '').trim()) {
        return res.status(400).json({ error: 'recipients and text are required' });
    }

    try {
        const client = await sessionManager.getSession(tenantId, sessionKey);
        if (!client) {
            return res.status(404).json({ error: 'No active WhatsApp session found' });
        }

        const sent: Array<{ remoteJid: string; label?: string | null }> = [];
        const failed: Array<{ remoteJid: string; label?: string | null; error: string }> = [];

        for (const recipient of recipients) {
            const remoteJid = toWhatsAppJid(recipient?.remoteJid || recipient?.phone);
            const label = recipient?.label || recipient?.name || recipient?.phone || null;

            if (!remoteJid) {
                failed.push({ remoteJid: String(recipient?.remoteJid || recipient?.phone || ''), label, error: 'Invalid recipient' });
                continue;
            }

            try {
                await (client as any).sendText(remoteJid, String(text).trim());
                await getDbClient().from('messages').insert({
                    tenant_id: tenantId,
                    remote_jid: remoteJid,
                    text: String(text).trim(),
                    sender: 'Broker',
                    timestamp: new Date().toISOString(),
                });
                sent.push({ remoteJid, label });
            } catch (error: any) {
                failed.push({ remoteJid, label, error: error?.message || 'Failed to send message' });
            }
        }

        void workspaceActivityService.track({
            actor: user,
            workspaceOwnerId: tenantId,
            eventType: 'whatsapp.direct.bulk_sent',
            entityType: 'conversation_batch',
            entityId: sessionKey || null,
            summary: `Sent ${sent.length} direct WhatsApp messages${failed.length ? ` with ${failed.length} failures` : ''}.`,
            metadata: {
                sessionKey: sessionKey || null,
                sentCount: sent.length,
                failedCount: failed.length,
            },
        });

        res.json({
            success: failed.length === 0,
            sent,
            failed,
            total: recipients.length,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to send direct messages' });
    }
};

export const broadcastToGroups = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.requireOutboundAccess((req as any).user);
    const tenantId = context.workspaceOwnerId;
    const { groupJids, text, batchSize, delayBetweenMessages, delayBetweenBatches, sessionKey } = req.body || {};
    const user = (req as any).user;

    if (!tenantId || !Array.isArray(groupJids) || groupJids.length === 0 || !text) {
        return res.status(400).json({ error: 'groupJids and text are required' });
    }

    try {
        const client = await sessionManager.getSession(tenantId, sessionKey);
        if (!client) {
            return res.status(404).json({ error: 'No active WhatsApp session found' });
        }

        const result = await (client as any).broadcastToGroups(groupJids, text, {
            batchSize: Number(batchSize) || undefined,
            delayBetweenMessages: Number(delayBetweenMessages) || undefined,
            delayBetweenBatches: Number(delayBetweenBatches) || undefined,
        });

        if (Array.isArray(result.sent) && result.sent.length > 0) {
            const timestamp = new Date().toISOString();
            const rows = result.sent.map((groupJid: string) => ({
                tenant_id: tenantId,
                remote_jid: groupJid,
                text: String(text).trim(),
                sender: 'Broker',
                timestamp,
            }));

            await getDbClient().from('messages').insert(rows);
        }

        void workspaceActivityService.track({
            actor: user,
            workspaceOwnerId: tenantId,
            eventType: 'whatsapp.group.broadcast',
            entityType: 'group_batch',
            entityId: sessionKey || null,
            summary: `Broadcasted to ${Array.isArray(result.sent) ? result.sent.length : 0} WhatsApp groups${Array.isArray(result.failed) && result.failed.length ? ` with ${result.failed.length} failures` : ''}.`,
            metadata: {
                sessionKey: sessionKey || null,
                sentCount: Array.isArray(result.sent) ? result.sent.length : 0,
                failedCount: Array.isArray(result.failed) ? result.failed.length : 0,
            },
        });

        res.json({
            success: true,
            sent: result.sent,
            failed: result.failed,
            total: groupJids.length,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to broadcast message' });
    }
};
