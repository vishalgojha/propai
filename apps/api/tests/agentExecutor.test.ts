import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentExecutor } from '../src/services/AgentExecutor';
import { aiService } from '../src/services/aiService';
import { sessionManager } from '../src/whatsapp/SessionManager';
import { supabase } from '../src/config/supabase';

vi.mock('../src/services/aiService');
vi.mock('../src/whatsapp/SessionManager', () => ({
    sessionManager: {
        getSession: vi.fn(),
    }
}));

vi.mock('../src/config/supabase', () => {
    const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    return {
        supabase: mockSupabase
    };
});

describe('AgentExecutor', () => {
    let executor: AgentExecutor;

    beforeEach(() => {
        vi.clearAllMocks();
        executor = new AgentExecutor();
    });

    it('should return direct response when no tool is called', async () => {
        (aiService.chat as any).mockResolvedValueOnce({ text: 'Hello! How can I help you today?' });
        
        // The chain is .from().select().eq().eq().order().limit()
        // We mock the final call in the chain.
        (supabase.limit as any).mockResolvedValueOnce({ data: [] });

        const response = await executor.processMessage('tenant-1', 'jid-1', 'Hi');

        expect(response).toBe('Hello! How can I help you today?');
        expect(aiService.chat).toHaveBeenCalledTimes(1);
    });


    it('should execute a tool and return the final response', async () => {
        (aiService.chat as any).mockResolvedValueOnce({ text: 'TOOL: get_groups {}' });
        (aiService.chat as any).mockResolvedValueOnce({ text: 'I found 2 groups for you.' });
        
        (supabase.limit as any).mockResolvedValueOnce({ data: [] });
        (sessionManager.getSession as any).mockResolvedValueOnce({
            getGroups: vi.fn().mockResolvedValue([{ id: 'g1', name: 'Group 1' }, { id: 'g2', name: 'Group 2' }])
        });

        const response = await executor.processMessage('tenant-1', 'jid-1', 'What groups do I have?');

        expect(response).toBe('I found 2 groups for you.');
        expect(aiService.chat).toHaveBeenCalledTimes(2);
        expect(sessionManager.getSession).toHaveBeenCalled();
    });

    it('should correctly parse tool calls', async () => {
        const toolCall = (executor as any).parseToolCall('Please use TOOL: send_message {"remote_jid": "123", "text": "Hello"}');
        expect(toolCall).toEqual({ name: 'send_message', args: { remote_jid: '123', text: 'Hello' } });

        const noTool = (executor as any).parseToolCall('Just a normal message');
        expect(noTool).toBeNull();
    });

    it('should transition lead qualification steps', async () => {
        // The problem is that .eq() is being called twice in updateLeadStep:
        // 1. Inside the .select().eq().single() chain
        // 2. Inside the .update().eq() chain
        
        // Since we are using mockReturnThis(), the first .eq() returns the mockSupabase object.
        // But if we use mockResolvedValueOnce, it returns a promise.
        
        // Let's mock .eq() to return the mock object, and only .single() to resolve.
        (supabase.eq as any).mockReturnThis();
        
        // Now we just need to handle the .update().eq() call which is the end of the chain.
        // Since .eq() now always returns the mock object, we can mock the mock object 
        // to be thenable, or just accept that it returns a mock object and the 
        // code expects a promise.
        
        // Actually, in AgentExecutor.ts:176:
        // const { error } = await supabase.from('leads').update(...).eq('id', leadId);
        // If .eq() returns the mockSupabase object, then 'await' will resolve it immediately.
        // To make it return { error: null }, we can make the mock object a promise.
        
        (supabase.single as any).mockResolvedValueOnce({ data: { current_step: 'budget' }, error: null });
        
        // To make the .update().eq() call return { error: null }, 
        // we can't use mockReturnThis() for that specific call.
        
        // Let's use mockImplementation.
        (supabase.eq as any).mockImplementation((col, val) => {
            if (col === 'id' && (supabase.update as any).mock.calls.length > 0) {
                return Promise.resolve({ error: null });
            }
            return supabase;
        });

        const res1 = await (executor as any).updateLeadStep('lead-1', { budget: '50L' });
        expect(res1.next_step).toBe('location');
    });

    it('should handle tool execution errors gracefully', async () => {
        (aiService.chat as any).mockResolvedValueOnce({ text: 'TOOL: non_existent_tool {}' });
        (aiService.chat as any).mockResolvedValueOnce({ text: 'Sorry, I couldnt do that.' });
        (supabase.limit as any).mockResolvedValueOnce({ data: [] });

        const response = await executor.processMessage('tenant-1', 'jid-1', 'Do something weird');

        expect(response).toBe('Sorry, I couldnt do that.');
    });



    it('should handle tool execution errors gracefully', async () => {
        (aiService.chat as any).mockResolvedValueOnce({ text: 'TOOL: non_existent_tool {}' });
        (aiService.chat as any).mockResolvedValueOnce({ text: 'Sorry, I couldnt do that.' });
        (supabase.limit as any).mockResolvedValueOnce({ data: [] });

        const response = await executor.processMessage('tenant-1', 'jid-1', 'Do something weird');

        expect(response).toBe('Sorry, I couldnt do that.');
    });
});
