import { Request, Response } from 'express';
import { getWhatsAppGateway } from '../channel-gateways/whatsapp/whatsappGatewayRegistry';
import { supabase, supabaseAdmin } from '../config/supabase';
import { subscriptionService } from '../services/subscriptionService';
import { whatsappHealthService } from '../services/whatsappHealthService';
import { whatsappGroupService } from '../services/whatsappGroupService';
import { workspaceMonitorService } from '../services/workspaceMonitorService';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { workspaceActivityService } from '../services/workspaceActivityService';
import { sendWhatsAppLifecycleEmail } from '../whatsapp/propaiRuntimeHooks';
import { pushRecentAction } from '../services/identityService';
import { sessionEventService } from '../services/sessionEventService';
import { emailNotificationService } from '../services/emailNotificationService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import { whatsappPresenceService } from '../services/whatsappPresenceService';
import { groupAuditService } from '../services/groupAuditService';
import { whatsappThreadService } from '../services/whatsappThreadService';
import '../types/express';

type LiveSessionRecord = {
    label: string;
    status: string;
    phoneNumber?: string | null;
    ownerName?: string | null;
    reconnectAttempts?: number;
    isReconnecting?: boolean;
};

function getConnectedSessionLabels(sessions: LiveSessionRecord[]) {
    return sessions
        .filter((session) => session.status === 'connected')
        .map((session) => String(session.label || '').trim())
        .filter(Boolean);
}

