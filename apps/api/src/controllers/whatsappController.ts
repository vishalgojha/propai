import { Request, Response } from 'express';
import { getWhatsAppGateway } from '../channel-gateways/whatsapp/whatsappGatewayRegistry';
import { sessionManager } from '../whatsapp/SessionManager';
import { supabase, supabaseAdmin } from '../config/supabase';
import { subscriptionService } from '../services/subscriptionService';
import { whatsappHealthService } from '../services/whatsappHealthService';
import { whatsappGroupService } from '../services/whatsappGroupService';
import { workspaceMonitorService } from '../services/workspaceMonitorService';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { workspaceActivityService } from '../services/workspaceActivityService';
import { sendWhatsAppLifecycleEmail } from '../whatsapp/propaiRuntimeHooks';
import { pushRecentAction, syncBrokerIdentityPhone } from '../services/identityService';
import { sessionEventService } from '../services/sessionEventService';
import { emailNotificationService } from '../services/emailNotificationService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import { whatsappPresenceService } from '../services/whatsappPresenceService';
import { groupAuditService } from '../services/groupAuditService';
import { whatsappThreadService } from '../services/whatsappThreadService';
import { channelService } from '../services/channelService';
import { resolveProcessRole } from '../runtime/processRole';
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

function normalizePhone(value?: string | null) {
    return String(value || '').split('').filter(c => c >= '0' && c <= '9').join('');
}

function shouldShowSessionInStatus(session: Record<string, unknown>, newestVisibleLabelByPhone: Map<string, string>) {
    const status = String(session.status || 'disconnected');
    if (status !== 'disconnected') {
        return true;
    }

    const phone = normalizePhone(session.phoneNumber as string | null | undefined);
    if (!phone) {
        return false;
    }

    return newestVisibleLabelByPhone.get(phone) === session.label;
}

function hasActiveSessionStatus(value?: unknown) {
    const status = String(value || '').toLowerCase();
    return status === 'connected' || status === 'connecting' || status === 'reconnecting';
}

const CONNECTION_ARTIFACT_TTL_MS = 120_000;
const CONNECT_START_RESPONSE_TIMEOUT_MS = 5_000;

function getPersistedConnectionArtifact(sessionData?: Record<string, unknown> | null, mode: ConnectionArtifactMode = 'qr') {
    const artifact = sessionData?.connectionArtifact;
    if (artifact && typeof artifact === 'object') {
        const record = artifact as Record<string, unknown>;
        const artifactMode = record.mode === 'pairing' ? 'pairing' : 'qr';
        const value = typeof record.value === 'string' ? record.value.trim() : '';
        const updatedAt = typeof sessionData?.connectionArtifactUpdatedAt === 'string'
            ? new Date(sessionData.connectionArtifactUpdatedAt).getTime()
            : NaN;
        const isFresh = Number.isFinite(updatedAt) && Date.now() - updatedAt <= CONNECTION_ARTIFACT_TTL_MS;
        if (value && artifactMode === mode) {
            return isFresh ? value : null;
        }
    }

    const legacyQr = typeof sessionData?.qr === 'string' ? sessionData.qr.trim() : '';
    const legacyQrUpdatedAt = typeof sessionData?.qrUpdatedAt === 'string'
        ? new Date(sessionData.qrUpdatedAt).getTime()
        : NaN;
    if (mode === 'qr' && legacyQr && Number.isFinite(legacyQrUpdatedAt) && Date.now() - legacyQrUpdatedAt <= CONNECTION_ARTIFACT_TTL_MS) {
        return legacyQr;
    }

    return null;
}

function clearConnectionSessionData(sessionData?: Record<string, unknown> | null) {
    return {
        ...(sessionData || {}),
        pendingConnect: null,
        connectionArtifact: null,
        connectionArtifactUpdatedAt: null,
        qr: null,
        qrUpdatedAt: null,
        disconnectReason: null,
        autoReconnectBlocked: false,
        autoReconnectBlockedAt: null,
    };
}

