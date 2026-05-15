import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agentExecutor } from '../src/services/AgentExecutor';
import { aiService } from '../src/services/aiService';
import { supabase } from '../src/config/supabase';
import { conversationEngineService } from '../src/services/conversationEngineService';

vi.mock('../src/services/aiService');
vi.mock('../src/services/conversationEngineService', () => ({
    conversationEngineService: {
        process: vi.fn(),
    },
}));
vi.mock('../src/channel-gateways/whatsapp/whatsappGatewayRegistry', () => ({
    getWhatsAppGateway: vi.fn(() => ({
        getSessions: vi.fn(),
        listGroups: vi.fn(),
    })),
}));

vi.mock('../src/config/supabase', () => ({
    supabase: {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    supabaseAdmin: null,
    serverClientOptions: {},
}));

describe('Integration: Tool-use Loop', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle a full flow: Intent -> Tool (get_groups) -> Final Response', async () => {
        const tenantId = 'tenant-123';
        const remoteJid = '123456789@s.whatsapp.net';
        const userMessage = 'Which groups am I connected to?';

        (conversationEngineService.process as any).mockResolvedValueOnce({
            reply: 'You are connected to two groups: Bandra Apartments and Juhu Villas.',
        });
        (supabase.maybeSingle as any).mockResolvedValueOnce({ data: null, error: null });

        const response = await agentExecutor.processMessage(tenantId, remoteJid, userMessage);

        expect(response).toBe('You are connected to two groups: Bandra Apartments and Juhu Villas.');
        expect(conversationEngineService.process).toHaveBeenCalledTimes(1);
    });

    it('should handle a flow: Intent -> Tool (parse_listing) -> Tool (save_listing) -> Final Response', async () => {
        const tenantId = 'tenant-123';
        const remoteJid = '123456789@s.whatsapp.net';
        const userMessage = 'Save this: 2BHK in Andheri, 1.2Cr, contact 9876543210';

        vi.spyOn(agentExecutor as any, 'getSessionPhoneNumber').mockResolvedValue('7021045254');
        vi.spyOn(agentExecutor as any, 'resolveBrokerWorkspaceBySender').mockResolvedValue({
            isBroker: false,
            verified: false,
        });
        vi.spyOn(agentExecutor as any, 'detectsBrokerIntent').mockResolvedValue(false);

        (aiService.chat as any).mockResolvedValueOnce({
            text: userMessage,
        });

        const response = await agentExecutor.processMessage(tenantId, remoteJid, userMessage);

        expect(response).toBe(userMessage);
        expect(aiService.chat).toHaveBeenCalledTimes(1);
        expect(conversationEngineService.process).not.toHaveBeenCalled();
    });
});
