import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionService } from '../src/services/subscriptionService';
import { supabase } from '../src/config/supabase';

vi.mock('../src/config/supabase', () => ({
    supabase: {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnThis(),
    },
    supabaseAdmin: null,
}));

vi.mock('../src/services/referralService', () => ({
    referralService: {
        qualifyPaidReferral: vi.fn().mockResolvedValue(null),
    },
}));

describe('SubscriptionService', () => {
    let service: SubscriptionService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new SubscriptionService();
    });

    it('should return correct limit for Trial plan', () => {
        expect(service.getLimit('Free', 'sessions')).toBe(2);
        expect(service.getLimit('Trial', 'sessions')).toBe(2);
        expect(service.getLimit('Free', 'leads')).toBe(50);
    });

    it('should return correct limit for Solo plan', () => {
        expect(service.getLimit('Pro', 'sessions')).toBe(2);
        expect(service.getLimit('Solo', 'sessions')).toBe(2);
        expect(service.getLimit('Pro', 'leads')).toBe(Infinity);
    });

    it('should fetch subscription from Supabase', async () => {
        (supabase.maybeSingle as any).mockResolvedValueOnce({
            data: { plan: 'Pro', status: 'active' },
            error: null 
        });

        const sub = await service.getSubscription('tenant-123');
        expect(sub.plan).toBe('Solo');
        expect(supabase.from).toHaveBeenCalledWith('subscriptions');
    });

    it('should upgrade plan in Supabase', async () => {
        (supabase.upsert as any).mockResolvedValueOnce({ error: null });
        await service.upgradePlan('tenant-123', 'Solo');
        expect(supabase.upsert).toHaveBeenCalledWith(expect.objectContaining({
            plan: 'Solo'
        }));
    });

    it('should cancel subscription in Supabase', async () => {
        (supabase.eq as any).mockResolvedValueOnce({ error: null });
        await service.cancelSubscription('tenant-123');
        expect(supabase.update).toHaveBeenCalledWith(expect.objectContaining({
            status: 'cancelled'
        }));
    });
});
