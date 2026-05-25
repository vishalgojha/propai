import { describe, expect, it } from 'vitest';
import { splitMultiListing } from './splitter';

describe('splitMultiListing', () => {
  it('returns the source unchanged when only one unit is present', () => {
    const raw = '@ One BKC, Bandra East\n2 BHK - 1200 sqft\nSemi furnished\nRent: ₹4 L/mo';
    expect(splitMultiListing(raw)).toEqual([raw]);
  });

  it('splits multi-listing messages and prepends the shared header', () => {
    const raw = '@ BKC-X, Bandra East\nBroker: Foo\n\n2 BHK - 950 sqft\nSemi furnished\nRent: ₹4 L/mo\n\n3 BHK - 1450 sqft\nFully furnished\nRent: ₹6.5 L/mo';

    expect(splitMultiListing(raw)).toEqual([
      '@ BKC-X, Bandra East\nBroker: Foo\n\n2 BHK - 950 sqft\nSemi furnished\nRent: ₹4 L/mo\n',
      '@ BKC-X, Bandra East\nBroker: Foo\n\n3 BHK - 1450 sqft\nFully furnished\nRent: ₹6.5 L/mo\n',
    ]);
  });
});
