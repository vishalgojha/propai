import { describe, expect, it } from 'vitest';
import { normalizeMumbaiLocation } from '../src/utils/locationNormalization';

describe('locationNormalization', () => {
    it('normalizes common locality variants', () => {
        expect(normalizeMumbaiLocation('bandra')).toEqual({
            location: 'Bandra West',
            pocket: null,
        });

        expect(normalizeMumbaiLocation('ville parle east')).toEqual({
            location: 'Vile Parle East',
            pocket: null,
        });
    });

    it('converts pocket names into canonical locality plus pocket', () => {
        expect(normalizeMumbaiLocation('Pali Hill')).toEqual({
            location: 'Bandra West',
            pocket: 'Pali Hill',
        });

        expect(normalizeMumbaiLocation('Carmichael Road')).toEqual({
            location: 'Cumballa Hill',
            pocket: 'Carmichael Road',
        });
    });

    it('returns nulls for empty values', () => {
        expect(normalizeMumbaiLocation('')).toEqual({
            location: null,
            pocket: null,
        });
    });
});
