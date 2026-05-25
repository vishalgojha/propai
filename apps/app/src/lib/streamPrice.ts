import { formatPriceNumeric } from './formatPrice';

type StreamPriceLike = {
  price?: string | null;
  priceNumeric?: number | null;
  type?: string | null;
};

export function getStreamPriceLabel(item: StreamPriceLike): string {
  const rawLabel = String(item.price || '').trim();
  if (rawLabel && !/^unspecified$/i.test(rawLabel)) {
    return rawLabel;
  }

  if (typeof item.priceNumeric === 'number' && Number.isFinite(item.priceNumeric) && item.priceNumeric > 0) {
    return formatPriceNumeric(item.priceNumeric, item.type || undefined);
  }

  return '—';
}
