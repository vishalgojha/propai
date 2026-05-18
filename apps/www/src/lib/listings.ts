export interface PublicListing {
  id: string;
  title: string;
  price: number;
  locality: string;
  type: 'Rent' | 'Sale' | 'Requirement';
  bhk?: number | string;
  area_sqft?: number;
  furnishing?: string;
  availability?: string;
  raw_text: string;
  created_at: string;
  slug: string;
  floor?: string;
  broker_phone?: string;
}

export async function getListings(): Promise<PublicListing[]> {
  const res = await fetch('/api/listings');
  if (!res.ok) throw new Error(`Failed to fetch listings: ${res.status}`);
  const data = await res.json();
  return data.listings || [];
}

export async function getListingBySlug(slug: string): Promise<PublicListing | null> {
  const res = await fetch(`/api/listings?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.listing || null;
}

export async function getListingsByLocality(locality: string): Promise<PublicListing[]> {
  const all = await getListings();
  return all.filter(l => l.locality.toLowerCase() === locality.toLowerCase());
}
