import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppClient } from '../src/whatsapp/WhatsAppClient';
import { supabase } from '../src/config/supabase';

vi.mock('../src/config/supabase', () => ({
    supabase: {
        from: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'profile-1' }, error: null }),
        update: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
}));

describe('WhatsAppClient', () => {
    let client: WhatsAppClient;
    const options = {
        tenantId: 'tenant-123',
        onQR: vi.fn(),
        onConnectionUpdate: vi.fn(),
        label: 'Owner'
    };

    beforeEach(() => {
        vi.clearAllMocks();
        client = new WhatsAppClient(options);
    });

    it('should throw error for invalid tenantId', () => {
        expect(() => new WhatsAppClient({ ...options, tenantId: 'Invalid-ID!' })).toThrow('Invalid tenantId format');
    });

    it('should correctly set session path', () => {
        // Accessing private property for verification
        expect((client as any).sessionPath).toContain(`sessions\\${options.tenantId}_${options.label}`);
    });

    it('should handle verification "YES" response', async () => {
        const remoteJid = '919876543210@s.whatsapp.net';
        const text = 'YES';

        // Mock profile find
        (supabase.single as any).mockResolvedValueOnce({ data: { id: 'profile-1' }, error: null });

        await (client as any).handleIncomingMessage(remoteJid, text);

        expect(supabase.from).toHaveBeenCalledWith('profiles');
        expect(supabase.update).toHaveBeenCalledWith(expect.objectContaining({ phone_verified: true }));
    });

    it('should filter out short messages', async () => {
        const remoteJid = '123@s.whatsapp.net';
        const text = 'Hi';
        
        const triggerAgentSpy = vi.spyOn(client as any, 'triggerAgent');
        await (client as any).handleIncomingMessage(remoteJid, text);
        
        expect(triggerAgentSpy).not.toHaveBeenCalled();
    });

    it('should filter out emoji-only messages', async () => {
        const remoteJid = '123@s.whatsapp.net';
        const text = '🚀🔥😊';
        
        const triggerAgentSpy = vi.spyOn(client as any, 'triggerAgent');
        await (client as any).handleIncomingMessage(remoteJid, text);
        
        expect(triggerAgentSpy).not.toHaveBeenCalled();
    });

    it('should trigger agent for valid messages', async () => {
        const remoteJid = '123@s.whatsapp.net';
        const text = 'I am looking for a 3BHK in Mumbai with a budget of 2Cr';
        
        const triggerAgentSpy = vi.spyOn(client as any, 'triggerAgent').mockResolvedValue(undefined);
        await (client as any).handleIncomingMessage(remoteJid, text);
        
        expect(triggerAgentSpy).toHaveBeenCalledWith(remoteJid, text);
    });
});
