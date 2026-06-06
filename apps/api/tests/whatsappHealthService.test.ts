import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppHealthService } from '../src/services/whatsappHealthService';

const { sessionManager, dbFrom, dbSelect, dbNot } = vi.hoisted(() => ({
    sessionManager: {
        getAllSessions: vi.fn(),
        createSession: vi.fn(),
        forceReconnect: vi.fn(),
        rehydratePersistedSessions: vi.fn(),
    },
    dbFrom: vi.fn(),
    dbSelect: vi.fn(),
    dbNot: vi.fn(),
}));

dbFrom.mockImplementation(() => ({
    select: dbSelect.mockReturnValue({
        not: dbNot,
    }),
}));

vi.mock('../src/config/supabase', () => ({
    supabase: {
        from: dbFrom,
    },
    supabaseAdmin: null,
}));

vi.mock('../src/channel-gateways/whatsapp/whatsappGatewayRegistry', () => ({
    getWhatsAppGateway: vi.fn(),
}));

describe('WhatsAppHealthService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        dbNot.mockResolvedValue({ data: [], error: null });
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
            'heartbeat_restart_stalled_connected',
            expect.stringContaining('connected but stalled WhatsApp session'),
            expect.objectContaining({
                liveStatus: 'connected',
                groupCount: 316,
                activeGroups24h: 254,
            }),
        );
    });
});
