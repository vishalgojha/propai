import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionService } from '../src/services/subscriptionService';
import { supabase } from '../config/supabase';

vi.mock('../config/supabase', () => ({
    supabase: {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
}));

describe('SubscriptionService', () => {
    let service: SubscriptionService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new SubscriptionService();
    });

    it('should return correct limit for Free plan', () => {
        expect(service.getLimit('Free', 'sessions')).toBe(1);
        expect(service.getLimit('Free', 'leads')).toBe(50);
    });

    it('should return correct limit for Pro plan', () => {
        expect(service.getLimit('Pro', 'sessions')).toBe(5);
        expect(service.getLimit('Pro', 'leads')).toBe(500);
    });

    it('should fetch subscription from Supabase', async () => {
        (supabase.single as any).mockResolvedValueOnce({ 
            data: { plan: 'Pro', status: 'active' }, 
            error: null 
        });

        const sub = await service.getSubscription('tenant-123');
        expect(sub.plan).toBe('Pro');
        expect(supabase.from).toHaveBeenCalledWith('subscriptions');
    });

    it('should upgrade plan in Supabase', async () => {
        (supabase.upsert as any).mockResolvedValueOnce({ error: null });
        await service.upgradePlan('tenant-123', 'Pro');
        expect(supabase.upsert).toHaveBeenCalledWith(expect.objectContaining({
            plan: 'Pro'
        }));
    });

    it('should cancel subscription in Supabase', async () => {
        (supabase.update as any).mockResolvedValueOnce({ error: null });
        await service.cancelSubscription('tenant-123');
        expect(supabase.update).toHaveBeenCalledWith(expect.objectContaining({
            status: 'cancelling'
        }));
    });
});