function getTenantId(req: Request) {
    const user = req.user;
    return user?.id || 'system';
}
const OWNER_SUPER_ADMIN_EMAILS = new Set([
    'vishal@chaoscraftlabs.com',
    'hello@chaoscraftlabs.com',
    'ojha007@gmail.com',
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

function formatProfileResponse(profile: Record<string, unknown> | null, fallback?: { id: string; fullName: string; phone: string; email?: string | null }) {
    if (profile) {
        return {
            id: profile.id,
            fullName: String(profile?.full_name ?? ''),
            phone: profile.phone,
            email: String(profile?.email ?? ''),
            phoneVerified: Boolean(profile?.phone_verified),
            appRole: String(profile?.app_role || '') || (isOwnerSuperAdminEmail(String(profile?.email || '') || fallback?.email) ? 'super_admin' : 'broker'),
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
    const context = await workspaceAccessService.resolveContext(req.user ?? {});
    const tenantId = context.workspaceOwnerId;
    const sessionLabel = buildSessionLabel(ownerName || label, phoneNumber);
    const gateway = getWhatsAppGateway(tenantId);

    try {
        if (connectMethod === 'pairing' && !phoneNumber) {
            return res.status(400).json({ error: 'Enter the WhatsApp number to request a pairing code.' });
        }

        const existingSession = await gateway.getStatus({ workspaceOwnerId: tenantId, sessionLabel });
        const dbClient = getDbClient();
        const { data: existingRow } = await dbClient
            .from('whatsapp_sessions')
            .select('status, session_data, creds, keys')
            .eq('tenant_id', tenantId)
            .eq('label', sessionLabel)
            .maybeSingle();
        const hasStoredAuth = Boolean(existingRow?.creds && existingRow?.keys);

        if (existingSession?.status === 'connected' && existingRow?.status === 'connected') {
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

        if (connectMethod === 'qr' && existingRow?.status !== 'connected' && !hasStoredAuth) {
            if (existingSession) {
                await gateway.disconnect({ workspaceOwnerId: tenantId, sessionLabel });
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

        await gateway.connect({
            workspaceOwnerId: tenantId,
            sessionLabel,
            ownerName,
            phoneNumber,
            mode: connectMethod,
        });

        const waitForArtifact = async () => {
            const deadline = Date.now() + 7000;
            while (Date.now() < deadline) {
                const current = await gateway.getQRCode({ workspaceOwnerId: tenantId, sessionLabel });
                if (current) return current;
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
            return null;
        };
        const artifactAfterCreate = await waitForArtifact();

        const existingData = (existingRow?.session_data && typeof existingRow.session_data === 'object')
            ? existingRow.session_data as Record<string, unknown>
            : {};

        await dbClient
            .from('whatsapp_sessions')
            .upsert({
                tenant_id: tenantId,
                label: sessionLabel,
                owner_name: ownerName || null,
                session_data: {
                    ...existingData,
                    phoneNumber: phoneNumber || null,
                    ownerName: ownerName || null,
                    label: sessionLabel,
                    groupAuditPending: existingData.groupAuditCompletedAt ? Boolean(existingData.groupAuditPending) : true,
                    groupAuditCompletedAt: existingData.groupAuditCompletedAt || null,
                },
                status: 'connecting',
                last_sync: new Date().toISOString(),
            }, { onConflict: 'tenant_id,label' });

        const artifact = await gateway.getQRCode({ workspaceOwnerId: tenantId, sessionLabel }) || artifactAfterCreate;
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
            actor: req.user,
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

        void pushRecentAction(tenantId, `Started WhatsApp connection (${connectMethod})`);
    } catch (error: unknown) {
        console.error('Connect Error:', error);
        await getDbClient()
            .from('whatsapp_sessions')
            .update({
                status: 'disconnected',
                last_sync: new Date().toISOString(),
            })
            .eq('tenant_id', tenantId)
            .eq('label', sessionLabel);
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Could not start connection. Please try again.') });
    }
};


export const forceRefreshQR = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.resolveContext(req.user ?? {});
    const tenantId = context.workspaceOwnerId;
    const { label } = req.body || {};
    let sessionKey = label || undefined;
    const gateway = getWhatsAppGateway(tenantId);

    try {
        const dbClient = getDbClient();
        const { data: sessionRow } = sessionKey
            ? await dbClient
                .from('whatsapp_sessions')
                .select('label, owner_name, session_data')
                .eq('tenant_id', tenantId)
                .eq('label', sessionKey)
                .maybeSingle()
            : await dbClient
                .from('whatsapp_sessions')
                .select('label, owner_name, session_data')
                .eq('tenant_id', tenantId)
                .order('last_sync', { ascending: false })
                .limit(1)
                .maybeSingle();

        sessionKey = sessionKey || sessionRow?.label || undefined;

        let result: { label: string; message?: string };
        try {
            result = await gateway.forceReconnect({ workspaceOwnerId: tenantId, sessionLabel: sessionKey });
        } catch (error) {
            const message = error instanceof Error ? error.message : '';
            const canRevivePersistedSession =
                sessionRow?.label &&
                (message.includes('No active session') || message.includes('Session client not found'));

            if (!canRevivePersistedSession) {
                throw error;
            }

            const sessionData = sessionRow.session_data && typeof sessionRow.session_data === 'object'
                ? sessionRow.session_data as Record<string, unknown>
                : {};
            const phoneNumber = typeof sessionData.phoneNumber === 'string' ? sessionData.phoneNumber : undefined;

            await gateway.connect({
                workspaceOwnerId: tenantId,
                sessionLabel: sessionRow.label,
                ownerName: sessionRow.owner_name || undefined,
                phoneNumber,
                mode: 'qr',
            });
            result = {
                label: sessionRow.label,
                message: 'Persisted session revived, QR regenerating...',
            };
        }
        
        setTimeout(() => {
            void gateway.getQRCode({ workspaceOwnerId: tenantId as string, sessionLabel: result.label });
        }, 2000);

        res.json({
            success: true,
            message: 'QR regeneration initiated',
            label: result.label,
            status: 'connecting',
        });

        void workspaceActivityService.track({
            actor: req.user,
            workspaceOwnerId: tenantId,
            eventType: 'whatsapp.qr.force_refresh',
            entityType: 'whatsapp_session',
            entityId: result.label,
            summary: `Force refreshed QR code for session ${result.label}.`,
            metadata: { label: result.label },
        });
    } catch (error: unknown) {
        console.error('Force Refresh QR Error:', error);
        res.status(getErrorStatus(error)).json({ 
            error: getErrorMessage(error, 'Could not refresh QR code. Please try disconnecting and reconnecting.') 
        });
    }
};

export const getQR = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.resolveContext(req.user ?? {});
    const tenantId = context.workspaceOwnerId;
    const label = typeof req.query.label === 'string' ? req.query.label : undefined;
    const gateway = getWhatsAppGateway(tenantId);

    const qr = await gateway.getQRCode({ workspaceOwnerId: tenantId as string, sessionLabel: label });
    
    if (qr) {
        return res.json({
            qr,
            artifact: buildConnectionArtifact('qr', qr),
            label,
            ready: true,
        });
    }

    // Check if session exists but QR not ready
    const sessions = await gateway.getSessions(tenantId);
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
    const user = req.user;
    const gateway = getWhatsAppGateway(tenantId);

    if (tenantId === 'system') {
        const status = await gateway.getStatus({ workspaceOwnerId: tenantId });
        return res.json({
            status: status?.status || 'disconnected',
            connected: status?.status === 'connected',
        });
    }

    const context = await workspaceAccessService.resolveContext(req.user ?? {});
    const workspaceOwnerId = context.workspaceOwnerId;
    const workspaceGateway = getWhatsAppGateway(workspaceOwnerId);

    const { data, error } = await getDbClient()
        .from('whatsapp_sessions')
        .select('label, owner_name, status, session_data, last_sync')
        .eq('tenant_id', workspaceOwnerId)
        .order('last_sync', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const dbSessions = (data || []).map((row: { label: string; owner_name: string | null; status: string; session_data: { phoneNumber?: string } | null; last_sync: string }) => ({
        label: row.label,
        ownerName: row.owner_name,
        status: row.status,
        phoneNumber: row.session_data?.phoneNumber || null,
        sessionData: row.session_data || null,
        lastSync: row.last_sync,
    }));
        const liveSessions = await workspaceGateway.getSessions(workspaceOwnerId) as LiveSessionRecord[];
        const sessionMap = new Map<string, Record<string, unknown>>();

        for (const session of dbSessions) {
            sessionMap.set(session.label, session as unknown as Record<string, unknown>);
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
            return new Date(String((b as Record<string, string | undefined>).lastSync || 0)).getTime() - new Date(String((a as Record<string, string | undefined>).lastSync || 0)).getTime();
        });
        const connectedSessions = sessions.filter((session) => (session as Record<string, string>).status === 'connected');
        const reconnectingSessions = sessions.filter((session) => {
            const row = session as Record<string, unknown>;
            return row.status === 'reconnecting' || (row.status === 'connecting' && Boolean(row.isReconnecting));
        });
        const connectingSessions = sessions.filter((session) => {
            const row = session as Record<string, unknown>;
            return row.status === 'connecting' && !Boolean(row.isReconnecting);
        });
        const plan = await subscriptionService.getSubscription(workspaceOwnerId, user?.email).catch(() => ({ plan: 'Trial' as const, status: 'active', renewal_date: null }));
        const limit = await subscriptionService.getLimitForTenant(workspaceOwnerId, plan.plan, 'sessions', user?.email);
        const primaryConnectedSession = connectedSessions[0] || null;

        res.json({
            status: primaryConnectedSession
                ? 'connected'
                : reconnectingSessions.length > 0
                    ? 'reconnecting'
                    : connectingSessions.length > 0
                        ? 'connecting'
                        : 'disconnected',
            activeCount: connectedSessions.length,
            limit,
            plan: plan.plan,
            connectedPhoneNumber: primaryConnectedSession?.phoneNumber || null,
            connectedOwnerName: primaryConnectedSession?.ownerName || null,
            allowedOutboundSessionLabels: context.assignedSessionLabels,
            preferredOutboundSessionLabel: context.preferredSessionLabel,
            hasOutboundLaneRestriction: context.hasSessionRestriction,
            sessions: sessions.map((session) => {
                const row = session as Record<string, unknown>;
                const isReconnecting = Boolean(row.isReconnecting);
                const rawStatus = String(row.status || 'disconnected');
                return {
                    ...session,
                    status: isReconnecting && rawStatus === 'connecting' ? 'reconnecting' : rawStatus,
                    reconnectAttempts: Number(row.reconnectAttempts || 0),
                    isReconnecting,
                };
            }),
        });
};

export const getMonitor = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const sessionLabel = typeof req.query.sessionLabel === 'string' ? req.query.sessionLabel : null;
        const data = await workspaceMonitorService.getMonitorData(context.workspaceOwnerId, sessionLabel);

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
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load WhatsApp monitor') });
    }
};

export const getMonitorMessages = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const sessionLabel = typeof req.query.sessionLabel === 'string' ? req.query.sessionLabel : null;
        const chatId = typeof req.query.chatId === 'string' ? req.query.chatId.trim() : '';
        const before = typeof req.query.before === 'string' ? req.query.before : null;
        const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }

        const data = await workspaceMonitorService.getChatMessages(context.workspaceOwnerId, {
            sessionLabel,
            chatId,
            before,
            limit,
        });

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
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load WhatsApp monitor messages') });
    }
};

export const getPresenceStatus = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const sessionLabel = typeof req.query.sessionLabel === 'string' ? req.query.sessionLabel : null;
        const data = await whatsappPresenceService.getPresenceStatus(context.workspaceOwnerId, sessionLabel);

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
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load WhatsApp presence status') });
    }
};

