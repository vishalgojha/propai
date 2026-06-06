import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/supabase', () => ({
    supabase: {},
    supabaseAdmin: {},
}));

import { SessionManager } from '../src/whatsapp/SessionManager';

describe('SessionManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('preserves the stored callbacks when force-reconnecting a session', async () => {
        const manager = new SessionManager();
        const fakeClient = {
            restartTransport: vi.fn().mockResolvedValue(undefined),
            getStatusSnapshot: vi.fn(() => ({
                label: 'session-1',
                status: 'connecting',
                ownerName: 'Owner',
                phoneNumber: '919773757759',
            })),
        };
        const onQR = vi.fn();
        const onConnectionUpdate = vi.fn();

        (manager as any).storage = {
            loadPersistedSessions: vi.fn().mockResolvedValue([
                {
                    tenantId: 'tenant-1',
                    label: 'session-1',
                    ownerName: 'Owner',
                    phoneNumber: '919773757759',
                },
            ]),
        };

        (manager as any).clients.set('tenant-1:session-1', fakeClient);
        (manager as any).callbacks.set('tenant-1:session-1', { onQR, onConnectionUpdate });

        const createSessionSpy = vi.spyOn(manager as any, 'createSession').mockResolvedValue(undefined);

        await manager.forceReconnect('tenant-1', 'session-1');

        expect(fakeClient.restartTransport).toHaveBeenCalledWith({
            phoneNumber: '919773757759',
        });
        expect(createSessionSpy).not.toHaveBeenCalled();
        expect((manager as any).callbacks.get('tenant-1:session-1')).toEqual({
            onQR,
            onConnectionUpdate,
        });
    });
});