function buildFreshConnectionSessionData(input: {
    sessionData?: Record<string, unknown> | null;
    label: string;
    ownerName?: string | null;
    phoneNumber?: string | null;
    requestedAt: string;
    mode?: 'qr' | 'pairing';
}) {
    return {
        ...clearConnectionSessionData(input.sessionData),
        phoneNumber: input.phoneNumber || null,
        ownerName: input.ownerName || null,
        label: input.label,
        connectedAt: null,
        disconnectedAt: null,
        lastConnectedDurationMs: null,
        lastDisconnectReason: null,
        pendingConnect: {
            mode: input.mode || 'qr',
            phoneNumber: input.phoneNumber || null,
            ownerName: input.ownerName || null,
            requestedAt: input.requestedAt,
            requestId: `${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
            freshStart: true,
        },
    };
}

function sessionStatusPriority(value?: unknown) {
    const status = String(value || '').toLowerCase();
    if (status === 'connected') return 3;
    if (status === 'reconnecting') return 2;
    if (status === 'connecting') return 1;
    return 0;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T, label: string): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | null = null;

    try {
        return await Promise.race([
            promise,
            new Promise<T>((resolve) => {
                timeoutHandle = setTimeout(() => {
                    console.warn(`[whatsappController] ${label} timed out after ${timeoutMs}ms`);
                    resolve(fallback);
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}

function getTenantId(req: Request) {
    const user = req.user;
    return user?.id || 'system';
}
const OWNER_SUPER_ADMIN_EMAILS = new Set([
    'vishal@chaoscraftlabs.com',
    'hello@chaoscraftlabs.com',
    'ojha007@gmail.com',
    'hello@propai.live',
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

async function getLockedWorkspacePhone(tenantId: string, fallbackPhone?: string | null) {
    const dbClient = getDbClient();
    const { data: profile } = await dbClient
        .from('profiles')
        .select('phone')
        .eq('id', tenantId)
        .maybeSingle();

    const profilePhone = normalizeRecipientPhone(profile?.phone);
    if (profilePhone) {
        return profilePhone;
    }

    return normalizeRecipientPhone(fallbackPhone);
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

async function sendWhatsAppCrashReport(subject: string, error: unknown, context: Record<string, unknown>) {
    try {
        await emailNotificationService.sendCrashReport({
            to: 'hello@propai.live',
            subject,
            error: getErrorMessage(error, 'WhatsApp operation failed'),
            context,
        });
    } catch (reportError) {
        console.error('[whatsappController] Failed to send WhatsApp crash report:', reportError);
    }
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
    let sessionLabel = buildSessionLabel(ownerName || label, phoneNumber);
    const gateway = getWhatsAppGateway(tenantId);
    const processRole = resolveProcessRole(process.env.PROPAI_PROCESS_ROLE);
    let requestedPhone = normalizeRecipientPhone(phoneNumber);
    let lockedWorkspacePhone: string | null = null;

    try {
        if (connectMethod === 'pairing' && !phoneNumber) {
            return res.status(400).json({ error: 'Enter the WhatsApp number to request a pairing code.' });
        }

        lockedWorkspacePhone = await getLockedWorkspacePhone(
            tenantId,
            context.isWorkspaceOwner ? String(req.user?.user_metadata?.phone || '') : null,
        );

        if (lockedWorkspacePhone && requestedPhone && requestedPhone !== lockedWorkspacePhone) {
            return res.status(409).json({
                error: `This workspace is locked to WhatsApp number ${lockedWorkspacePhone}. Use that number for connection.`,
            });
        }

        const dbClient = getDbClient();
        const normalizedRequestedPhone = requestedPhone || lockedWorkspacePhone;
        if (normalizedRequestedPhone) {
            const { data: samePhoneRows } = await dbClient
                .from('whatsapp_sessions')
                .select('label, status, session_data, last_sync')
                .eq('tenant_id', tenantId)
                .order('last_sync', { ascending: false });

            const matchingRows = (samePhoneRows || []).filter((row: any) => (
                normalizeRecipientPhone(row?.session_data?.phoneNumber) === normalizedRequestedPhone
            ));
            const preferredRow = matchingRows.find((row: any) => hasActiveSessionStatus(row?.status)) || matchingRows[0];
            if (preferredRow?.label) {
                sessionLabel = String(preferredRow.label);
            }
        }

        const existingSession = await gateway.getStatus({ workspaceOwnerId: tenantId, sessionLabel });
        const { data: existingRow } = await dbClient
            .from('whatsapp_sessions')
            .select('status, session_data, creds, keys')
            .eq('tenant_id', tenantId)
            .eq('label', sessionLabel)
            .maybeSingle();
        const existingData = (existingRow?.session_data && typeof existingRow.session_data === 'object')
            ? existingRow.session_data as Record<string, unknown>
            : {};

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

        if (existingRow?.status !== 'connected') {
            if (existingSession) {
                await gateway.disconnect({ workspaceOwnerId: tenantId, sessionLabel });
            }

            await dbClient
                .from('whatsapp_sessions')
                .update({
                    status: 'disconnected',
                    creds: null,
                    keys: null,
                    session_data: clearConnectionSessionData(existingData),
                    updated_at: new Date().toISOString(),
                    last_sync: new Date().toISOString(),
                })
                .eq('tenant_id', tenantId)
                .eq('label', sessionLabel);
        }

        if (processRole === 'api') {
            const requestedAt = new Date().toISOString();
            await dbClient
                .from('whatsapp_sessions')
                .upsert({
                    session_id: `${tenantId}:${sessionLabel}`,
                    tenant_id: tenantId,
                    label: sessionLabel,
                    owner_name: ownerName || null,
                    session_data: {
                        ...existingData,
                        phoneNumber: phoneNumber || normalizedRequestedPhone || null,
                        ownerName: ownerName || null,
                        label: sessionLabel,
                        pendingConnect: {
                            mode: connectMethod,
                            phoneNumber: phoneNumber || normalizedRequestedPhone || null,
                            ownerName: ownerName || null,
                            requestedAt,
                            requestId: `${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
                        },
                        connectionArtifact: null,
                        connectionArtifactUpdatedAt: null,
                        disconnectReason: null,
                        autoReconnectBlocked: false,
                        autoReconnectBlockedAt: null,
                        groupAuditPending: existingData.groupAuditCompletedAt ? Boolean(existingData.groupAuditPending) : true,
                        groupAuditCompletedAt: existingData.groupAuditCompletedAt || null,
                    },
                    status: 'connecting',
                    last_sync: requestedAt,
                    updated_at: requestedAt,
                }, { onConflict: 'tenant_id,label' });

            res.json({
                message: 'Connection request queued',
                label: sessionLabel,
                artifact: null,
                qr: null,
                pairingCode: null,
                connected: false,
                mode: connectMethod,
            });
            return;
        }

        const connectingAt = new Date().toISOString();
        const nextSessionData = {
            ...existingData,
            phoneNumber: phoneNumber || normalizedRequestedPhone || null,
            ownerName: ownerName || null,
            label: sessionLabel,
            groupAuditPending: existingData.groupAuditCompletedAt ? Boolean(existingData.groupAuditPending) : true,
            groupAuditCompletedAt: existingData.groupAuditCompletedAt || null,
        };

        await dbClient
            .from('whatsapp_sessions')
            .upsert({
                tenant_id: tenantId,
                label: sessionLabel,
                owner_name: ownerName || null,
                session_data: nextSessionData,
                status: 'connecting',
                last_sync: connectingAt,
                updated_at: connectingAt,
            }, { onConflict: 'tenant_id,label' });

        const connectPromise = gateway.connect({
            workspaceOwnerId: tenantId,
            sessionLabel,
            ownerName,
            phoneNumber,
            mode: connectMethod,
        });

        const connectResult = await Promise.race([
            connectPromise,
            new Promise<null>((resolve) => {
                setTimeout(() => resolve(null), CONNECT_START_RESPONSE_TIMEOUT_MS);
            }),
        ]);

        if (!connectResult) {
            connectPromise.catch(async (error: unknown) => {
                console.error('Connect Error after response:', error);
                void sendWhatsAppCrashReport(
                    `WhatsApp connect crash log — ${sessionLabel || 'unknown session'} — ${new Date().toISOString()}`,
                    error,
                    {
                        operation: 'connectWhatsApp.background',
                        tenantId,
                        sessionLabel,
                        connectMethod,
                        phoneNumber: phoneNumber || null,
                        ownerName: ownerName || null,
                        requestedPhone: requestedPhone || null,
                        lockedWorkspacePhone: lockedWorkspacePhone || null,
                    },
                );
                await getDbClient()
                    .from('whatsapp_sessions')
                    .update({
                        status: 'disconnected',
                        last_sync: new Date().toISOString(),
                    })
                    .eq('tenant_id', tenantId)
                    .eq('label', sessionLabel);
            });

            res.json({
                message: 'Connection initiated, QR generation is still in progress',
                label: sessionLabel,
                artifact: null,
                qr: null,
                pairingCode: null,
                connected: false,
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
                    deferredResponse: true,
                },
            });

            void pushRecentAction(tenantId, `Started WhatsApp connection (${connectMethod})`);
            return;
        }

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

        const artifact = await gateway.getQRCode({ workspaceOwnerId: tenantId, sessionLabel }) || artifactAfterCreate;
        res.json({
            message: 'Connection initiated',
            label: sessionLabel,
            artifact: buildConnectionArtifact(connectMethod, artifact),
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
        void sendWhatsAppCrashReport(
            `WhatsApp connect crash log — ${sessionLabel || 'unknown session'} — ${new Date().toISOString()}`,
            error,
            {
                operation: 'connectWhatsApp',
                tenantId,
                sessionLabel,
                connectMethod,
                phoneNumber: phoneNumber || null,
                ownerName: ownerName || null,
                requestedPhone: requestedPhone || null,
                lockedWorkspacePhone: lockedWorkspacePhone || null,
            },
        );
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
    const processRole = resolveProcessRole(process.env.PROPAI_PROCESS_ROLE);

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
        const sessionData = sessionRow?.session_data && typeof sessionRow.session_data === 'object'
            ? sessionRow.session_data as Record<string, unknown>
            : {};

        if (sessionKey) {
            await sessionManager.hardResetSession(tenantId, sessionKey).catch((error) => {
                console.warn('[forceRefreshQR] Hard reset before fresh QR failed; continuing with DB cleanup.', {
                    tenantId,
                    sessionKey,
                    error,
                });
            });
        }

        if (processRole === 'api') {
            if (!sessionKey) {
                throw new Error('No active session found to refresh');
            }

            const requestedAt = new Date().toISOString();
            const phoneNumber = typeof sessionData.phoneNumber === 'string' ? sessionData.phoneNumber : undefined;
            const ownerName = sessionRow?.owner_name || (typeof sessionData.ownerName === 'string' ? sessionData.ownerName : undefined);
            await dbClient
                .from('whatsapp_sessions')
                .update({
                    creds: null,
                    keys: null,
                    session_data: buildFreshConnectionSessionData({
                        sessionData,
                        label: sessionKey,
                        phoneNumber: phoneNumber || null,
                        ownerName: ownerName || null,
                        requestedAt,
                        mode: 'qr',
                    }),
                    status: 'connecting',
                    updated_at: requestedAt,
                    last_sync: requestedAt,
                })
                .eq('tenant_id', tenantId)
                .eq('label', sessionKey);

            res.json({
                success: true,
                message: 'Fresh QR start queued',
                label: sessionKey,
                status: 'connecting',
            });

            void workspaceActivityService.track({
                actor: req.user,
                workspaceOwnerId: tenantId,
                eventType: 'whatsapp.qr.fresh_start',
                entityType: 'whatsapp_session',
                entityId: sessionKey,
                summary: `Queued a fresh QR start for session ${sessionKey}.`,
                metadata: { label: sessionKey, queuedForWorker: true, freshStart: true },
            });
            return;
        }

        let result: { label: string; message?: string };
        try {
            if (!sessionKey) {
                throw new Error('No active session found to refresh');
            }

            const requestedAt = new Date().toISOString();
            const phoneNumber = typeof sessionData.phoneNumber === 'string' ? sessionData.phoneNumber : undefined;
            const ownerName = sessionRow?.owner_name || (typeof sessionData.ownerName === 'string' ? sessionData.ownerName : undefined);
            await dbClient
                .from('whatsapp_sessions')
                .update({
                    creds: null,
                    keys: null,
                    session_data: buildFreshConnectionSessionData({
                        sessionData,
                        label: sessionKey,
                        phoneNumber: phoneNumber || null,
                        ownerName: ownerName || null,
                        requestedAt,
                        mode: 'qr',
                    }),
                    status: 'connecting',
                    updated_at: requestedAt,
                    last_sync: requestedAt,
                })
                .eq('tenant_id', tenantId)
                .eq('label', sessionKey);

            await gateway.connect({
                workspaceOwnerId: tenantId,
                sessionLabel: sessionKey,
                ownerName: ownerName || undefined,
                phoneNumber,
                mode: 'qr',
            });
            result = {
                label: sessionKey,
                message: 'Fresh QR start initiated',
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : '';
            const canRevivePersistedSession =
                sessionRow?.label &&
                (message.includes('No active session') || message.includes('Session client not found'));

            if (!canRevivePersistedSession) {
                throw error;
            }

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
                message: 'Fresh QR start initiated',
            };
        }
        
        setTimeout(() => {
            void gateway.getQRCode({ workspaceOwnerId: tenantId as string, sessionLabel: result.label });
        }, 2000);

        res.json({
            success: true,
            message: 'Fresh QR start initiated',
            label: result.label,
            status: 'connecting',
        });

        void workspaceActivityService.track({
            actor: req.user,
            workspaceOwnerId: tenantId,
            eventType: 'whatsapp.qr.fresh_start',
            entityType: 'whatsapp_session',
            entityId: result.label,
            summary: `Started a fresh QR flow for session ${result.label}.`,
            metadata: { label: result.label, freshStart: true },
        });
    } catch (error: unknown) {
        console.error('Force Refresh QR Error:', error);
        void sendWhatsAppCrashReport(
            `WhatsApp QR refresh crash log — ${sessionKey || 'unknown session'} — ${new Date().toISOString()}`,
            error,
            {
                operation: 'forceRefreshQR',
                tenantId,
                sessionKey: sessionKey || null,
                label: label || null,
            },
        );
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
        .select('status, last_sync, session_data')
        .eq('tenant_id', tenantId)
        .eq('label', label || targetSession?.label || 'Owner')
        .maybeSingle();

    const sessionData = (sessionRow?.session_data && typeof sessionRow.session_data === 'object')
        ? sessionRow.session_data as Record<string, unknown>
        : {};
    const persistedArtifact = getPersistedConnectionArtifact(sessionData, 'qr') || getPersistedConnectionArtifact(sessionData, 'pairing');
    if (persistedArtifact) {
        const artifactMode = getPersistedConnectionArtifact(sessionData, 'pairing') ? 'pairing' : 'qr';
        return res.json({
            qr: artifactMode === 'qr' ? persistedArtifact : null,
            pairingCode: artifactMode === 'pairing' ? persistedArtifact : null,
            artifact: buildConnectionArtifact(artifactMode, persistedArtifact),
            label: label || targetSession?.label,
            ready: true,
        });
    }

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

    const dbSessions = (data || []).map((row: { label: string; owner_name: string | null; status: string; session_data: Record<string, unknown> | null; last_sync: string }) => {
        const sessionData = row.session_data || {};
        return {
            label: row.label,
            ownerName: row.owner_name,
            status: row.status,
            phoneNumber: typeof sessionData.phoneNumber === 'string' ? sessionData.phoneNumber : null,
            sessionData: row.session_data || null,
            connectedAt: typeof sessionData.connectedAt === 'string' ? sessionData.connectedAt : null,
            disconnectedAt: typeof sessionData.disconnectedAt === 'string' ? sessionData.disconnectedAt : null,
            disconnectReason: typeof sessionData.disconnectReason === 'string'
                ? sessionData.disconnectReason
                : typeof sessionData.lastDisconnectReason === 'string'
                    ? sessionData.lastDisconnectReason
                    : null,
            lastConnectedDurationMs: Number.isFinite(Number(sessionData.lastConnectedDurationMs))
                ? Number(sessionData.lastConnectedDurationMs)
                : null,
            lastSync: row.last_sync,
        };
    });
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
        const activePhones = new Set<string>();
        for (const session of sessions) {
            const row = session as Record<string, unknown>;
            const phone = normalizePhone(row.phoneNumber as string | null | undefined);
            if (phone && hasActiveSessionStatus(row.status)) {
                activePhones.add(phone);
            }
        }
        const newestVisibleLabelByPhone = new Map<string, string>();
        for (const session of sessions) {
            const row = session as Record<string, unknown>;
            const phone = normalizePhone(row.phoneNumber as string | null | undefined);
            if (phone && activePhones.has(phone) && !hasActiveSessionStatus(row.status)) {
                continue;
            }
            if (phone && !newestVisibleLabelByPhone.has(phone)) {
                newestVisibleLabelByPhone.set(phone, String(row.label || ''));
            }
        }
        const visibleSessions = sessions.filter((session) => {
            const row = session as Record<string, unknown>;
            const phone = normalizePhone(row.phoneNumber as string | null | undefined);
            if (phone && activePhones.has(phone) && !hasActiveSessionStatus(row.status)) {
                return false;
            }
            return shouldShowSessionInStatus(row, newestVisibleLabelByPhone);
        });

        const deduplicatedSessions: Record<string, unknown>[] = [];
        const seenPhones = new Map<string, Record<string, unknown>>();
        for (const session of visibleSessions) {
            const row = session as Record<string, unknown>;
            const phone = normalizePhone(row.phoneNumber as string | null | undefined);
            if (phone) {
                const existing = seenPhones.get(phone);
                const nextPriority = sessionStatusPriority(row.status);
                const existingPriority = sessionStatusPriority(existing?.status);
                const nextLastSync = new Date(String(row.lastSync || 0)).getTime();
                const existingLastSync = new Date(String(existing?.lastSync || 0)).getTime();
                if (
                    !existing ||
                    nextPriority > existingPriority ||
                    (nextPriority === existingPriority && nextLastSync > existingLastSync)
                ) {
                    seenPhones.set(phone, row);
                }
            } else {
                deduplicatedSessions.push(row);
            }
        }
        const finalSessions = [...deduplicatedSessions, ...Array.from(seenPhones.values())]
            .sort((a, b) => {
                const priorityDelta = sessionStatusPriority(b.status) - sessionStatusPriority(a.status);
                if (priorityDelta !== 0) {
                    return priorityDelta;
                }

                return new Date(String(b.lastSync || 0)).getTime() - new Date(String(a.lastSync || 0)).getTime();
            });

        const connectedSessions = finalSessions.filter((session) => (session as Record<string, string>).status === 'connected');
        const reconnectingSessions = finalSessions.filter((session) => {
            const row = session as Record<string, unknown>;
            return row.status === 'reconnecting' || (row.status === 'connecting' && Boolean(row.isReconnecting));
        });
        const connectingSessions = finalSessions.filter((session) => {
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
            sessions: finalSessions.map((session) => {
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
    const dbClient = getDbClient();

    try {
        // Find the session in DB even if no active client exists
        const { data: sessionRow } = await dbClient
            .from('whatsapp_sessions')
            .select('label, session_data, owner_name')
            .eq('tenant_id', tenantId)
            .eq('label', String(targetSessionKey || ''))
            .maybeSingle();

        const resolvedLabel = sessionRow?.label || targetSessionKey || '';
        const sessionData = sessionRow?.session_data && typeof sessionRow.session_data === 'object'
            ? sessionRow.session_data as Record<string, unknown>
            : {};

        // Try to disconnect active client (may not exist if API restarted)
        try {
            await gateway.disconnect({ workspaceOwnerId: tenantId, sessionLabel: resolvedLabel });
        } catch {
            // Client may not exist, but we still clear the DB
        }

        // Always clear DB state even if no active client
        await dbClient
            .from('whatsapp_sessions')
            .update({
                status: 'disconnected',
                creds: null,
                keys: null,
                session_data: clearConnectionSessionData(sessionData),
                updated_at: new Date().toISOString(),
                last_sync: new Date().toISOString(),
            })
            .eq('tenant_id', tenantId)
            .eq('label', resolvedLabel);

        // Also clear ingestion health
        await dbClient
            .from('whatsapp_ingestion_health')
            .update({
                connection_status: 'disconnected',
                qr_code: null,
                error_code: null,
                updated_at: new Date().toISOString(),
            })
            .eq('tenant_id', tenantId)
            .eq('session_label', resolvedLabel);

        await sendWhatsAppLifecycleEmail({
            tenantId,
            label: resolvedLabel,
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
            entityId: resolvedLabel,
            summary: `Disconnected WhatsApp session ${resolvedLabel || 'default'}.`,
            metadata: {
                targetSessionKey: resolvedLabel || null,
            },
        });

        void pushRecentAction(tenantId, `Disconnected WhatsApp session`);

        res.json({ message: 'Disconnected successfully' });
    } catch (error: unknown) {
        console.error('Disconnect Error:', error);
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Could not disconnect. Please try again.') });
    }
};

export const resetWhatsAppSession = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.resolveContext(req.user ?? {});
    const tenantId = context.workspaceOwnerId;
    const { label, phoneNumber } = req.body || {};
    const dbClient = getDbClient();
    const gateway = getWhatsAppGateway(tenantId);
    let targetLabel: string | undefined = label || undefined;

    try {
        if (!targetLabel && phoneNumber) {
            const normalized = normalizeRecipientPhone(phoneNumber);
            const { data: rows } = await dbClient
                .from('whatsapp_sessions')
                .select('label, session_data')
                .eq('tenant_id', tenantId)
                .order('last_sync', { ascending: false });
            const match = (rows || []).find((r: any) =>
                normalizeRecipientPhone(r?.session_data?.phoneNumber) === normalized
            );
            targetLabel = match?.label || undefined;
        }

        if (targetLabel) {
            await sessionManager.hardResetSession(tenantId, targetLabel);
        }

        const sessionFilter = targetLabel
            ? { tenant_id: tenantId, label: targetLabel }
            : { tenant_id: tenantId };

        const { error } = await dbClient
            .from('whatsapp_sessions')
            .update({
                status: 'disconnected',
                creds: null,
                keys: null,
                session_data: {},
                updated_at: new Date().toISOString(),
                last_sync: new Date().toISOString(),
            })
            .match(sessionFilter);

        if (error) {
            console.error('[resetWhatsAppSession] DB cleanup error:', error);
        }

        void workspaceActivityService.track({
            actor: req.user,
            workspaceOwnerId: tenantId,
            eventType: 'whatsapp.session.reset',
            entityType: 'whatsapp_session',
            entityId: targetLabel || 'all',
            summary: `Hard reset WhatsApp session ${targetLabel || 'all'}.`,
            metadata: { label: targetLabel || null, phoneNumber: phoneNumber || null },
        });

        res.json({
            message: 'Session reset successfully. You can now reconnect with a fresh QR scan or pairing code.',
            label: targetLabel || null,
        });
    } catch (error: unknown) {
        console.error('Reset Session Error:', error);
        void sendWhatsAppCrashReport(
            `WhatsApp reset crash log — ${targetLabel || 'all sessions'} — ${new Date().toISOString()}`,
            error,
            {
                operation: 'resetWhatsAppSession',
                tenantId,
                targetLabel: targetLabel || null,
                phoneNumber: phoneNumber || null,
            },
        );
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Could not reset session.') });
    }
};

export const resetAllWhatsAppSessions = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.resolveContext(req.user ?? {});
    const tenantId = context.workspaceOwnerId;
    const dbClient = getDbClient();
    const gateway = getWhatsAppGateway(tenantId);

    try {
        const [dbResult, liveSessions] = await Promise.all([
            dbClient
                .from('whatsapp_sessions')
                .select('label')
                .eq('tenant_id', tenantId),
            gateway.getSessions(tenantId).catch(() => []),
        ]);

        if (dbResult.error) {
            throw dbResult.error;
        }

        const labels = new Set<string>();
        for (const row of dbResult.data || []) {
            const label = String((row as { label?: string }).label || '').trim();
            if (label) {
                labels.add(label);
            }
        }
        for (const liveSession of liveSessions as LiveSessionRecord[]) {
            const label = String(liveSession.label || '').trim();
            if (label) {
                labels.add(label);
            }
        }

        for (const label of labels) {
            try {
                await sessionManager.hardResetSession(tenantId, label);
            } catch (error) {
                console.error(`[resetAllWhatsAppSessions] Failed to hard reset ${label}:`, error);
            }
        }

        await Promise.all([
            dbClient
                .from('whatsapp_sessions')
                .delete()
                .eq('tenant_id', tenantId),
            dbClient
                .from('whatsapp_ingestion_health')
                .delete()
                .eq('tenant_id', tenantId),
        ]);

        void workspaceActivityService.track({
            actor: req.user,
            workspaceOwnerId: tenantId,
            eventType: 'whatsapp.session.reset_all',
            entityType: 'whatsapp_session',
            entityId: 'all',
            summary: 'Wiped all WhatsApp session state for a fresh start.',
            metadata: { sessionCount: labels.size },
        });

        void pushRecentAction(tenantId, 'Reset all WhatsApp sessions');

        res.json({
            success: true,
            message: 'All WhatsApp session state cleared. You can now connect afresh.',
            clearedSessions: labels.size,
        });
    } catch (error: unknown) {
        console.error('Reset All Sessions Error:', error);
        void sendWhatsAppCrashReport(
            `WhatsApp reset-all crash log — ${new Date().toISOString()}`,
            error,
            {
                operation: 'resetAllWhatsAppSessions',
                tenantId,
            },
        );
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Could not clear all WhatsApp sessions.') });
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

        const sessions = (sessionsResult.data || []).map((row: {
            label: string;
            owner_name: string | null;
            status: string;
            session_data: {
                phoneNumber?: string;
                disconnectReason?: string | null;
                autoReconnectBlocked?: boolean;
                autoReconnectBlockedAt?: string | null;
                lastIngestionStallAlertSignature?: string | null;
                lastIngestionStallAlertDelivery?: string | null;
                lastIngestionStallAlertAt?: string | null;
            } | null;
            last_sync: string;
        }) => ({
            label: row.label,
            ownerName: row.owner_name,
            status: row.status,
            phoneNumber: row.session_data?.phoneNumber || null,
            lastSync: row.last_sync,
            diagnostics: {
                disconnectReason: row.session_data?.disconnectReason || null,
                autoReconnectBlocked: Boolean(row.session_data?.autoReconnectBlocked),
                autoReconnectBlockedAt: row.session_data?.autoReconnectBlockedAt || null,
                lastIngestionStallAlertSignature: row.session_data?.lastIngestionStallAlertSignature || null,
                lastIngestionStallAlertDelivery: row.session_data?.lastIngestionStallAlertDelivery || null,
                lastIngestionStallAlertAt: row.session_data?.lastIngestionStallAlertAt || null,
            },
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
        const replayCandidates = groups
            .filter((group: any) =>
                String(group?.source || '') !== 'parsed_history'
                && String(group?.groupId || '').endsWith('@g.us')
                && group?.isParsing !== false
                && Number(group?.messagesReceived24h || 0) > 0
                && Number(group?.messagesParsed24h || 0) === 0)
            .slice(0, 5);

        for (const group of replayCandidates) {
            channelService.queueRawDumpReplay(tenantId, {
                sessionLabel: String(group.sessionLabel || '').trim() || null,
                remoteJid: String(group.groupId || '').trim() || null,
                limit: 250,
                minIntervalMs: 5 * 60_000,
                reason: 'group_health_zero_parse',
            });
        }
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
        return res.status(400).json({ error: 'Enter your 10-digit WhatsApp number, digits only.' });
    }

    const dbClient = getDbClient();
    const existingProfileResult = await withTimeout<{ data: { email?: string | null; phone?: string | null } | null; error: { message?: string } | null }>(
        Promise.resolve(
            dbClient
                .from('profiles')
                .select('email, phone')
                .eq('id', tenantId)
                .maybeSingle(),
        ) as Promise<{ data: { email?: string | null; phone?: string | null } | null; error: { message?: string } | null }>,
        2500,
        { data: null, error: null },
        'saveProfile existing profile lookup',
    );
    const existingProfile = existingProfileResult.data;

    const lockedWorkspacePhone = normalizeRecipientPhone(existingProfile?.phone)
        || normalizeRecipientPhone(context.isWorkspaceOwner ? String(req.user?.user_metadata?.phone || '') : null);

    if (lockedWorkspacePhone && lockedWorkspacePhone !== normalizedPhone) {
        return res.status(409).json({
            error: `This workspace is locked to WhatsApp number ${lockedWorkspacePhone}. It cannot be changed here.`,
        });
    }

    const payload: Record<string, unknown> = {
        id: tenantId,
        full_name: normalizedFullName,
        phone: lockedWorkspacePhone || normalizedPhone,
    };

    const existingEmail = String(existingProfile?.email || '').trim();
    if (existingEmail) {
        payload.email = existingEmail;
    } else if (context.isWorkspaceOwner && user?.email) {
        payload.email = user.email;
    }

    const upsertResult = await withTimeout<{ data: unknown; error: { message?: string } | null }>(
        Promise.resolve(
            dbClient
                .from('profiles')
                .upsert(payload, { onConflict: 'id' }),
        ) as Promise<{ data: unknown; error: { message?: string } | null }>,
        3000,
        { data: null, error: null },
        'saveProfile profile upsert',
    );
    const upsertError = upsertResult.error;

    if (upsertError) {
        return res.status(500).json({ error: upsertError.message || 'Failed to save profile' });
    }

    void (async () => {
        await syncBrokerIdentityPhone(
            tenantId,
            lockedWorkspacePhone || normalizedPhone,
            normalizedFullName,
        ).catch(() => null);

        try {
            await dbClient
                .from('broker_identity')
                .upsert({
                    broker_id: tenantId,
                    full_name: normalizedFullName,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'broker_id' });
        } catch {
            // Non-critical for WhatsApp connect.
        }

        await pushRecentAction(tenantId, 'Updated profile name').catch(() => null);
    })();

    res.json({
        profile: formatProfileResponse(null, {
            id: tenantId,
            fullName: normalizedFullName,
            phone: lockedWorkspacePhone || normalizedPhone,
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
        let audit = await groupAuditService.getAudit(context.workspaceOwnerId, sessionLabel);

        try {
            const maxAttempts = audit.groups.length > 0 ? 1 : 3;

            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                groups = await withTimeout(
                    gateway.listGroups({ workspaceOwnerId: context.workspaceOwnerId, sessionLabel }),
                    4000,
                    [],
                    `List groups for audit session ${sessionLabel}`,
                );
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

        if (groups.length > 0) {
            audit = await groupAuditService.getAudit(context.workspaceOwnerId, sessionLabel);
        }

        res.json({ success: true, ...audit });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to build WhatsApp group audit') });
    }
};

export const applyGroupsAudit = async (req: Request, res: Response) => {
    const sessionLabel = typeof req.body?.sessionLabel === 'string' ? req.body.sessionLabel.trim() : '';

    if (!sessionLabel) {
        return res.status(400).json({ error: 'sessionLabel is required' });
    }

    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const result = await groupAuditService.rescanGroups(context.workspaceOwnerId, sessionLabel);
        res.json({ success: true, result });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to rescan groups') });
    }
};

export const rescanGroups = async (req: Request, res: Response) => {
    const sessionLabel = typeof req.body?.sessionLabel === 'string' ? req.body.sessionLabel.trim() : '';

    if (!sessionLabel) {
        return res.status(400).json({ error: 'sessionLabel is required' });
    }

    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const gateway = getWhatsAppGateway(context.workspaceOwnerId);

        const liveGroups = await gateway.listGroups({
            workspaceOwnerId: context.workspaceOwnerId,
            sessionLabel,
        });

        if (liveGroups.length > 0) {
            await whatsappGroupService.syncGroups(context.workspaceOwnerId, sessionLabel, liveGroups);
        }

        const result = await groupAuditService.rescanGroups(context.workspaceOwnerId, sessionLabel);
        res.json({ success: true, liveGroupsFound: liveGroups.length, result });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to rescan groups') });
    }
};

export const getGroupStreamItems = async (req: Request, res: Response) => {
    const groupJid = String(req.params.groupJid || '').trim();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

    if (!groupJid) {
        return res.status(400).json({ error: 'groupJid is required' });
    }

    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const db = supabaseAdmin || supabase;

        const [resResult, comResult] = await Promise.all([
            db.from('stream_items_residential').select('id, source_group_id, source_group_name, raw_text, type, record_type, locality, city, bhk, price_label, price_numeric, deal_type, asset_class, confidence_score, ingestion_status, created_at').eq('tenant_id', context.workspaceOwnerId).eq('source_group_id', groupJid).order('created_at', { ascending: false }).limit(limit),
            db.from('stream_items_commercial').select('id, source_group_id, source_group_name, raw_text, type, record_type, locality, city, bhk, price_label, price_numeric, deal_type, asset_class, confidence_score, ingestion_status, created_at').eq('tenant_id', context.workspaceOwnerId).eq('source_group_id', groupJid).order('created_at', { ascending: false }).limit(limit),
        ]);
        const data = [
            ...(Array.isArray(resResult.data) ? resResult.data : []),
            ...(Array.isArray(comResult.data) ? comResult.data : []),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);

        if (resResult.error || comResult.error) {
            return res.status(500).json({ error: resResult.error?.message || comResult.error?.message });
        }

        res.json({ success: true, items: data || [] });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to fetch group stream items') });
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
