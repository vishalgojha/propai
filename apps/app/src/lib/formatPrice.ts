export function formatPriceNumeric(value: number, type?: string): string {
  if (type === 'Rent') {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2).replace(/\.00$/, '')} Cr/mo`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1).replace(/\.0$/, '')} Lakh/mo`;
    if (value >= 1000) return `₹${Math.round(value / 1000)}k/mo`;
    return `₹${Math.round(value)}/mo`;
  }

  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1).replace(/\.0$/, '')} Lakh`;
  if (value >= 1000) return `₹${Math.round(value / 1000)}k`;
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}
