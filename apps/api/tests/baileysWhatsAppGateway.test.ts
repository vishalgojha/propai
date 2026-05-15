import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaileysWhatsAppGateway } from '../src/channel-gateways/whatsapp/BaileysWhatsAppGateway';

const createSession = vi.fn();
const removeSession = vi.fn();
const getSession = vi.fn();
const getQR = vi.fn();
const forceReconnect = vi.fn();
const getLiveSessionSnapshots = vi.fn();

vi.mock('../src/whatsapp/SessionManager', () => ({
    sessionManager: {
        createSession,
        removeSession,
        getSession,
        getQR,
        forceReconnect,
        getLiveSessionSnapshots,
    },
}));

describe('BaileysWhatsAppGateway', () => {
    let gateway: BaileysWhatsAppGateway;

    beforeEach(() => {
        vi.clearAllMocks();
        gateway = new BaileysWhatsAppGateway();
    });

    it('connects by delegating to SessionManager and returns a QR artifact', async () => {
        createSession.mockResolvedValue(undefined);
        getQR.mockReturnValue('qr-code-value');

        const result = await gateway.connect({
            workspaceOwnerId: 'tenant-1',
            sessionLabel: 'owner-device',
            ownerName: 'Owner',
            phoneNumber: '919999999999',
            mode: 'qr',
        });

        expect(createSession).toHaveBeenCalledWith(
            'tenant-1',
            expect.any(Function),
            expect.any(Function),
            {
                label: 'owner-device',
                ownerName: 'Owner',
                phoneNumber: '919999999999',
                usePairingCode: undefined,
            },
        );
        expect(getQR).toHaveBeenCalledWith('tenant-1', 'owner-device');
        expect(result).toEqual({
            artifact: {
                mode: 'qr',
                format: 'text',
                value: 'qr-code-value',
            },
            mode: 'qr',
        });
    });

    it('sends messages through the active runtime client', async () => {
        const sendText = vi.fn().mockResolvedValue(undefined);
        getSession.mockResolvedValue({ sendText });

        await gateway.sendMessage({
            workspaceOwnerId: 'tenant-1',
            sessionLabel: 'owner-device',
            remoteJid: '919999999999@s.whatsapp.net',
            text: 'Hello',
        });

        expect(getSession).toHaveBeenCalledWith('tenant-1', 'owner-device');
        expect(sendText).toHaveBeenCalledWith('919999999999@s.whatsapp.net', 'Hello');
    });

    it('proxies QR lookup to SessionManager', async () => {
        getQR.mockReturnValue('pairing-code');

        await expect(gateway.getQRCode({
            workspaceOwnerId: 'tenant-1',
            sessionLabel: 'owner-device',
        })).resolves.toBe('pairing-code');
    });

    it('maps live session snapshots into gateway session records', async () => {
        getLiveSessionSnapshots.mockReturnValue([
            {
                label: 'owner-device',
                status: 'connected',
                phoneNumber: '919999999999',
                ownerName: 'Owner',
            },
        ]);

        await expect(gateway.getSessions('tenant-1')).resolves.toEqual([
            {
                label: 'owner-device',
                status: 'connected',
                phoneNumber: '919999999999',
                ownerName: 'Owner',
            },
        ]);
    });

    it('returns reconnect metadata from SessionManager', async () => {
        forceReconnect.mockResolvedValue({
            label: 'owner-device',
            message: 'Session recreated, QR regenerating...',
        });

        await expect(gateway.forceReconnect({
            workspaceOwnerId: 'tenant-1',
            sessionLabel: 'owner-device',
        })).resolves.toEqual({
            label: 'owner-device',
            message: 'Session recreated, QR regenerating...',
        });
    });
});
