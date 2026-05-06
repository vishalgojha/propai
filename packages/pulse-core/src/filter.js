const KEYWORDS = [
  'bhk',
  'rk',
  'flat',
  'rent',
  'buy',
  'sell',
  'lease',
  'office',
  'shop',
];

const PRICE_INDICATORS = ['cr', 'crore', 'lakh', '₹', 'rs', 'k'];

export function isRelevant(text) {
  if (!text || text.trim().length <= 10) {
    return false;
  }

  const lower = text.toLowerCase();

  return (
    KEYWORDS.some((keyword) => lower.includes(keyword)) ||
    PRICE_INDICATORS.some((indicator) => lower.includes(indicator))
  );
}
