import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentExecutor } from '../src/services/AgentExecutor';
import { aiService } from '../src/services/aiService';
import { supabase } from '../src/config/supabase';
import { conversationEngineService } from '../src/services/conversationEngineService';

const { getSessions, listGroups } = vi.hoisted(() => ({
    getSessions: vi.fn(),
    listGroups: vi.fn(),
}));

vi.mock('../src/services/aiService');
vi.mock('../src/services/conversationEngineService', () => ({
    conversationEngineService: {
        process: vi.fn(),
    },
}));
vi.mock('../src/channel-gateways/whatsapp/whatsappGatewayRegistry', () => ({
    getWhatsAppGateway: vi.fn(() => ({
        getSessions,
        listGroups,
    })),
}));

vi.mock('../src/config/supabase', () => {
    const mockSupabase = {
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
    };
    return {
        supabase: mockSupabase,
        supabaseAdmin: null,
        serverClientOptions: {},
    };
});

describe('AgentExecutor', () => {
    let executor: AgentExecutor;

    beforeEach(() => {
        vi.clearAllMocks();
        executor = new AgentExecutor();
        getSessions.mockResolvedValue([]);
        listGroups.mockResolvedValue([]);
    });

    it('should return direct response when no tool is called', async () => {
        (conversationEngineService.process as any).mockResolvedValueOnce({ reply: 'Hello! How can I help you today?' });
        (supabase.maybeSingle as any).mockResolvedValueOnce({ data: null, error: null });

        const response = await executor.processMessage('tenant-1', 'jid-1', 'Hi');

        expect(response).toBe('Hello! How can I help you today?');
        expect(conversationEngineService.process).toHaveBeenCalledTimes(1);
    });


    it('should route broker WhatsApp traffic through the shared conversation engine', async () => {
        (conversationEngineService.process as any).mockResolvedValueOnce({ reply: 'I found 2 groups for you.' });
        (supabase.maybeSingle as any).mockResolvedValueOnce({ data: null, error: null });

        const response = await executor.processMessage('tenant-1', 'jid-1', 'What groups do I have?');

        expect(response).toBe('I found 2 groups for you.');
        expect(conversationEngineService.process).toHaveBeenCalledWith(expect.objectContaining({
            event: expect.objectContaining({
                channel: 'whatsapp',
                tenantId: 'tenant-1',
                content: expect.objectContaining({ text: 'What groups do I have?' }),
            }),
            profileLookupTenantId: 'tenant-1',
        }));
    });

    it('should keep assistant-mode tool loop behavior for non-broker paths', async () => {
        (aiService.chat as any).mockResolvedValueOnce({ text: 'TOOL: get_groups {}' });
        (aiService.chat as any).mockResolvedValueOnce({ text: 'I found 2 groups for you.' });
        (conversationEngineService.process as any).mockReset();
        listGroups.mockResolvedValueOnce([]);
        vi.spyOn(executor as any, 'getSessionPhoneNumber').mockResolvedValue('7021045254');
        vi.spyOn(executor as any, 'resolveBrokerWorkspaceBySender').mockResolvedValue({
            isBroker: false,
            verified: false,
        });
        vi.spyOn(executor as any, 'detectsBrokerIntent').mockResolvedValue(false);

        const response = await executor.processMessage('tenant-1', 'jid-1', 'What groups do I have?');

        expect(response).toContain('still settling in');
        expect(aiService.chat).toHaveBeenCalledTimes(1);
        expect(getSessions).toHaveBeenCalledWith('tenant-1');
        expect(listGroups).not.toHaveBeenCalled();
        expect(conversationEngineService.process).not.toHaveBeenCalled();
    });

    it('should correctly parse tool calls', async () => {
        const toolCall = (executor as any).parseToolCall('Please use TOOL: send_message {"remote_jid": "123", "text": "Hello"}');
        expect(toolCall).toEqual({ name: 'send_message', args: { remote_jid: '123', text: 'Hello' } });

        const noTool = (executor as any).parseToolCall('Just a normal message');
        expect(noTool).toBeNull();
    });

    it('should handle tool execution errors gracefully', async () => {
        (conversationEngineService.process as any).mockResolvedValueOnce(undefined);
        (supabase.maybeSingle as any).mockResolvedValueOnce({ data: null, error: null });

        const response = await executor.processMessage('tenant-1', 'jid-1', 'Do something weird');

        expect(response).toContain('Something went wrong on my end');
    });
});
