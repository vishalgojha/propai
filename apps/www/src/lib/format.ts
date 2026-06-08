interface DescriptionListing {
  type: string;
  bhk?: number | string | null;
  locality?: string | null;
  furnishing?: string | null;
  area_sqft?: number | null;
  availability?: string | null;
}

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

export function formatBhk(bhk: number | string | null | undefined): string | null {
  if (bhk == null) return null;
  const s = String(bhk).replace(/\s*BHK$/i, '').trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return `${s} BHK`;
  return s;
}

export function buildDescription(listing: DescriptionListing): string {
  const parts: string[] = [];
  const dealType =
    listing.type === 'Requirement'
      ? 'Wanted'
      : listing.type === 'Rent'
        ? 'Available for rent'
        : 'Available for sale';
  parts.push(dealType);
  const bhkLabel = formatBhk(listing.bhk);
  if (bhkLabel) parts.push(bhkLabel);
  if (listing.locality) parts.push(`in ${listing.locality}`);
  if (listing.furnishing) parts.push(`(${listing.furnishing})`);
  if (listing.area_sqft) parts.push(`${listing.area_sqft} sqft`);
  if (listing.availability) parts.push(`· ${listing.availability}`);
  return parts.join(' ') || 'Property listed on PropAI Pulse';
}