export const postPresenceEvent = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const eventType = String(req.body?.eventType || '').trim();
        const status = String(req.body?.status || '').trim();

        if (!eventType || !status) {
            return res.status(400).json({ error: 'eventType and status are required' });
        }

        const event = await whatsappPresenceService.recordEvent({
            workspaceOwnerId: context.workspaceOwnerId,
            actorUserId: context.currentUserId,
            sessionLabel: typeof req.body?.sessionLabel === 'string' ? req.body.sessionLabel : null,
            source: typeof req.body?.source === 'string' ? req.body.source : 'extension',
            eventType,
            status,
            remoteJid: typeof req.body?.remoteJid === 'string' ? req.body.remoteJid : null,
            tabId: typeof req.body?.tabId === 'string' ? req.body.tabId : null,
            url: typeof req.body?.url === 'string' ? req.body.url : null,
            observedAt: typeof req.body?.observedAt === 'string' ? req.body.observedAt : null,
            metadata: req.body?.metadata && typeof req.body.metadata === 'object'
                ? req.body.metadata as Record<string, unknown>
                : {},
        });

        res.status(201).json({ success: true, event });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to record WhatsApp presence event') });
    }
};

export const disconnectWhatsApp = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.resolveContext(req.user ?? {});
    const tenantId = context.workspaceOwnerId;
    const { label, sessionKey, phoneNumber } = req.body || {};
    const targetSessionKey = sessionKey || label || phoneNumber;
    const user = req.user;
    const fallbackEmail = String(user?.email || '').trim().toLowerCase() || null;
    const fallbackFullName = String(user?.full_name || user?.name || '').trim() || null;
    const gateway = getWhatsAppGateway(tenantId);

    try {
        const dbClient = getDbClient();
        const { data: sessionRow } = await dbClient
            .from('whatsapp_sessions')
            .select('label, session_data, owner_name')
            .eq('tenant_id', tenantId)
            .eq('label', String(targetSessionKey || ''))
            .maybeSingle();

        await gateway.disconnect({ workspaceOwnerId: tenantId, sessionLabel: targetSessionKey });

        await sendWhatsAppLifecycleEmail({
            tenantId,
            label: String(sessionRow?.label || targetSessionKey || ''),
            status: 'disconnected',
            phoneNumber: sessionRow?.session_data?.phoneNumber || phoneNumber || null,
            fallbackEmail,
            fallbackFullName: sessionRow?.owner_name || fallbackFullName,
        });

        void workspaceActivityService.track({
            actor: req.user,
            workspaceOwnerId: tenantId,
            eventType: 'whatsapp.session.disconnected',
            entityType: 'whatsapp_session',
            entityId: String(targetSessionKey || ''),
            summary: `Disconnected WhatsApp session ${targetSessionKey || 'default'}.`,
            metadata: {
                targetSessionKey: targetSessionKey || null,
            },
        });

        void pushRecentAction(tenantId, `Disconnected WhatsApp session`);

        res.json({ message: 'Disconnected successfully' });
    } catch (error: unknown) {
        console.error('Disconnect Error:', error);
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Could not disconnect. Please try again.') });
    }
};

