import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMessages } from '../src/controllers/whatsappController';

const messagesRows = [
    { id: 'm1', remote_jid: '1203630@g.us', text: 'Group one' },
    { id: 'm2', remote_jid: '1203631@g.us', text: 'Group two' },
    { id: 'm3', remote_jid: '919999999999@s.whatsapp.net', text: 'Direct hello' },
];

const { mockDb } = vi.hoisted(() => ({
    mockDb: {
        from: vi.fn((table: string) => {
            if (table === 'messages') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            order: vi.fn().mockResolvedValue({ data: messagesRows, error: null }),
                        }),
                    }),
                };
            }

            if (table === 'whatsapp_groups') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                eq: vi.fn().mockResolvedValue({
                                    data: [{ group_jid: '1203630@g.us' }],
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }

            throw new Error(`Unexpected table: ${table}`);
        }),
    },
}));

vi.mock('../src/config/supabase', () => ({
    supabase: mockDb,
    supabaseAdmin: mockDb,
}));

vi.mock('../src/channel-gateways/whatsapp/whatsappGatewayRegistry', () => ({
    getWhatsAppGateway: vi.fn(),
}));

vi.mock('../src/services/subscriptionService', () => ({
    subscriptionService: {},
}));

vi.mock('../src/services/whatsappHealthService', () => ({
    whatsappHealthService: {},
}));

vi.mock('../src/services/whatsappGroupService', () => ({
    whatsappGroupService: {},
}));

vi.mock('../src/services/workspaceAccessService', () => ({
    workspaceAccessService: {
        resolveContext: vi.fn().mockResolvedValue({
            workspaceOwnerId: 'tenant-1',
            memberRole: 'owner',
            canManageTeam: true,
            canSendOutbound: true,
        }),
    },
}));

vi.mock('../src/services/workspaceActivityService', () => ({
    workspaceActivityService: {
        track: vi.fn(),
    },
}));

vi.mock('../src/whatsapp/propaiRuntimeHooks', () => ({
    sendWhatsAppLifecycleEmail: vi.fn(),
}));

vi.mock('../src/services/identityService', () => ({
    pushRecentAction: vi.fn(),
}));

vi.mock('../src/services/sessionEventService', () => ({
    sessionEventService: {},
}));

vi.mock('../src/services/emailNotificationService', () => ({
    emailNotificationService: {},
}));

function createResponse() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

describe('getMessages', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('filters group messages to the selected session while keeping direct chats', async () => {
        const req = {
            user: { id: 'tenant-1' },
            query: { sessionLabel: 'main-phone' },
        } as any;
        const res = createResponse();

        await getMessages(req, res as any);

        expect(res.json).toHaveBeenCalledWith([
            { id: 'm1', remote_jid: '1203630@g.us', text: 'Group one' },
            { id: 'm3', remote_jid: '919999999999@s.whatsapp.net', text: 'Direct hello' },
        ]);
    });
});
