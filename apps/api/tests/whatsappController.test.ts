import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectWhatsApp, disconnectWhatsApp, getProfile, getQR, saveProfile } from '../src/controllers/whatsappController';

const { mockDb } = vi.hoisted(() => ({
    mockDb: {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
        upsert: vi.fn(),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
}));

const { sendWhatsAppLifecycleEmail } = vi.hoisted(() => ({
    sendWhatsAppLifecycleEmail: vi.fn().mockResolvedValue(undefined),
}));

const {
    connect,
    disconnect,
    getQRCode,
    getSessions,
    getStatus,
    forceReconnect,
    listGroups,
    broadcastToGroups,
    sendMessage,
} = vi.hoisted(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    getQRCode: vi.fn(),
    getSessions: vi.fn().mockResolvedValue([]),
    getStatus: vi.fn().mockResolvedValue(null),
    forceReconnect: vi.fn(),
    listGroups: vi.fn(),
    broadcastToGroups: vi.fn(),
    sendMessage: vi.fn(),
}));

vi.mock('../src/config/supabase', () => ({
    supabase: mockDb,
    supabaseAdmin: mockDb,
}));

vi.mock('../src/channel-gateways/whatsapp/whatsappGatewayRegistry', () => ({
    getWhatsAppGateway: vi.fn(() => ({
        connect,
        disconnect,
        getQRCode,
        getSessions,
        getStatus,
        forceReconnect,
        listGroups,
        broadcastToGroups,
        sendMessage,
    })),
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
        getSessions.mockResolvedValue([]);
        getStatus.mockResolvedValue(null);
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
        connect.mockResolvedValueOnce({ artifact: { mode: 'qr', format: 'text', value: 'qr-payload' }, mode: 'qr' });
        getQRCode.mockResolvedValueOnce('qr-payload').mockResolvedValueOnce('qr-payload');

        await connectWhatsApp(req, res as any);

        expect(connect).toHaveBeenCalledWith(expect.objectContaining({
            workspaceOwnerId: 'user-1',
            phoneNumber: '919820056180',
            ownerName: 'Vishal',
            sessionLabel: 'vishal-919820056180',
            mode: 'qr',
        }));
        expect(res.json).toHaveBeenCalledWith({
            message: 'Connection initiated',
            label: 'vishal-919820056180',
            artifact: {
                mode: 'qr',
                format: 'text',
                value: 'qr-payload',
            },
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
        connect.mockResolvedValueOnce({ artifact: { mode: 'pairing', format: 'text', value: 'PAIR-1234' }, mode: 'pairing' });
        getQRCode.mockResolvedValueOnce('PAIR-1234').mockResolvedValueOnce('PAIR-1234');

        await connectWhatsApp(req, res as any);

        expect(connect).toHaveBeenCalledWith(expect.objectContaining({
            workspaceOwnerId: 'user-1',
            phoneNumber: '919820056180',
            ownerName: 'Vishal',
            sessionLabel: 'vishal-919820056180',
            mode: 'pairing',
        }));
        expect(res.json).toHaveBeenCalledWith({
            message: 'Connection initiated',
            label: 'vishal-919820056180',
            artifact: {
                mode: 'pairing',
                format: 'text',
                value: 'PAIR-1234',
            },
            qr: null,
            pairingCode: 'PAIR-1234',
            mode: 'pairing',
        });
    });

    it('returns a typed QR artifact from the QR polling endpoint', async () => {
        const req = {
            query: {
                label: 'vishal-919820056180',
            },
            user: {
                id: 'user-1',
            },
        } as any;
        const res = createResponse();

        getQRCode.mockResolvedValueOnce('qr-payload');

        await getQR(req, res as any);

        expect(res.json).toHaveBeenCalledWith({
            qr: 'qr-payload',
            artifact: {
                mode: 'qr',
                format: 'text',
                value: 'qr-payload',
            },
            label: 'vishal-919820056180',
            ready: true,
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
