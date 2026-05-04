import { describe, expect, it } from 'vitest';
import { areLikelyDuplicateListings, priceToLakhs } from '../src/utils/listingDuplicateMatcher';

describe('listingDuplicateMatcher', () => {
    it('converts crores to lakhs correctly', () => {
        expect(priceToLakhs(1.8, 'crores')).toBe(180);
        expect(priceToLakhs(95, 'lakhs')).toBe(95);
    });

    it('flags strongly matching listings as duplicates', () => {
        expect(
            areLikelyDuplicateListings(
                {
                    buildingName: 'Sea Breeze',
                    location: 'Bandra West',
                    bhk: '3 BHK',
                    floor: '12',
                    price: 4.5,
                    priceUnit: 'crores',
                    carpetArea: 1450,
                },
                {
                    buildingName: 'Sea Breeze',
                    location: 'Bandra West',
                    bhk: '3 BHK',
                    floor: '12',
                    price: 455,
                    priceUnit: 'lakhs',
                    carpetArea: 1460,
                }
            )
        ).toBe(true);
    });

    it('rejects listings with mismatched key fields', () => {
        expect(
            areLikelyDuplicateListings(
                {
                    buildingName: 'Sea Breeze',
                    location: 'Bandra West',
                    bhk: '3 BHK',
                    price: 4.5,
                    priceUnit: 'crores',
                },
                {
                    buildingName: 'Sea Breeze',
                    location: 'Khar West',
                    bhk: '3 BHK',
                    price: 4.5,
                    priceUnit: 'crores',
                }
            )
        ).toBe(false);
    });
});
