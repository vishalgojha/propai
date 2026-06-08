const MULTISPACE_PATTERN = /\s+/g;
const PUNCTUATION_EDGE_PATTERN = /^[\s:,@*_\-./]+|[\s:,@*_\-./]+$/g;
const LEADING_LABEL_PATTERN = /^(?:name|building|building\s*name|project|project\s*name|society|society\s*name)\s*[:=\-]\s*/i;

const PROPERTY_WORDS = new Set([
  'apartment',
  'apartments',
  'apt',
  'flat',
  'flats',
  'office',
  'shop',
  'room',
  'rooms',
  'property',
  'unit',
  'residence',
  'residences',
]);

const DESCRIPTOR_WORDS = new Set([
  'spacious',
  'luxury',
  'lavish',
  'premium',
  'beautiful',
  'good',
  'new',
  'old',
  'empty',
  'semi',
  'fully',
  'furnished',
  'unfurnished',
  'done',
  'available',
  'ready',
  'large',
  'big',
  'small',
]);

const AMENITY_WORDS = new Set([
  'balcony',
  'balconies',
  'parking',
  'parkings',
  'garden',
  'terrace',
  'deck',
  'view',
  'views',
  'amenity',
  'amenities',
  'gym',
  'pool',
  'clubhouse',
]);

const METADATA_NOISE_PATTERN =
  /\b(?:bhk|rent|sale|lease|deposit|budget|asking|carpet|sq\s*ft|sqft|floor|furnished|unfurnished|negotiable|available|family|bachelor|client|tenant|buyer|seller|call|contact|mobile|phone)\b/i;

function normalizeCandidate(value: string | null | undefined) {
  let normalized = String(value || '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[|]+/g, ' ')
    .replace(/\*+/g, ' ')
    .replace(LEADING_LABEL_PATTERN, '')
    .replace(PUNCTUATION_EDGE_PATTERN, '')
    .replace(MULTISPACE_PATTERN, ' ')
    .trim();

  normalized = normalized
    .replace(LEADING_LABEL_PATTERN, '')
    .replace(PUNCTUATION_EDGE_PATTERN, '')
    .replace(MULTISPACE_PATTERN, ' ')
    .trim();

  return normalized;
}

function wordsOf(value: string) {
  return value.toLowerCase().match(/[a-z]+/g) || [];
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function isDescriptorOnlyBuilding(value: string) {
  const words = wordsOf(value);
  if (!words.length) return false;

  const hasPropertyWord = words.some((word) => PROPERTY_WORDS.has(word));
  if (!hasPropertyWord) return false;

  return words.every((word) => PROPERTY_WORDS.has(word) || DESCRIPTOR_WORDS.has(word));
}

function isAmenityOnlyMicroLocation(value: string) {
  const lower = value.toLowerCase();
  const words = wordsOf(value);
  if (!words.length) return false;

  if (/^(?:with|without)\b/.test(lower) && words.some((word) => AMENITY_WORDS.has(word))) {
    return true;
  }

  return words.every((word) => AMENITY_WORDS.has(word) || word === 'with' || word === 'without');
}

export function sanitizeBuildingNameCandidate(value: string | null | undefined): string | null {
  const cleaned = normalizeCandidate(value);
  if (!cleaned || cleaned.length < 3) return null;
  if (/^\d+\s*(?:bhk|sq\s*ft|sqft|floor|room)\b/i.test(cleaned)) return null;
  if (METADATA_NOISE_PATTERN.test(cleaned)) return null;
  if (isDescriptorOnlyBuilding(cleaned)) return null;
  if (isAmenityOnlyMicroLocation(cleaned)) return null;

  return titleCase(cleaned);
}

export function sanitizeMicroLocationCandidate(value: string | null | undefined): string | null {
  const cleaned = normalizeCandidate(value);
  if (!cleaned || cleaned.length < 3) return null;
  if (METADATA_NOISE_PATTERN.test(cleaned)) return null;
  if (isAmenityOnlyMicroLocation(cleaned)) return null;
  if (isDescriptorOnlyBuilding(cleaned)) return null;

  return titleCase(cleaned);
}
