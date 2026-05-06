export function classifyMessage(text) {
  const lower = (text || '').toLowerCase();

  if (lower.includes('require') || lower.includes('required')) {
    return 'requirement';
  }

  const hasRent = lower.includes('rent');
  const hasSale = ['sale', 'avl', 'available'].some((token) => lower.includes(token));

  if (hasRent && hasSale) {
    return 'mixed';
  }

  if (hasRent) {
    return 'listing_rent';
  }

  if (hasSale) {
    return 'listing_sale';
  }

  return 'unknown';
}
