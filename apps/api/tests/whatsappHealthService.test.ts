import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppHealthService } from '../src/services/whatsappHealthService';

const { sessionManager, dbFrom, dbSelect, dbNot, sessionDataEq, sessionDataMaybeSingle, sessionDataUpdate, sessionDataUpdateEq } = vi.hoisted(() => ({
    sessionManager: {
        getAllSessions: vi.fn(),
        createSession: vi.fn(),
        forceReconnect: vi.fn(),
        rehydratePersistedSessions: vi.fn(),
    },
    dbFrom: vi.fn(),
    dbSelect: vi.fn(),
    dbNot: vi.fn(),
    sessionDataEq: vi.fn(),
    sessionDataMaybeSingle: vi.fn(),
    sessionDataUpdate: vi.fn(),
    sessionDataUpdateEq: vi.fn(),
}));

dbFrom.mockImplementation((table: string) => {
    if (table === 'whatsapp_sessions') {
        const sessionSelectChain = {
            eq: sessionDataEq,
            maybeSingle: sessionDataMaybeSingle,
        };
        sessionDataEq.mockImplementation(function () {
            return sessionSelectChain;
        });

        const sessionUpdateChain = {
            eq: sessionDataUpdateEq,
        };
        sessionDataUpdateEq.mockImplementation(function () {
            return sessionUpdateChain;
        });

        return {
            select: vi.fn((columns?: string) => {
                if (columns === 'session_data') {
                    return sessionSelectChain;
                }

                return dbSelect.mockReturnValue({
                    not: dbNot,
                })();
            }),
            update: sessionDataUpdate.mockReturnValue(sessionUpdateChain),
        };
    }

    return {
        select: dbSelect.mockReturnValue({
            not: dbNot,
        }),
    };
});

vi.mock('../src/config/supabase', () => ({
    supabase: {
        from: dbFrom,
    },
    supabaseAdmin: null,
}));

vi.mock('../src/channel-gateways/whatsapp/whatsappGatewayRegistry', () => ({
    getWhatsAppGateway: vi.fn(),
}));

vi.mock('../src/services/notificationService', () => ({
    notificationService: {
        sendToTenant: vi.fn().mockResolvedValue({ sent: 1, failed: 0, skipped: false }),
    },
}));

describe('WhatsAppHealthService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        dbNot.mockResolvedValue({ data: [], error: null });
        sessionDataMaybeSingle.mockResolvedValue({ data: { session_data: {} }, error: null });
        sessionDataUpdateEq.mockReturnValue({ error: null });
    });

    it('restarts a stale disconnected live WhatsApp session during heartbeat', async () => {
        const service = new WhatsAppHealthService();
        const appendEventSpy = vi.spyOn(service, 'appendEvent').mockResolvedValue(undefined);
        const now = Date.now();

        sessionManager.getAllSessions.mockReturnValue([
            {
                tenantId: 'tenant-1',
                label: 'Owner',
                status: 'disconnected',
                ownerName: 'Owner',
                phoneNumber: '919999999999',
                reconnectAttempts: 0,
                isReconnecting: false,
            },
        ]);

        dbNot.mockResolvedValue({
            data: [
                {
                    tenant_id: 'tenant-1',
                    label: 'Owner',
                    status: 'disconnected',
                    owner_name: 'Owner',
                    session_data: {
                        phoneNumber: '919999999999',
                    },
                    creds: { key: 'creds' },
                    keys: { key: 'keys' },
                    updated_at: new Date(now - 10 * 60_000).toISOString(),
                },
            ],
            error: null,
        });

        await (service as any).runHeartbeatSweep(sessionManager);

        expect(sessionManager.createSession).toHaveBeenCalledWith(
            'tenant-1',
            expect.any(Function),
            expect.any(Function),
            expect.objectContaining({
                label: 'Owner',
                ownerName: 'Owner',
                phoneNumber: '919999999999',
                skipLimitCheck: true,
            }),
        );
        expect(appendEventSpy).toHaveBeenCalledWith(
            'tenant-1',
            'Owner',
            'heartbeat_restart_disconnected',
            expect.stringContaining('restarting a disconnected WhatsApp session'),
            expect.objectContaining({
                previousStatus: 'disconnected',
            }),
        );
    });

    it('soft-restarts a connected but stalled WhatsApp session during heartbeat', async () => {
        const service = new WhatsAppHealthService();
        const appendEventSpy = vi.spyOn(service, 'appendEvent').mockResolvedValue(undefined);
        const now = Date.now();

        sessionManager.getAllSessions.mockReturnValue([
            {
                tenantId: 'tenant-1',
                label: 'Owner',
                status: 'connected',
                ownerName: 'Owner',
                phoneNumber: '919999999999',
                reconnectAttempts: 0,
                isReconnecting: false,
            },
        ]);

        dbNot
            .mockResolvedValueOnce({
                data: [
                    {
                        tenant_id: 'tenant-1',
                        label: 'Owner',
                        status: 'connected',
                        owner_name: 'Owner',
                        session_data: {
                            phoneNumber: '919999999999',
                        },
                        creds: { key: 'creds' },
                        keys: { key: 'keys' },
                        updated_at: new Date(now - 60_000).toISOString(),
                    },
                ],
                error: null,
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        tenant_id: 'tenant-1',
                        session_label: 'Owner',
                        group_count: 316,
                        active_groups_24h: 254,
                        last_inbound_message_at: new Date(now - 7 * 60 * 60_000).toISOString(),
                    },
                ],
                error: null,
            });

        await (service as any).runHeartbeatSweep(sessionManager);

        expect(sessionManager.forceReconnect).toHaveBeenCalledWith('tenant-1', 'Owner');
        expect(sessionManager.createSession).not.toHaveBeenCalled();
        expect(appendEventSpy).toHaveBeenCalledWith(
            'tenant-1',
            'Owner',
            'ingestion_stalled',
            expect.stringContaining('No inbound WhatsApp messages have landed'),
            expect.objectContaining({
                liveStatus: 'connected',
                groupCount: 316,
                activeGroups24h: 254,
            }),
        );
        expect(appendEventSpy).toHaveBeenCalledWith(
            'tenant-1',
            'Owner',
            'heartbeat_restart_stalled_connected',
            expect.stringContaining('connected but stalled WhatsApp session'),
            expect.objectContaining({
                liveStatus: 'connected',
                groupCount: 316,
                activeGroups24h: 254,
            }),
        );
        expect(sessionDataUpdate).toHaveBeenCalled();
    });

    it('does not resend the same stalled-ingestion push for the same persisted alert signature', async () => {
        const service = new WhatsAppHealthService();
        const nowIso = new Date(Date.now() - 7 * 60 * 60_000).toISOString();

        sessionDataMaybeSingle.mockResolvedValue({
            data: {
                session_data: {
                    lastIngestionStallAlertSignature: `${nowIso}|replaced|blocked`,
                    lastIngestionStallAlertDelivery: 'sent',
                },
            },
            error: null,
        });

        await (service as any).sendIngestionStalledPush({
            tenantId: 'tenant-1',
            sessionLabel: 'Owner',
            phoneNumber: '919999999999',
            disconnectReason: 'replaced',
            autoReconnectBlocked: true,
            activeGroups24h: 254,
            groupCount: 316,
            lastInboundAgeMs: 7 * 60 * 60_000,
            lastInboundAt: nowIso,
        });

        expect(sessionDataUpdate).not.toHaveBeenCalled();
    });
});