export const getIngestionHealth = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);

    try {
        const health = await whatsappHealthService.getHealth(tenantId);
        res.json(health);
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load WhatsApp health') });
    }
};

export const getDetailedHealth = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const gateway = getWhatsAppGateway(tenantId);

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

        const sessions = (sessionsResult.data || []).map((row: { label: string; owner_name: string | null; status: string; session_data: { phoneNumber?: string } | null; last_sync: string }) => ({
            label: row.label,
            ownerName: row.owner_name,
            status: row.status,
            phoneNumber: row.session_data?.phoneNumber || null,
            lastSync: row.last_sync,
        }));

        const liveSessions = await gateway.getSessions(tenantId) as LiveSessionRecord[];
        const sessionMap = new Map<string, Record<string, unknown>>();
        
        for (const session of sessions) {
            sessionMap.set(session.label, { ...session, liveData: null });
        }

        for (const liveSession of liveSessions) {
            const existing = sessionMap.get(liveSession.label) || {};
            sessionMap.set(liveSession.label, {
                ...existing,
                ...liveSession,
                liveData: {
                    reconnectAttempts: liveSession.reconnectAttempts || 0,
                    isReconnecting: liveSession.isReconnecting || false,
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
                reconnectingSessions: enrichedSessions.filter(s => !!(s as Record<string, { isReconnecting?: boolean } | undefined>).liveData?.isReconnecting).length,
                totalReconnectAttempts: enrichedSessions.reduce((sum, s) => sum + ((s as Record<string, { reconnectAttempts?: number } | undefined>).liveData?.reconnectAttempts || 0), 0),
                healthState: health.summary?.healthState || 'unknown',
            },
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ 
            error: getErrorMessage(error, 'Failed to load detailed WhatsApp health'),
            timestamp: new Date().toISOString(),
        });
    }
};

export const getHistoryDebug = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const tenantId = context.workspaceOwnerId;
        const sessionLabel = typeof req.query.sessionLabel === 'string' ? req.query.sessionLabel.trim() : null;
        const dbClient = getDbClient();
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const countRawDump = async (options?: {
            directOnly?: boolean;
            groupOnly?: boolean;
            since?: string;
        }) => {
            let query = dbClient
                .from('raw_dump')
                .select('id', { count: 'exact', head: true })
                .eq('workspace_id', tenantId);

            if (sessionLabel) query = query.eq('session_id', sessionLabel);
            if (options?.since) query = query.gte('received_at', options.since);
            if (options?.groupOnly) query = query.like('group_jid', '%@g.us');
            if (options?.directOnly) query = query.not('group_jid', 'like', '%@g.us');

            const result = await query;
            if (result.error) throw result.error;
            return Number(result.count || 0);
        };

        const [total, direct, groups, recent24h, latestRows, sessionRows] = await Promise.all([
            countRawDump(),
            countRawDump({ directOnly: true }),
            countRawDump({ groupOnly: true }),
            countRawDump({ since: since24h }),
            (() => {
                let query = dbClient
                    .from('raw_dump')
                    .select('group_jid, sender_jid, received_at, session_id')
                    .eq('workspace_id', tenantId)
                    .order('received_at', { ascending: false })
                    .limit(20);

                if (sessionLabel) query = query.eq('session_id', sessionLabel);
                return query;
            })(),
            dbClient
                .from('whatsapp_sessions')
                .select('label, status, session_data, last_sync')
                .eq('tenant_id', tenantId)
                .order('last_sync', { ascending: false }),
        ]);

        if (latestRows.error) throw latestRows.error;
        if (sessionRows.error) throw sessionRows.error;

        const targetSessions = (sessionRows.data || []).filter((row: any) => {
            return !sessionLabel || String(row.label || '') === sessionLabel;
        });

        const chatTitleCount = targetSessions.reduce((sum: number, row: any) => {
            const titles = row?.session_data?.chatTitles;
            return sum + (titles && typeof titles === 'object' ? Object.keys(titles).length : 0);
        }, 0);

        const uniqueChats = new Set(
            (latestRows.data || [])
                .map((row: any) => String(row.group_jid || '').trim())
                .filter(Boolean),
        );

        res.json({
            success: true,
            workspace: {
                ownerId: context.workspaceOwnerId,
                memberRole: context.memberRole,
            },
            sessionLabel: sessionLabel || null,
            rawDump: {
                totalMessages: total,
                directMessages: direct,
                groupMessages: groups,
                recent24hMessages: recent24h,
                sampledRecentChats: uniqueChats.size,
            },
            sessions: targetSessions.map((row: any) => ({
                label: row.label,
                status: row.status,
                phoneNumber: row?.session_data?.phoneNumber || null,
                lastSync: row.last_sync || null,
                storedDirectChatTitles: row?.session_data?.chatTitles && typeof row.session_data.chatTitles === 'object'
                    ? Object.keys(row.session_data.chatTitles).length
                    : 0,
            })),
            recent: (latestRows.data || []).map((row: any) => ({
                chatId: row.group_jid,
                sender: row.sender_jid || null,
                receivedAt: row.received_at,
                type: String(row.group_jid || '').endsWith('@g.us') ? 'group' : 'direct',
                sessionLabel: row.session_id || null,
            })),
            summary: {
                connectedSessions: targetSessions.filter((row: any) => row.status === 'connected').length,
                storedDirectChatTitles: chatTitleCount,
            },
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({
            error: getErrorMessage(error, 'Failed to load WhatsApp history debug data'),
        });
    }
};

