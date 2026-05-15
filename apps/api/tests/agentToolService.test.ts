import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    getSessions,
    listGroups,
    sendMessage,
} = vi.hoisted(() => ({
    getSessions: vi.fn(),
    listGroups: vi.fn(),
    sendMessage: vi.fn(),
}));

const mockGateway = {
    getSessions,
    listGroups,
    sendMessage,
};

const insert = vi.fn();

vi.mock('../src/channel-gateways/whatsapp/whatsappGatewayRegistry', () => ({
    getWhatsAppGateway: vi.fn(() => mockGateway),
}));

vi.mock('../src/config/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            insert,
        })),
    },
    supabaseAdmin: {
        from: vi.fn(() => ({
            insert,
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                })),
            })),
        })),
    },
}));

import { agentToolService } from '../src/services/agentToolService';

describe('AgentToolService transport boundary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('loads whatsapp groups through the gateway', async () => {
        getSessions.mockResolvedValue([{ label: 'owner-device', status: 'connected' }]);
        listGroups.mockResolvedValue([{ id: '120@g.us', name: 'Main Group', participantsCount: 12 }]);

        const result = await agentToolService.executeTool('get_whatsapp_groups', {}, {
            tenantId: 'tenant-1',
            remoteJid: '919999999999@s.whatsapp.net',
            promptText: 'show groups',
        });

        expect(getSessions).toHaveBeenCalledWith('tenant-1');
        expect(listGroups).toHaveBeenCalledWith({
            workspaceOwnerId: 'tenant-1',
            sessionLabel: 'owner-device',
        });
        expect(result).toEqual({
            count: 1,
            groups: [{ id: '120@g.us', name: 'Main Group', participantsCount: 12 }],
        });
    });

    it('sends whatsapp messages through the gateway and persists the message row', async () => {
        sendMessage.mockResolvedValue(undefined);
        insert.mockResolvedValue({ error: null });

        const result = await agentToolService.executeTool('send_whatsapp_message', {
            text: 'Hello there',
        }, {
            tenantId: 'tenant-1',
            remoteJid: '919999999999@s.whatsapp.net',
            promptText: 'say hello',
        });

        expect(sendMessage).toHaveBeenCalledWith({
            workspaceOwnerId: 'tenant-1',
            remoteJid: '919999999999@s.whatsapp.net',
            text: 'Hello there',
        });
        expect(result).toEqual({ success: true });
    });
});
