import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectWhatsApp, disconnectWhatsApp, getProfile, saveProfile } from '../src/controllers/whatsappController';

const { mockDb } = vi.hoisted(() => ({
    mockDb: {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
        upsert: vi.fn(),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
}));

const { sendWhatsAppLifecycleEmail } = vi.hoisted(() => ({
    sendWhatsAppLifecycleEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/config/supabase', () => ({
    supabase: mockDb,
    supabaseAdmin: mockDb,
}));

vi.mock('../src/whatsapp/SessionManager', () => ({
    sessionManager: {
        getSession: vi.fn(),
        createSession: vi.fn().mockResolvedValue(undefined),
        getQR: vi.fn(),
        removeSession: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('../src/services/subscriptionService', () => ({
    subscriptionService: {},
}));

vi.mock('../src/services/workspaceActivityService', () => ({
    workspaceActivityService: {
        track: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('../src/whatsapp/propaiRuntimeHooks', () => ({
    sendWhatsAppLifecycleEmail,
}));

function createResponse() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

describe('whatsappController profile endpoints', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns a null profile when no broker profile exists yet', async () => {
        const req = {
            user: { id: 'user-1' },
        } as any;
        const res = createResponse();

        mockDb.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

        await getProfile(req, res as any);

        expect(mockDb.from).toHaveBeenCalledWith('profiles');
        expect(mockDb.eq).toHaveBeenCalledWith('id', 'user-1');
        expect(res.json).toHaveBeenCalledWith({ profile: null });
    });

    it('upserts broker details for the authenticated user', async () => {
        const req = {
            body: {
                fullName: ' Vishal ',
                phone: '+91 98200 56180',
            },
            user: {
                id: 'user-1',
                email: 'vishal@example.com',
            },
        } as any;
        const res = createResponse();

        mockDb.upsert.mockResolvedValueOnce({ error: null });
        mockDb.maybeSingle.mockResolvedValueOnce({
            data: {
                id: 'user-1',
                full_name: 'Vishal',
                phone: '919820056180',
                email: 'vishal@example.com',
                phone_verified: false,
            },
            error: null,
        });

        await saveProfile(req, res as any);

        expect(mockDb.upsert).toHaveBeenCalledWith(
            {
                id: 'user-1',
                full_name: 'Vishal',
                phone: '919820056180',
                email: 'vishal@example.com',
            },
            { onConflict: 'id' }
        );
        expect(res.json).toHaveBeenCalledWith({
            profile: {
                id: 'user-1',
                fullName: 'Vishal',
                phone: '919820056180',
                email: 'vishal@example.com',
                phoneVerified: false,
                appRole: 'broker',
            },
        });
    });

    it('starts a QR-based WhatsApp connection by default', async () => {
        const req = {
            body: {
                phoneNumber: '919820056180',
                ownerName: 'Vishal',
            },
            user: {
                id: 'user-1',
                email: 'vishal@example.com',
            },
        } as any;
        const res = createResponse();

        mockDb.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
        mockDb.upsert.mockResolvedValueOnce({ error: null });
        const sessionManager = await import('../src/whatsapp/SessionManager');
        (sessionManager.sessionManager.getSession as any).mockResolvedValueOnce(undefined);
        (sessionManager.sessionManager.getQR as any).mockReturnValueOnce('qr-payload');

        await connectWhatsApp(req, res as any);

        expect(sessionManager.sessionManager.createSession).toHaveBeenCalledWith(
            'user-1',
            expect.any(Function),
            expect.any(Function),
            expect.objectContaining({
                phoneNumber: '919820056180',
                ownerName: 'Vishal',
                label: 'vishal-919820056180',
            })
        );
        expect(res.json).toHaveBeenCalledWith({
            message: 'Connection initiated',
            label: 'vishal-919820056180',
            qr: 'qr-payload',
            pairingCode: null,
            mode: 'qr',
        });
    });

    it('returns a pairing code when the fallback mode is requested', async () => {
        const req = {
            body: {
                phoneNumber: '919820056180',
                ownerName: 'Vishal',
                connectMethod: 'pairing',
            },
            user: {
                id: 'user-1',
                email: 'vishal@example.com',
            },
        } as any;
        const res = createResponse();

        mockDb.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
        mockDb.upsert.mockResolvedValueOnce({ error: null });
        const sessionManager = await import('../src/whatsapp/SessionManager');
        (sessionManager.sessionManager.getSession as any).mockResolvedValueOnce(undefined);
        (sessionManager.sessionManager.getQR as any).mockReturnValueOnce('PAIR-1234');

        await connectWhatsApp(req, res as any);

        expect(sessionManager.sessionManager.createSession).toHaveBeenCalledWith(
            'user-1',
            expect.any(Function),
            expect.any(Function),
            expect.objectContaining({
                phoneNumber: '919820056180',
                ownerName: 'Vishal',
                label: 'vishal-919820056180',
                usePairingCode: '919820056180',
            })
        );
        expect(res.json).toHaveBeenCalledWith({
            message: 'Connection initiated',
            label: 'vishal-919820056180',
            qr: null,
            pairingCode: 'PAIR-1234',
            mode: 'pairing',
        });
    });

    it('returns the normalized payload even if the read-after-write returns no row', async () => {
        const req = {
            body: {
                fullName: ' Vishal ',
                phone: '+91 98200 56180',
            },
            user: {
                id: 'user-1',
                email: 'vishal@example.com',
            },
        } as any;
        const res = createResponse();

        mockDb.upsert.mockResolvedValueOnce({ error: null });
        mockDb.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

        await saveProfile(req, res as any);

        expect(res.json).toHaveBeenCalledWith({
            profile: {
                id: 'user-1',
                fullName: 'Vishal',
                phone: '919820056180',
                email: 'vishal@example.com',
                phoneVerified: false,
                appRole: 'broker',
            },
        });
    });

    it('sends a lifecycle email when a WhatsApp session is disconnected', async () => {
        const req = {
            body: {
                label: 'owner-device',
            },
            user: {
                id: 'user-1',
                email: 'vishal@example.com',
                full_name: 'Vishal',
            },
        } as any;
        const res = createResponse();

        mockDb.maybeSingle
            .mockResolvedValueOnce({
                data: {
                    label: 'owner-device',
                    session_data: { phoneNumber: '919820056180' },
                    owner_name: 'Vishal',
                },
                error: null,
            })
            .mockResolvedValueOnce({ data: null, error: null });

        await disconnectWhatsApp(req, res as any);

        expect(sendWhatsAppLifecycleEmail).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'user-1',
            label: 'owner-device',
            status: 'disconnected',
            phoneNumber: '919820056180',
            fallbackEmail: 'vishal@example.com',
            fallbackFullName: 'Vishal',
        }));
        expect(res.json).toHaveBeenCalledWith({ message: 'Disconnected successfully' });
    });
});