export const getGroupHealth = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);

    try {
        const groups = await whatsappHealthService.getGroupHealth(tenantId);
        res.json(groups);
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load WhatsApp group health') });
    }
};

export const getEvents = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);

    try {
        const events = await whatsappHealthService.getEvents(tenantId);
        res.json(events);
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load WhatsApp events') });
    }
};

export const getHealthLogs = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);

    try {
        const [groupsCount, messagesReceived, parseRatio, lastActivity, recentEvents] = await Promise.all([
            sessionEventService.getGroupsCount(tenantId),
            sessionEventService.getMessagesReceivedCount(tenantId),
            sessionEventService.getParseRatio(tenantId),
            sessionEventService.getLastActivity(tenantId),
            sessionEventService.getRecent(tenantId, 20),
        ]);

        res.json({
            groupsDetected: groupsCount,
            messagesReceived,
            parsedIntoPulse: parseRatio.parsed,
            parseSuccessRate: parseRatio.rate,
            lastInboundActivity: lastActivity,
            recentSessionEvents: recentEvents,
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load health logs') });
    }
};

export const submitSupportLogs = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);

    try {
        const [groupsCount, messagesReceived, parseRatio, lastActivity, recentEvents, groupHealthRows, profile] = await Promise.all([
            sessionEventService.getGroupsCount(tenantId),
            sessionEventService.getMessagesReceivedCount(tenantId),
            sessionEventService.getParseRatio(tenantId),
            sessionEventService.getLastActivity(tenantId),
            sessionEventService.getRecent(tenantId, 50),
            getDbClient()
                .from('whatsapp_group_health')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('updated_at', { ascending: false })
                .limit(10),
            getDbClient()
                .from('profiles')
                .select('email, full_name, phone')
                .eq('id', tenantId)
                .maybeSingle(),
        ]);

        const brokerNumber = (profile as any)?.phone || '';

        const payload = {
            workspace_id: tenantId,
            broker_number: brokerNumber,
            timestamp: new Date().toISOString(),
            health_snapshot: {
                groupsDetected: groupsCount,
                messagesReceived,
                parsedIntoPulse: parseRatio.parsed,
                parseSuccessRate: parseRatio.rate,
                lastInboundActivity: lastActivity,
            },
            recent_events: recentEvents.map((e: any) => ({
                event_type: e.event_type,
                created_at: e.created_at,
                payload: e.payload,
            })),
            groups: (groupHealthRows.data || []).map((g: any) => ({
                id: g.group_id,
                name: g.group_name,
                active: typeof g.is_active === 'boolean' ? g.is_active : String(g.status || '').toLowerCase() !== 'stale',
            })),
        };

        const { data: saved, error } = await getDbClient()
            .from('support_logs')
            .insert({
                workspace_id: tenantId,
                broker_number: brokerNumber,
                payload,
                status: 'open',
            })
            .select('id')
            .single();

        if (error) {
            return res.status(500).json({ error: error.message || 'Failed to save support log' });
        }

        const emailBody = [
            'PropAI Support Log',
            '',
            `Workspace: ${tenantId}`,
            `Broker: ${brokerNumber}`,
            `Time: ${payload.timestamp}`,
            '',
            'Health Snapshot:',
            JSON.stringify(payload.health_snapshot, null, 2),
            '',
            `Recent Events (${payload.recent_events.length}):`,
            JSON.stringify(payload.recent_events.slice(0, 10), null, 2),
            '',
            `Groups (${payload.groups.length}):`,
            JSON.stringify(payload.groups, null, 2),
        ].join('\n');

        await emailNotificationService.sendCrashReport({
            subject: `PropAI Support Log — ${brokerNumber || tenantId} — ${new Date().toISOString()}`,
            error: emailBody,
            context: { supportLogId: saved.id, workspaceId: tenantId },
        });

        res.json({
            success: true,
            referenceId: saved.id,
            message: 'Logs sent to PropAI support. We\'ll diagnose and get back to you.',
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to submit support logs') });
    }
};

export const getProfile = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.resolveContext(req.user ?? {});
    const tenantId = context.workspaceOwnerId;
    const dbClient = getDbClient();
    const { data, error } = await dbClient
        .from('profiles')
        .select(profileSelectColumns)
        .eq('id', tenantId)
        .maybeSingle();

    if (error) {
        return res.status(500).json({ error: error.message || 'Failed to load profile' });
    }

    if (!data) {
        const { data: identity, error: identityError } = await dbClient
            .from('broker_identity')
            .select('full_name')
            .eq('broker_id', tenantId)
            .maybeSingle();

        if (identityError) {
            return res.status(500).json({ error: identityError.message || 'Failed to load profile' });
        }

        const fallbackFullName = String(
            identity?.full_name
            || req.user?.full_name
            || req.user?.name
            || req.user?.user_metadata?.full_name
            || ''
        ).trim();
        const fallbackPhone = context.isWorkspaceOwner
            ? String(req.user?.user_metadata?.phone || '').replace(/\D/g, '')
            : '';

        if (!fallbackFullName && !fallbackPhone) {
            return res.json({ profile: null });
        }

        return res.json({
            profile: formatProfileResponse(null, {
                id: tenantId,
                fullName: fallbackFullName,
                phone: fallbackPhone,
                email: context.isWorkspaceOwner ? (req.user?.email || null) : null,
            }),
        });
    }

    res.json({
        profile: formatProfileResponse(data),
    });
};

