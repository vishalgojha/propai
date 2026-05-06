import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agentExecutor } from '../src/services/AgentExecutor';
import { aiService } from '../src/services/aiService';
import { sessionManager } from '../src/whatsapp/SessionManager';
import { supabase } from '../src/config/supabase';

vi.mock('../src/services/aiService');
vi.mock('../src/whatsapp/SessionManager', () => ({
    sessionManager: {
        getSession: vi.fn(),
    }
}));

vi.mock('../src/config/supabase', () => ({
    supabase: {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
}));

describe('Integration: Tool-use Loop', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle a full flow: Intent -> Tool (get_groups) -> Final Response', async () => {
        const tenantId = 'tenant-123';
        const remoteJid = '123456789@s.whatsapp.net';
        const userMessage = 'Which groups am I connected to?';

        (supabase.limit as any).mockResolvedValueOnce({ data: [] });

        (aiService.chat as any).mockResolvedValueOnce({ 
            text: 'TOOL: get_groups {}' 
        });

        (sessionManager.getSession as any).mockResolvedValueOnce({
            getGroups: vi.fn().mockResolvedValue([
                { id: 'group1', name: 'Bandra Apartments' },
                { id: 'group2', name: 'Juhu Villas' }
            ])
        });

        (aiService.chat as any).mockResolvedValueOnce({ 
            text: 'You are connected to two groups: Bandra Apartments and Juhu Villas.' 
        });

        const response = await agentExecutor.processMessage(tenantId, remoteJid, userMessage);

        expect(response).toBe('You are connected to two groups: Bandra Apartments and Juhu Villas.');
        expect(aiService.chat).toHaveBeenCalledTimes(2);
    });

    it('should handle a flow: Intent -> Tool (parse_listing) -> Tool (save_listing) -> Final Response', async () => {
        const tenantId = 'tenant-123';
        const remoteJid = '123456789@s.whatsapp.net';
        const userMessage = 'Save this: 2BHK in Andheri, 1.2Cr, contact 9876543210';

        (supabase.limit as any).mockResolvedValueOnce({ data: [] });

        (aiService.chat as any).mockResolvedValueOnce({ 
            text: 'TOOL: parse_listing {"text": "2BHK in Andheri, 1.2Cr, contact 9876543210"}' 
        });

        (aiService.chat as any).mockResolvedValueOnce({ 
            text: JSON.stringify({ type: 'Apartment', BHK: 2, location: 'Andheri', price: '1.2Cr' }) 
        });

        (aiService.chat as any).mockResolvedValueOnce({ 
            text: 'TOOL: save_listing {"source_group_id": "owner", "listing_data": {"type": "Apartment", "BHK": 2, "location": "Andheri", "price": "1.2Cr"}, "raw_text": "2BHK in Andheri, 1.2Cr, contact 9876543210"}' 
        });

        (supabase.insert as any).mockResolvedValueOnce({ data: { id: 'list-1' }, error: null });

        (aiService.chat as any).mockResolvedValueOnce({ 
            text: 'I have successfully saved the 2BHK apartment in Andheri to your listings.' 
        });

        const response = await agentExecutor.processMessage(tenantId, remoteJid, userMessage);

        expect(response).toBe('I have successfully saved the 2BHK apartment in Andheri to your listings.');
        expect(aiService.chat).toHaveBeenCalledTimes(4);
    });
});
