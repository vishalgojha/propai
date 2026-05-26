import { describe, expect, it } from 'vitest';
import { parsePrice } from './index';

describe('parsePrice', () => {
  it('parses crore sale values correctly', () => {
    expect(parsePrice('11.00 cr negotiable')).toMatchObject({
      numeric: 110000000,
      label: '₹11 Cr',
      basis: 'total',
      confidence: 'high',
    });
  });

  it('parses monthly rent labels once', () => {
    expect(parsePrice('65000/mo', 'rent')).toMatchObject({
      numeric: 65000,
      label: '₹65k/mo',
      basis: 'monthly_rent',
      confidence: 'low',
    });
  });

  it('parses deposits without a rent suffix', () => {
    expect(parsePrice('2.5L deposit')).toMatchObject({
      numeric: 250000,
      label: '₹2.5 Lakh',
      basis: 'deposit',
      confidence: 'high',
    });
  });

  it('rejects plain area values', () => {
    expect(parsePrice('1930 sqft')).toMatchObject({
      numeric: null,
      label: '',
      confidence: 'low',
    });
  });

  it('prefers the priced candidate over bhk counts', () => {
    expect(parsePrice('4BHK 1.8cr')).toMatchObject({
      numeric: 18000000,
      label: '₹1.8 Cr',
      basis: 'total',
      confidence: 'high',
    });
  });

  it('normalizes corrupted rupee symbol variants before parsing', () => {
    expect(parsePrice('Rent â¼4 L/mo', 'rent')).toMatchObject({
      numeric: 400000,
      label: '₹4 Lakh/mo',
      basis: 'monthly_rent',
    });
  });

  it('keeps crore prices stable for negotiable sale messages', () => {
    expect(parsePrice('2.35cr Negotiable')).toMatchObject({
      numeric: 23500000,
      label: '₹2.35 Cr',
      basis: 'total',
      confidence: 'high',
    });
  });
});
