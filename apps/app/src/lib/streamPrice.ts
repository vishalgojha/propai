import { formatPriceNumeric } from './formatPrice';

type StreamPriceLike = {
  price?: string | null;
  priceNumeric?: number | null;
  type?: string | null;
};

export function getStreamPriceLabel(item: StreamPriceLike): string {
  if (typeof item.priceNumeric === 'number' && Number.isFinite(item.priceNumeric) && item.priceNumeric > 0) {
    return formatPriceNumeric(item.priceNumeric, item.type || undefined);
  }

  const rawLabel = String(item.price || '').trim();
  if (rawLabel && !/^unspecified$/i.test(rawLabel)) {
    return rawLabel
      .replace(/₹\s*([0-9]+(?:\.[0-9]+)?)\s*cr\b/ig, '₹$1 Cr')
      .replace(/₹\s*([0-9]+(?:\.[0-9]+)?)\s*l\b/ig, '₹$1 Lakh')
      .replace(/₹\s*([0-9]+(?:\.[0-9]+)?)\s*k\b/ig, '₹$1k')
      .replace(/([0-9]+(?:\.[0-9]+)?)\s*cr\b/ig, '$1 Cr')
      .replace(/([0-9]+(?:\.[0-9]+)?)\s*l\b/ig, '$1 Lakh')
      .replace(/([0-9]+(?:\.[0-9]+)?)\s*k\b/ig, '$1k');
  }

  return '—';
}
