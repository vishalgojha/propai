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

  it('splits inline pipe-separated unit lists', () => {
    const raw = 'Andheri West\n2bhk 650sqft 95L | 3bhk 900sqft 1.4cr | 4bhk 1200sqft 2.1cr';

    expect(splitMultiListing(raw)).toEqual([
      'Andheri West\n\n2bhk 650sqft 95L\n',
      'Andheri West\n\n3bhk 900sqft 1.4cr\n',
      'Andheri West\n\n4bhk 1200sqft 2.1cr\n',
    ]);
  });

  it('splits numbered listings into separate records', () => {
    const raw = 'Bandra West\n1) 2BHK 850sqft @1.2cr\n2) 3BHK 1100sqft @1.8cr\n3) 4BHK 1400sqft @2.5cr';

    expect(splitMultiListing(raw)).toEqual([
      'Bandra West\n\n2BHK 850sqft @1.2cr\n',
      'Bandra West\n\n3BHK 1100sqft @1.8cr\n',
      'Bandra West\n\n4BHK 1400sqft @2.5cr\n',
    ]);
  });

  it('splits repeated bhk lines without blank separators', () => {
    const raw = 'Andheri\n2BHK sale 1.2cr Andheri\n3BHK sale 1.8cr Andheri\n4BHK sale 2.5cr Andheri';

    expect(splitMultiListing(raw)).toEqual([
      'Andheri\n\n2BHK sale 1.2cr Andheri\n',
      'Andheri\n\n3BHK sale 1.8cr Andheri\n',
      'Andheri\n\n4BHK sale 2.5cr Andheri\n',
    ]);
  });

  it('splits floor-wise listings into separate records', () => {
    const raw = 'Raheja Classique, Andheri West\n4th floor 2BHK 1.2cr\n8th floor 2BHK 1.35cr\n12th floor 3BHK 1.9cr';

    expect(splitMultiListing(raw)).toEqual([
      'Raheja Classique, Andheri West\n\n4th floor 2BHK 1.2cr\n',
      'Raheja Classique, Andheri West\n\n8th floor 2BHK 1.35cr\n',
      'Raheja Classique, Andheri West\n\n12th floor 3BHK 1.9cr\n',
    ]);
  });

  it('splits rent and sale variants for the same unit into separate records', () => {
    const raw = 'Lease & Outright listing @ BKC-X\n2BHK Rent: 2L | Outright: 2.5cr';

    expect(splitMultiListing(raw)).toEqual([
      'Lease & Outright listing @ BKC-X\n\n2BHK Rent: 2L\n',
      'Lease & Outright listing @ BKC-X\n\n2BHK Outright: 2.5cr\n',
    ]);
  });
});
