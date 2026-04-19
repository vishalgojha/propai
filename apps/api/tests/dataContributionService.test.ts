import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataContributionService } from '../src/services/dataContributionService';
import { supabase } from '../src/config/supabase';

vi.mock('../src/config/supabase', () => ({
    supabase: {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
    }
}));


describe('DataContributionService', () => {
    let service: DataContributionService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new DataContributionService();
    });

    describe('anonymizeText', () => {
        it('should strip Indian phone numbers', async () => {
            const input = 'Call me at +91 9876543210 or 9123456789';
            const output = await service.anonymizeText(input);
            expect(output).toBe('Call me at [NUMBER] or [NUMBER]');
        });

        it('should strip contact names with titles', async () => {
            const input = 'Contact Mr. Rajesh Sharma or Dr. Anjali Gupta';
            const output = await service.anonymizeText(input);
            expect(output).toBe('Contact [CONTACT] or [CONTACT]');
        });

        it('should not strip generic text', async () => {
            const input = '3BHK Apartment in Mumbai for 1.5Cr';
            const output = await service.anonymizeText(input);
            expect(output).toBe(input);
        });
    });

    describe('exportAnonymizedDataset', () => {
        it('should return no_contributors if no one opted in', async () => {
            (supabase.eq as any).mockResolvedValueOnce({ data: [] });
            const result = await service.exportAnonymizedDataset();
            expect(result.status).toBe('no_contributors');
        });

        it('should return no_data if contributors exist but have no listings', async () => {
            (supabase.eq as any).mockResolvedValueOnce({ data: [{ tenant_id: 't1' }] });
            (supabase.in as any).mockResolvedValueOnce({ data: [] });
            const result = await service.exportAnonymizedDataset();
            expect(result.status).toBe('no_data');
        });

        it('should successfully process and "upload" anonymized listings', async () => {
            (supabase.eq as any).mockResolvedValueOnce({ data: [{ tenant_id: 't1' }] });
            (supabase.in as any).mockResolvedValueOnce({ 
                data: [
                    { 
                        raw_text: 'Contact Mr. Rajesh at +91 9876543210 for 2BHK in Bandra', 
                        structured_data: { type: 'Apartment', BHK: 2, location: 'Bandra' } 
                    }
                ] 
            });
            
            const result = await service.exportAnonymizedDataset();
            expect(result.success).toBe(true);
            expect(result.samples).toBe(1);
        });
    });

    describe('updateConsent', () => {
        it('should update consent in supabase', async () => {
            (supabase.upsert as any).mockResolvedValueOnce({ error: null });
            await service.updateConsent('t1', true);
            expect(supabase.from).toHaveBeenCalledWith('model_preferences');
            expect(supabase.upsert).toHaveBeenCalledWith(expect.objectContaining({
                tenant_id: 't1',
                contribute_data: true
            }));
        });
    });
});
