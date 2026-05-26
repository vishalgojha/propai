export type PriceBasis = 'total' | 'per_sqft' | 'monthly_rent' | 'deposit' | 'unknown';
export type PriceConfidence = 'high' | 'low';

export type ParsedPrice = {
  numeric: number | null;
  label: string;
  basis: PriceBasis;
  confidence: PriceConfidence;
};

export { splitMultiListing } from './splitter';

type Candidate = {
  absoluteAmount: number;
  basis: PriceBasis;
  explicitUnit: string;
  score: number;
};

const CANDIDATE_PATTERN = /(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(cr|crore|crores|lakh|lakhs|lac|lacs|l|k|thousand)?/gi;
const CURRENCY_PATTERN = /(?:₹|rs\.?|inr)\s*$/i;
const PRICE_HINT_PATTERN = /\b(rent|price|sale|lease|cost)\b/i;
const RENT_CONTEXT_PATTERN = /\b(rent|rental|lease|leave and license|leave & license|l&l|per month|monthly|pm)\b|\/mo|\/month/i;
const DEPOSIT_CONTEXT_PATTERN = /\b(deposit|advance)\b/i;
const PER_SQFT_CONTEXT_PATTERN = /\b(psf|per\s+sq\s*ft|per\s+sqft)\b|\/sqft/i;
const AREA_FOLLOW_PATTERN = /^(sq\s*ft|sqft|floor|room)\b/i;
const BHK_FOLLOW_PATTERN = /^bhk\b/i;
const CONTACT_FOLLOW_PATTERN = /^(contact|call|mobile)\b/i;
const RUPEE_SYMBOL_VARIANT_PATTERN = /(?:\u20b9|â¹|â‚¹|â¼|rs\.?|inr)\s*/gi;

function normalizeText(text: string) {
  return text
    .replace(RUPEE_SYMBOL_VARIANT_PATTERN, '₹')
    .replace(/(?<=\d),(?=\d)/g, '')
    .replace(/\u00a0/g, ' ');
}

function normalizeUnit(unit: string) {
  const value = unit.toLowerCase();
  if (value === 'crores' || value === 'crore') return 'cr';
  if (value === 'lakhs' || value === 'lacs' || value === 'lac' || value === 'lakh') return 'l';
  return value;
}

function toAbsoluteRupees(value: number, unit: string) {
  const normalizedUnit = normalizeUnit(unit);
  if (normalizedUnit === 'cr') return value * 10000000;
  if (normalizedUnit === 'l') return value * 100000;
  if (normalizedUnit === 'k' || normalizedUnit === 'thousand') return value * 1000;
  return value;
}

function formatCompact(value: number) {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function formatPriceLabel(amount: number, basis: PriceBasis) {
  let label: string;

  if (amount >= 10000000) {
    label = `₹${formatCompact(amount / 10000000)} Cr`;
  } else if (amount >= 100000) {
    label = `₹${formatCompact(amount / 100000)}L`;
  } else if (amount >= 1000) {
    label = `₹${formatCompact(amount / 1000)}K`;
  } else {
    label = `₹${Math.round(amount).toLocaleString('en-IN')}`;
  }

  if (basis === 'monthly_rent') {
    return `${label}/mo`;
  }

  if (basis === 'per_sqft') {
    return `${label}/sqft`;
  }

  return label;
}

function resolveBasis(context: string, dealTypeHint?: string): PriceBasis {
  const normalizedHint = String(dealTypeHint || '').trim().toLowerCase();

  if (PER_SQFT_CONTEXT_PATTERN.test(context)) return 'per_sqft';
  if (DEPOSIT_CONTEXT_PATTERN.test(context)) return 'deposit';
  if (normalizedHint === 'rent' || normalizedHint === 'lease' || RENT_CONTEXT_PATTERN.test(context)) {
    return 'monthly_rent';
  }

  return 'total';
}

function scoreCandidate(before: string, after: string, explicitUnit: string, amount: number, basis: PriceBasis) {
  let score = 0;

  if (CURRENCY_PATTERN.test(before)) score += 8;
  if (PRICE_HINT_PATTERN.test(before)) score += 6;
  if (explicitUnit) score += 8;
  if (amount >= 5000 && amount <= 100000000) score += 3;
  if (!explicitUnit && amount >= 1000000000) score -= 12;
  if (basis === 'per_sqft' && PER_SQFT_CONTEXT_PATTERN.test(`${before} ${after}`)) score += 4;
  if (AREA_FOLLOW_PATTERN.test(after) || BHK_FOLLOW_PATTERN.test(after)) score -= 10;
  if (CONTACT_FOLLOW_PATTERN.test(after)) score -= 10;

  return score;
}

function buildCandidates(text: string, dealTypeHint?: string): Candidate[] {
  const normalized = normalizeText(text);
  const candidates: Candidate[] = [];

  for (const match of normalized.matchAll(CANDIDATE_PATTERN)) {
    const rawValue = Number(match[1]);
    if (!Number.isFinite(rawValue)) continue;

    const explicitUnit = normalizeUnit(String(match[2] || ''));
    if (!explicitUnit && rawValue < 1000) continue;

    const start = match.index ?? 0;
    const end = start + match[0].length;
    const before = normalized.slice(Math.max(0, start - 24), start).toLowerCase();
    const after = normalized.slice(end, Math.min(normalized.length, end + 24)).trim().toLowerCase();
    const basis = resolveBasis(`${before} ${match[0]} ${after}`, dealTypeHint);
    const absoluteAmount = explicitUnit ? toAbsoluteRupees(rawValue, explicitUnit) : rawValue;
    const score = scoreCandidate(before, after, explicitUnit, absoluteAmount, basis);

    candidates.push({
      absoluteAmount,
      basis,
      explicitUnit,
      score,
    });
  }

  return candidates;
}

export function parsePrice(text: string, dealTypeHint?: string): ParsedPrice {
  const source = String(text || '').trim();
  if (!source) {
    return { numeric: null, label: '', basis: 'unknown', confidence: 'low' };
  }

  const candidates = buildCandidates(source, dealTypeHint);
  if (!candidates.length) {
    return { numeric: null, label: '', basis: 'unknown', confidence: 'low' };
  }

  const winner = candidates.reduce((best, current) => {
    if (current.score !== best.score) {
      return current.score > best.score ? current : best;
    }

    return current.absoluteAmount > best.absoluteAmount ? current : best;
  });

  if (winner.score < 0) {
    return {
      numeric: null,
      label: '',
      basis: winner.basis === 'total' ? 'unknown' : winner.basis,
      confidence: 'low',
    };
  }

  const roundedAmount = Math.round(winner.absoluteAmount);
  return {
    numeric: roundedAmount,
    label: formatPriceLabel(roundedAmount, winner.basis),
    basis: winner.basis,
    confidence: winner.score >= 8 ? 'high' : 'low',
  };
}
