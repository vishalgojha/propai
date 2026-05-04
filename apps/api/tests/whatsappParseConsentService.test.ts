import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock('../src/config/supabase', () => ({
    supabase: {},
}));

import { classifyWhatsAppGroupCategory } from '../src/services/whatsappParseConsentService';

describe('classifyWhatsAppGroupCategory', () => {
    it('classifies real estate groups from market keywords', () => {
        expect(classifyWhatsAppGroupCategory('Bandra Property Brokers')).toBe('real_estate');
        expect(classifyWhatsAppGroupCategory('Powai Rent Inventory')).toBe('real_estate');
    });

    it('classifies family groups from relationship keywords', () => {
        expect(classifyWhatsAppGroupCategory('Sharma Family')).toBe('family');
    });

    it('classifies work groups from company keywords', () => {
        expect(classifyWhatsAppGroupCategory('Acme Sales Team')).toBe('work');
    });

    it('falls back to other when no heuristic matches', () => {
        expect(classifyWhatsAppGroupCategory('Weekend Cricket')).toBe('other');
        expect(classifyWhatsAppGroupCategory('')).toBe('other');
    });
});