export const saveProfile = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.resolveContext(req.user ?? {});
    const tenantId = context.workspaceOwnerId;
    const { fullName, phone } = req.body || {};
    const user = req.user;
    const normalizedFullName = String(fullName || '').trim();

    if (!normalizedFullName || !phone) {
        return res.status(400).json({ error: 'Full name and phone are required' });
    }

    const normalizedPhone = String(phone).split('').filter(c => c >= '0' && c <= '9').join('');
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
        return res.status(400).json({ error: 'Enter the WhatsApp number with country code only, digits only, no spaces or + sign.' });
    }

    const dbClient = getDbClient();
    const { data: existingProfile } = await dbClient
        .from('profiles')
        .select('email')
        .eq('id', tenantId)
        .maybeSingle();

    const payload: Record<string, unknown> = {
        id: tenantId,
        full_name: normalizedFullName,
        phone: normalizedPhone,
    };

    const existingEmail = String(existingProfile?.email || '').trim();
    if (existingEmail) {
        payload.email = existingEmail;
    } else if (context.isWorkspaceOwner && user?.email) {
        payload.email = user.email;
    }

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

    await dbClient
        .from('broker_identity')
        .upsert({
            broker_id: tenantId,
            full_name: normalizedFullName,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'broker_id' });

    void pushRecentAction(tenantId, 'Updated profile name');

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
    const context = await workspaceAccessService.resolveContext(req.user ?? {});
    const tenantId = context.workspaceOwnerId;
    const sessionLabel = typeof req.query.sessionLabel === 'string' ? req.query.sessionLabel.trim() : null;

    const { data, error } = await getDbClient()
        .from('messages')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('timestamp', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    const rows = Array.isArray(data) ? data : [];
    if (!sessionLabel) {
        return res.json(rows);
    }

    const groupsResult = await getDbClient()
        .from('whatsapp_groups')
        .select('group_jid')
        .eq('tenant_id', tenantId)
        .eq('session_label', sessionLabel)
        .eq('is_archived', false);

    if (groupsResult.error) {
        const message = String(groupsResult.error.message || '').toLowerCase();
        if (
            !message.includes(`could not find the table 'public.whatsapp_groups'`) &&
            !message.includes('schema cache') &&
            !message.includes('does not exist')
        ) {
            return res.status(500).json({ error: groupsResult.error.message });
        }

        return res.json(rows);
    }

    const groupIds = new Set(
        (groupsResult.data || []).map((row: any) => String(row.group_jid || '')).filter(Boolean),
    );

    if (groupIds.size === 0) {
        return res.json(rows);
    }

    return res.json(rows.filter((row: any) => {
        const remoteJid = String(row?.remote_jid || '');
        return !remoteJid.endsWith('@g.us') || groupIds.has(remoteJid);
    }));
};

