export function formatPrice(price: number, type?: string): string {
  if (!price || price <= 0) return 'Price on Request';
  const cr = price / 10000000;
  const l = price / 100000;
  if (cr >= 1) {
    const s = Number.isInteger(cr) ? Math.round(cr).toString() : cr.toFixed(1);
    return type === 'Rent' ? `₹${s} Cr/mo` : `₹${s} Cr`;
  }
  if (l >= 1) {
    const s = Number.isInteger(l) ? Math.round(l).toString() : l.toFixed(1);
    return type === 'Rent' ? `₹${s} L/mo` : `₹${s} L`;
  }
  if (price >= 1000) {
    return type === 'Rent' ? `₹${Math.round(price / 1000)} K/mo` : `₹${Math.round(price / 1000)} K`;
  }
  return type === 'Rent' ? `₹${price}/mo` : `₹${price}`;
}
