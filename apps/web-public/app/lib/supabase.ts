import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface ListingEntry {
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
}

export interface WhatsAppMessage {
  id: string;
  message_id: string;
  group_id: string;
  group_name: string;
  sender_number: string;
  message: string;
  cleaned_message: string;
  status: string;
  type: string;
  entries: ListingEntry[];
  contacts: Array<{ number: string; name?: string }>;
  confidence: number;
  timestamp: string;
}

export async function getListings({ type, area, limit = 50 }: { type?: string; area?: string; limit?: number } = {}): Promise<WhatsAppMessage[]> {
  let query = supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('status', 'processed')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (type && type !== 'ALL') {
    query = query.eq('type', type);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching listings:', error);
    return [];
  }

  let listings = (data || []).filter(m => m.entries && m.entries.length > 0);

  if (area) {
    listings = listings.filter(m => {
      const entry = m.entries?.[0] || {};
      const loc = entry.sub_area || entry.area || '';
      return loc.toLowerCase().includes(area.toLowerCase());
    });
  }

  return listings;
}

export async function getListingById(id: string): Promise<WhatsAppMessage | null> {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

export async function getAreas(): Promise<string[]> {
  const { data } = await supabase
    .from('whatsapp_messages')
    .select('entries')
    .eq('status', 'processed');

  const areas = new Set<string>();
  for (const msg of data || []) {
    const entry = msg.entries?.[0] || {};
    if (entry.sub_area) areas.add(entry.sub_area);
    if (entry.area) areas.add(entry.area);
  }
  return [...areas].sort();
}

export function formatPrice(price: number, priceType?: string): string {
  if (!price) return 'Price on request';
  if (price >= 10000000) return `₹${(price / 10000000).toFixed(2)}Cr`;
  if (price >= 100000) return `₹${(price / 100000).toFixed(2)}L`;
  return `₹${price.toLocaleString('en-IN')}`;
}

export function generateDescription(listing: WhatsAppMessage): string {
  const entry = listing.entries?.[0] || {};
  const parts = [];
  if (entry.bhk) parts.push(`${entry.bhk} BHK`);
  if (entry.property_type) parts.push(entry.property_type);
  if (entry.sub_area || entry.area) parts.push(`in ${entry.sub_area || entry.area}`);
  if (entry.size_sqft) parts.push(`${entry.size_sqft} sq ft`);
  if (entry.furnishing) parts.push(entry.furnishing);
  if (entry.price && entry.price_type) {
    const formatted = formatPrice(entry.price, entry.price_type);
    parts.push(`at ${formatted}${entry.price_type === 'monthly' ? '/month' : ''}`);
  }
  return parts.join(' ') || 'Property listing';
}