export const getGroups = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const requestedSessionLabel = typeof req.query.sessionLabel === 'string' ? req.query.sessionLabel.trim() : null;
    const gateway = getWhatsAppGateway(tenantId);

    try {
        const sessionLabels = requestedSessionLabel
            ? [requestedSessionLabel]
            : (await gateway.getSessions(tenantId as string)).map((session) => session.label).filter(Boolean);

        for (const sessionLabel of sessionLabels) {
            const groups = await gateway.listGroups({ workspaceOwnerId: tenantId as string, sessionLabel });
            await whatsappGroupService.syncGroups(tenantId as string, sessionLabel, groups);
        }

        const directoryGroups = await whatsappGroupService.listGroups(tenantId as string);
        const filteredGroups = requestedSessionLabel
            ? directoryGroups.filter((group) => String(group.sessionLabel || '') === requestedSessionLabel)
            : directoryGroups;

        const groupIds = filteredGroups.map((group) => String(group.id || group.groupJid || '')).filter(Boolean);
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

        res.json(filteredGroups.map((group: Record<string, unknown>) => ({
            ...group,
            behavior: behaviorMap.get(String(group.id)) || 'Listen',
        })));
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load WhatsApp groups') });
    }
};

export const getGroupsAudit = async (req: Request, res: Response) => {
    const sessionLabel = typeof req.query.sessionLabel === 'string' ? req.query.sessionLabel.trim() : '';

    if (!sessionLabel) {
        return res.status(400).json({ error: 'sessionLabel is required' });
    }

    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const gateway = getWhatsAppGateway(context.workspaceOwnerId);
        let groups: Awaited<ReturnType<typeof gateway.listGroups>> = [];

        try {
            for (let attempt = 0; attempt < 3; attempt += 1) {
                groups = await gateway.listGroups({ workspaceOwnerId: context.workspaceOwnerId, sessionLabel });
                if (groups.length > 0) {
                    break;
                }

                await new Promise((resolve) => setTimeout(resolve, 1200));
            }

            if (groups.length > 0) {
                await whatsappGroupService.syncGroups(context.workspaceOwnerId, sessionLabel, groups);
            }
        } catch (syncError) {
            console.warn(`[getGroupsAudit] Failed to load or sync live groups for session ${sessionLabel}:`, syncError);
        }

        const audit = await groupAuditService.getAudit(context.workspaceOwnerId, sessionLabel);
        res.json({ success: true, ...audit });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to build WhatsApp group audit') });
    }
};

export const applyGroupsAudit = async (req: Request, res: Response) => {
    const sessionLabel = typeof req.body?.sessionLabel === 'string' ? req.body.sessionLabel.trim() : '';
    const parseGroupIds = Array.isArray(req.body?.parseGroupIds) ? req.body.parseGroupIds.map((id: unknown) => String(id || '').trim()).filter(Boolean) : [];
    const ignoreGroupIds = Array.isArray(req.body?.ignoreGroupIds) ? req.body.ignoreGroupIds.map((id: unknown) => String(id || '').trim()).filter(Boolean) : [];

    if (!sessionLabel) {
        return res.status(400).json({ error: 'sessionLabel is required' });
    }

    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const result = await groupAuditService.applyRecommendations({
            workspaceOwnerId: context.workspaceOwnerId,
            sessionLabel,
            parseGroupIds,
            ignoreGroupIds,
        });
        res.json({ success: true, result });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to apply group audit recommendations') });
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

    const brokerMap = new Map<string, Record<string, unknown>>();
    const leadMap = new Map<string, Record<string, unknown>>();

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
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load outbound recipients') });
    }
};

export const sendMessage = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.requireOutboundAccess(req.user ?? {});
    const tenantId = context.workspaceOwnerId;
    const { remoteJid, text, sessionKey } = req.body;
    const user = req.user;
    const gateway = getWhatsAppGateway(tenantId);
    if (!tenantId || !remoteJid || !text) {
        return res.status(400).json({ error: 'remoteJid and text are required' });
    }

    const chatType = String(remoteJid || '').endsWith('@g.us') ? 'GROUP' : 'DIRECT';
    console.log(`[sendMessage] ${chatType} send to JID: ${remoteJid} (workspace: ${tenantId})`);

    try {
        const liveSessions = await gateway.getSessions(tenantId) as LiveSessionRecord[];
        const resolvedSessionLabel = workspaceAccessService.resolvePermittedSessionLabel(
            context,
            sessionKey,
            getConnectedSessionLabels(liveSessions),
        );
        const timestamp = new Date().toISOString();

        await gateway.sendMessage({
            workspaceOwnerId: tenantId,
            sessionLabel: resolvedSessionLabel || undefined,
            remoteJid,
            text,
        });
        await getDbClient().from('messages').insert({
            tenant_id: tenantId,
            session_label: resolvedSessionLabel || 'workspace',
            remote_jid: remoteJid,
            text: String(text).trim(),
            sender: 'Broker',
            timestamp,
        });
        await whatsappThreadService.upsertFromMessage({
            tenantId,
            sessionLabel: resolvedSessionLabel || undefined,
            remoteJid,
            text: String(text).trim(),
            sender: 'Broker',
            timestamp,
        });
        void workspaceActivityService.track({
            actor: user,
            workspaceOwnerId: tenantId,
            eventType: 'whatsapp.direct.sent',
            entityType: 'conversation',
            entityId: remoteJid,
            summary: `Sent a direct WhatsApp message to ${remoteJid}.`,
            metadata: { remoteJid, sessionLabel: resolvedSessionLabel },
        });
        
        res.json({ message: 'Message sent successfully' });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to send message') });
    }
};

