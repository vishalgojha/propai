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

  it('renders per sqft values with raw rupee formatting', () => {
    expect(parsePrice('₹25,000/sqft')).toMatchObject({
      numeric: 25000,
      label: '₹25,000/sqft',
      basis: 'per_sqft',
    });
  });

  it('prefers explicit @ crore price over carpet area', () => {
    expect(parsePrice('PRE LEASED : IMPERIAL PLAZA : 1250 Carpet, Fully Furnished, @ 7 Crs')).toMatchObject({
      numeric: 70000000,
      label: '₹7 Cr',
      basis: 'total',
      confidence: 'high',
    });
  });

  it('prefers rent amount over deposit amount in rental blasts', () => {
    expect(parsePrice('Rent 1,85,000 Dep 7 Lac', 'rent')).toMatchObject({
      numeric: 185000,
      label: '₹1.85 Lakh/mo',
      basis: 'monthly_rent',
    });
  });
});
