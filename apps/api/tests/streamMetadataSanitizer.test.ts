import { describe, expect, it } from 'vitest';
import { sanitizeBuildingNameCandidate, sanitizeMicroLocationCandidate } from '../src/utils/streamMetadataSanitizer';

describe('stream metadata sanitizer', () => {
  it('rejects descriptive apartment phrases as building names', () => {
    expect(sanitizeBuildingNameCandidate('Spacious Apartment.')).toBeNull();
    expect(sanitizeBuildingNameCandidate('3 BHK')).toBeNull();
  });

  it('rejects amenities as micro locations', () => {
    expect(sanitizeMicroLocationCandidate('With Balcony.')).toBeNull();
    expect(sanitizeMicroLocationCandidate('with balconies')).toBeNull();
  });

  it('keeps plausible project and road names', () => {
    expect(sanitizeBuildingNameCandidate('Kalpataru Solitaire')).toBe('Kalpataru Solitaire');
    expect(sanitizeMicroLocationCandidate('Juhu Versova Link Road')).toBe('Juhu Versova Link Road');
  });

  it('cleans broker-message wrappers from IGR building names', () => {
    expect(sanitizeBuildingNameCandidate('Name : NATHANI HEIGHTS*')).toBe('Nathani Heights');
    expect(sanitizeBuildingNameCandidate('* - *Manchester*** *Heights*')).toBe('Manchester Heights');
    expect(sanitizeBuildingNameCandidate('* - Girnar')).toBe('Girnar');
    expect(sanitizeBuildingNameCandidate('/ Factory')).toBe('Factory');
  });
});
