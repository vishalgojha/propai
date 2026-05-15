import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dedupeEntries,
  normalizeEntries,
  normalizeEntry,
  normalizeConfidence,
  normalizeLocation,
  normalizePropertyType,
  stripUnknownEntryFields,
  toNumber,
} from '../src/normalizer.js';

describe('toNumber', () => {
  it('normalizes Mumbai real estate money shorthand', () => {
    assert.equal(toNumber('5.20 Cr'), 52000000);
    assert.equal(toNumber('2cr.nego'), 20000000);
    assert.equal(toNumber('75 lakh'), 7500000);
    assert.equal(toNumber('1.00L'), 100000);
    assert.equal(toNumber('50K'), 50000);
    assert.equal(toNumber('₹30K'), 30000);
  });

  it('returns null for empty or non-numeric values', () => {
    assert.equal(toNumber(null), null);
    assert.equal(toNumber('negotiable'), null);
  });
});

describe('normalizeLocation', () => {
  it('maps known micro-locations to area and sub_area', () => {
    assert.deepEqual(normalizeLocation('Lokhandwala Market'), {
      city: 'Mumbai',
      area: 'Andheri West',
      sub_area: 'Lokhandwala Market',
    });

    assert.deepEqual(normalizeLocation('Carter Road'), {
      city: 'Mumbai',
      area: 'Bandra West',
      sub_area: 'Carter Road',
    });
  });

  it('keeps comma-separated area and sub-area structured', () => {
    assert.deepEqual(normalizeLocation('Amboli, Andheri West'), {
      city: 'Mumbai',
      area: 'Andheri West',
      sub_area: 'Amboli',
    });
  });
});

describe('normalizePropertyType', () => {
  it('normalizes common property labels', () => {
    assert.equal(normalizePropertyType('2BHK'), '2 BHK');
    assert.equal(normalizePropertyType('3 bhk'), '3 BHK');
    assert.equal(normalizePropertyType('1 rk'), '1 RK');
    assert.equal(normalizePropertyType('office space'), 'Office Space');
  });
});

describe('normalizeConfidence', () => {
  it('normalizes confidence to a bounded 0-1 score', () => {
    assert.equal(normalizeConfidence(0.82), 0.82);
    assert.equal(normalizeConfidence('82%'), 0.82);
    assert.equal(normalizeConfidence(82), 0.82);
    assert.equal(normalizeConfidence(140), 1);
    assert.equal(normalizeConfidence(-0.2), 0);
    assert.equal(normalizeConfidence('unclear'), null);
  });
});

describe('normalizeEntry', () => {
  it('drops hallucinated fields and keeps the allowed output schema', () => {
    const normalized = normalizeEntry(
      {
        intent: null,
        property_type: '2BHK',
        location: 'Off Link Road, Andheri West',
        area_sqft: '650 sq.ft',
        price: '2.20 Cr',
        confidence: '80%',
        price_psf: 2800000,
        broker_rating: 99,
      },
      'listing_sale',
    );

    assert.deepEqual(Object.keys(normalized), [
      'intent',
      'property_type',
      'location',
      'area_sqft',
      'price',
      'budget_min',
      'budget_max',
      'furnishing',
      'notes',
      'confidence',
    ]);
    assert.equal(normalized.intent, 'sell');
    assert.equal(normalized.price, 22000000);
    assert.equal(normalized.area_sqft, 650);
    assert.equal(normalized.location.area, 'Andheri West');
    assert.equal(normalized.location.sub_area, 'Off Link Road');
    assert.equal(normalized.confidence, 0.8);
  });

  it('swaps inverted budget ranges', () => {
    const normalized = normalizeEntry(
      {
        budget_min: '5 Cr',
        budget_max: '3 Cr',
      },
      'requirement',
    );

    assert.equal(normalized.budget_min, 30000000);
    assert.equal(normalized.budget_max, 50000000);
  });
});

describe('normalizeEntries', () => {
  it('deduplicates identical model output and filters empty entries', () => {
    const entries = normalizeEntries(
      [
        {
          property_type: '1BHK',
          location: 'Model Town, Andheri West',
          price: '30K',
          confidence: 0.9,
        },
        {
          property_type: '1 BHK',
          location: {
            city: 'Mumbai',
            area: 'Andheri West',
            sub_area: 'Model Town',
          },
          price: 30000,
          confidence: 0.9,
        },
        {
          notes: '',
        },
      ],
      'listing_rent',
    );

    assert.equal(entries.length, 1);
    assert.equal(entries[0].intent, 'rent');
    assert.equal(entries[0].price, 30000);
  });
});

describe('stripUnknownEntryFields', () => {
  it('keeps only the supported model schema', () => {
    assert.deepEqual(stripUnknownEntryFields({ price: '1cr', price_psf: 100, notes: 'x' }), {
      price: '1cr',
      notes: 'x',
    });
  });
});

describe('dedupeEntries', () => {
  it('preserves distinct entries from multi-listing messages', () => {
    const entries = dedupeEntries([
      {
        intent: 'sell',
        property_type: '3 BHK',
        location: { city: 'Mumbai', area: 'Andheri West', sub_area: 'DN Nagar' },
        area_sqft: 1150,
        price: 52000000,
      },
      {
        intent: 'sell',
        property_type: '3 BHK',
        location: { city: 'Mumbai', area: 'Juhu', sub_area: null },
        area_sqft: 1250,
        price: 75000000,
      },
    ]);

    assert.equal(entries.length, 2);
  });
});
