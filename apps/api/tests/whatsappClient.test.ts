import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppClient } from '../src/whatsapp/WhatsAppClient';

vi.mock('../src/whatsapp/SupabaseAuthState', () => ({
    createSupabaseAuthState: vi.fn(),
}));

vi.mock('../src/services/sessionEventService', () => ({
    sessionEventService: {
        log: vi.fn(),
    },
}));

vi.mock('../src/services/whatsappGroupService', () => ({
    whatsappGroupService: {
        syncGroups: vi.fn(),
    },
}));

vi.mock('../src/config/supabase', () => ({
    supabase: {
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    supabaseAdmin: null,
}));

function createClient() {
    return new WhatsAppClient({
        tenantId: 'tenant-123',
        label: 'Owner',
        ownerName: 'Owner',
        storage: {
            saveInboundMessage: vi.fn(),
            saveSessionStatus: vi.fn(),
            deleteSession: vi.fn(),
        },
    });
}

describe('WhatsAppClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sanitizes outgoing messages before sending', async () => {
        const client = createClient();
        const sendMessage = vi.fn().mockResolvedValue(undefined);
        (client as any).socket = { sendMessage };

        await client.sendMessage('120@g.us', '**Hello**');

        expect(sendMessage).toHaveBeenCalledWith('120@g.us', { text: '*Hello*' });
    });

    it('returns reconnect metadata in the status snapshot', () => {
        const client = createClient();
        (client as any).connectionStatus = 'connecting';
        (client as any).reconnectAttempts = 2;

        expect(client.getStatusSnapshot()).toMatchObject({
            status: 'connecting',
            reconnectAttempts: 2,
            isReconnecting: true,
        });
    });

    it('stores the workspace sender jid for outbound messages from self', () => {
        const client = createClient();
        (client as any).connectedPhoneNumber = '919999999999';

        const sender = (client as any).resolveStoredSender({
            key: { fromMe: true },
        });

        expect(sender).toBe('919999999999@s.whatsapp.net');
    });

    it('converts unix message timestamps into ISO strings', () => {
        const client = createClient();

        const timestamp = (client as any).resolveMessageTimestamp({
            messageTimestamp: 1710000000,
        });

        expect(timestamp).toBe(new Date(1710000000 * 1000).toISOString());
    });
});