export const sendBulkDirectMessages = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.requireOutboundAccess(req.user ?? {});
    const tenantId = context.workspaceOwnerId;
    const { recipients, text, sessionKey } = req.body || {};
    const user = req.user;
    const gateway = getWhatsAppGateway(tenantId);

    if (!tenantId || !Array.isArray(recipients) || recipients.length === 0 || !String(text || '').trim()) {
        return res.status(400).json({ error: 'recipients and text are required' });
    }

    try {
        const liveSessions = await gateway.getSessions(tenantId) as LiveSessionRecord[];
        const resolvedSessionLabel = workspaceAccessService.resolvePermittedSessionLabel(
            context,
            sessionKey,
            getConnectedSessionLabels(liveSessions),
        );
        const sent: Array<{ remoteJid: string; label?: string | null }> = [];
        const failed: Array<{ remoteJid: string; label?: string | null; error: string }> = [];
        const timestamp = new Date().toISOString();

        for (const recipient of recipients) {
            const remoteJid = toWhatsAppJid(recipient?.remoteJid || recipient?.phone);
            const label = recipient?.label || recipient?.name || recipient?.phone || null;

            if (!remoteJid) {
                failed.push({ remoteJid: String(recipient?.remoteJid || recipient?.phone || ''), label, error: 'Invalid recipient' });
                continue;
            }

            try {
                await gateway.sendMessage({
                    workspaceOwnerId: tenantId,
                    sessionLabel: resolvedSessionLabel || undefined,
                    remoteJid,
                    text: String(text).trim(),
                });
                await getDbClient().from('messages').insert({
                    tenant_id: tenantId,
                    session_label: resolvedSessionLabel || 'workspace',
                    remote_jid: remoteJid,
                    text: String(text).trim(),
                    sender: 'Broker',
                    timestamp,
                });
                await whatsappThreadService.upsertFromMessage({
                    tenantId,
                    sessionLabel: resolvedSessionLabel || undefined,
                    remoteJid,
                    text: String(text).trim(),
                    sender: 'Broker',
                    timestamp: new Date().toISOString(),
                });
                sent.push({ remoteJid, label });
            } catch (error: unknown) {
                failed.push({ remoteJid, label, error: getErrorMessage(error, 'Failed to send message') });
            }
        }

        void workspaceActivityService.track({
            actor: user,
            workspaceOwnerId: tenantId,
            eventType: 'whatsapp.direct.bulk_sent',
            entityType: 'conversation_batch',
            entityId: resolvedSessionLabel || null,
            summary: `Sent ${sent.length} direct WhatsApp messages${failed.length ? ` with ${failed.length} failures` : ''}.`,
            metadata: {
                sessionKey: resolvedSessionLabel || null,
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
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to send direct messages') });
    }
};

export const broadcastToGroups = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.requireOutboundAccess(req.user ?? {});
    const tenantId = context.workspaceOwnerId;
    const { groupJids, text, batchSize, delayBetweenMessages, delayBetweenBatches, sessionKey } = req.body || {};
    const user = req.user;
    const gateway = getWhatsAppGateway(tenantId);

    if (!tenantId || !Array.isArray(groupJids) || groupJids.length === 0 || !text) {
        return res.status(400).json({ error: 'groupJids and text are required' });
    }

    try {
        const liveSessions = await gateway.getSessions(tenantId) as LiveSessionRecord[];
        const resolvedSessionLabel = workspaceAccessService.resolvePermittedSessionLabel(
            context,
            sessionKey,
            getConnectedSessionLabels(liveSessions),
        );
        const result = await gateway.broadcastToGroups({
            workspaceOwnerId: tenantId,
            sessionLabel: resolvedSessionLabel || undefined,
            groupJids,
            text,
            batchSize: Number(batchSize) || undefined,
            delayBetweenMessages: Number(delayBetweenMessages) || undefined,
            delayBetweenBatches: Number(delayBetweenBatches) || undefined,
        });

        if (Array.isArray(result.sent) && result.sent.length > 0) {
            const timestamp = new Date().toISOString();
            const rows = result.sent.map((groupJid: string) => ({
                tenant_id: tenantId,
                session_label: resolvedSessionLabel || 'workspace',
                remote_jid: groupJid,
                text: String(text).trim(),
                sender: 'Broker',
                timestamp,
            }));

            await getDbClient().from('messages').insert(rows);
            for (const groupJid of result.sent) {
                await whatsappThreadService.upsertFromMessage({
                    tenantId,
                    sessionLabel: resolvedSessionLabel || undefined,
                    remoteJid: groupJid,
                    text: String(text).trim(),
                    sender: 'Broker',
                    timestamp,
                });
            }
        }

        void workspaceActivityService.track({
            actor: user,
            workspaceOwnerId: tenantId,
            eventType: 'whatsapp.group.broadcast',
            entityType: 'group_batch',
            entityId: resolvedSessionLabel || null,
            summary: `Broadcasted to ${Array.isArray(result.sent) ? result.sent.length : 0} WhatsApp groups${Array.isArray(result.failed) && result.failed.length ? ` with ${result.failed.length} failures` : ''}.`,
            metadata: {
                sessionKey: resolvedSessionLabel || null,
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
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to broadcast message') });
    }
};
