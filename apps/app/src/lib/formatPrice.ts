export function formatPriceNumeric(value: number, type?: string): string {
  if (type === 'Rent') {
    if (value >= 100000) return `₹${(value / 100000).toFixed(1).replace(/\.0$/, '')}L/mo`;
    if (value >= 1000) return `₹${Math.round(value / 1000)}K/mo`;
    return `₹${Math.round(value)}/mo`;
  }

  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1).replace(/\.0$/, '')} L`;
  if (value >= 1000) return `₹${Math.round(value / 1000)}K`;
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}
