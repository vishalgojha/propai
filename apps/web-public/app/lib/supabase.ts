import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface Listing {
  id: string;
  structured_data: {
    type?: string;
    location?: string;
    area?: string;
    sub_area?: string;
    price?: number;
    price_type?: string;
    size_sqft?: number;
    furnishing?: string;
    bhk?: number;
    property_type?: string;
  };
  raw_text?: string;
  status: string;
  created_at: string;
}

export async function getListings({ type, area, limit = 50 }: { type?: string; area?: string; limit?: number } = {}): Promise<Listing[]> {
  let query = supabase
    .from('listings')
    .select('*')
    .eq('status', 'Active')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (type && type !== 'ALL') {
    query = query.contains('structured_data', { type });
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching listings:', error);
    return [];
  }

  let listings = data || [];

  if (area) {
    listings = listings.filter(l => {
      const sd = l.structured_data || {};
      return (sd.sub_area || sd.area || '').toLowerCase().includes(area.toLowerCase());
    });
  }

  return listings;
}

export async function getListingById(id: string): Promise<Listing | null> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

export async function getAreas(): Promise<string[]> {
  const { data } = await supabase
    .from('listings')
    .select('structured_data')
    .eq('status', 'Active');

  const areas = new Set<string>();
  for (const item of data || []) {
    const sd = item.structured_data || {};
    if (sd.sub_area) areas.add(sd.sub_area);
    if (sd.area) areas.add(sd.area);
  }
  return [...areas].sort();
}

export function formatPrice(price: number, priceType?: string): string {
  if (!price) return 'Price on request';
  if (price >= 10000000) return `₹${(price / 10000000).toFixed(2)}Cr`;
  if (price >= 100000) return `₹${(price / 100000).toFixed(2)}L`;
  return `₹${price.toLocaleString('en-IN')}`;
}

export function generateDescription(listing: Listing): string {
  const sd = listing.structured_data || {};
  const parts = [];
  if (sd.bhk) parts.push(`${sd.bhk} BHK`);
  if (sd.property_type) parts.push(sd.property_type);
  if (sd.sub_area || sd.area) parts.push(`in ${sd.sub_area || sd.area}`);
  if (sd.size_sqft) parts.push(`${sd.size_sqft} sq ft`);
  if (sd.furnishing) parts.push(sd.furnishing);
  if (sd.price && sd.price_type) {
    const formatted = formatPrice(sd.price, sd.price_type);
    parts.push(`at ${formatted}${sd.price_type === 'monthly' ? '/month' : ''}`);
  }
  return parts.join(' ') || 'Property listing';
}
