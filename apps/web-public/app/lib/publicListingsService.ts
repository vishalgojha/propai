import { supabase } from '@/app/lib/supabase';
import {
  PublicAreasResponse,
  PublicListingContact,
  PublicListingDetail,
  PublicListingsResponse,
  PublicListingSummary,
  PublicListingType,
  PublicSitemapFeedResponse,
} from '@/app/lib/publicListingTypes';

interface PublicListingRow {
  source_message_id: string;
  source_group_id: string | null;
  source_group_name: string | null;
  listing_type: string;
  area: string | null;
  sub_area: string | null;
  location: string;
  price: number | null;
  price_type: string | null;
  size_sqft: number | null;
  furnishing: string | null;
  bhk: number | null;
  property_type: string | null;
  title: string;
  description: string;
  raw_message: string | null;
  cleaned_message: string | null;
  primary_contact_name: string | null;
  primary_contact_number: string | null;
  primary_contact_wa: string | null;
  confidence: number | null;
  message_timestamp: string | null;
  search_text: string;
}

function toPublicListingType(listingType: string): PublicListingType {
  if (listingType === 'listing_rent') return 'rent';
  if (listingType === 'listing_sale') return 'sale';
  return 'requirement';
}

function toContact(row: PublicListingRow): PublicListingContact | null {
  if (!row.primary_contact_number || !row.primary_contact_wa) {
    return null;
  }

  return {
    name: row.primary_contact_name,
    number: row.primary_contact_number,
    waUrl: row.primary_contact_wa,
  };
}

function toSummary(row: PublicListingRow): PublicListingSummary {
  return {
    id: row.source_message_id,
    type: toPublicListingType(row.listing_type),
    title: row.title,
    location: row.location,
    area: row.area,
    subArea: row.sub_area,
    price: row.price,
    priceType: row.price_type,
    bhk: row.bhk,
    sizeSqft: row.size_sqft,
    propertyType: row.property_type,
    furnishing: row.furnishing,
    description: row.description,
    postedAt: row.message_timestamp,
    contact: toContact(row),
  };
}

function toDetail(row: PublicListingRow): PublicListingDetail {
  return {
    ...toSummary(row),
    sourceGroupId: row.source_group_id,
    sourceGroupName: row.source_group_name,
    rawMessage: row.raw_message,
    cleanedMessage: row.cleaned_message,
    confidence: row.confidence,
  };
}

export async function listPublicListings({
  type,
  area,
  q,
  limit = 50,
}: {
  type?: string;
  area?: string;
  q?: string;
  limit?: number;
} = {}): Promise<PublicListingsResponse> {
  if (!supabase) {
    return { items: [], total: 0 };
  }

  let query = supabase
    .from('public_listings')
    .select('*', { count: 'exact' })
    .order('message_timestamp', { ascending: false })
    .limit(limit);

  if (type && type !== 'ALL') {
    const mappedType =
      type === 'rent'
        ? 'listing_rent'
        : type === 'sale'
          ? 'listing_sale'
          : 'requirement';
    query = query.eq('listing_type', mappedType);
  }

  if (area) {
    query = query.or(`area.ilike.%${area}%,sub_area.ilike.%${area}%`);
  }

  if (q) {
    query = query.ilike('search_text', `%${q.toLowerCase()}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error('Error fetching public listings:', error);
    return { items: [], total: 0 };
  }

  return {
    items: (data || []).map((row) => toSummary(row as PublicListingRow)),
    total: count ?? data?.length ?? 0,
  };
}

export async function getPublicListingDetail(id: string): Promise<PublicListingDetail | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('public_listings')
    .select('*')
    .eq('source_message_id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return toDetail(data as PublicListingRow);
}

export async function listPublicAreas(): Promise<PublicAreasResponse> {
  if (!supabase) return { items: [] };

  const { data, error } = await supabase
    .from('public_listings')
    .select('area, sub_area');

  if (error) {
    console.error('Error fetching public areas:', error);
    return { items: [] };
  }

  const areas = new Set<string>();
  for (const row of data || []) {
    if (row.sub_area) areas.add(row.sub_area);
    if (row.area) areas.add(row.area);
  }

  return { items: [...areas].sort() };
}

export async function getPublicSitemapFeed(limit = 500): Promise<PublicSitemapFeedResponse> {
  if (!supabase) return { areas: [], listingIds: [] };

  const [areasResult, listingsResult] = await Promise.all([
    listPublicAreas(),
    supabase
      .from('public_listings')
      .select('source_message_id')
      .order('message_timestamp', { ascending: false })
      .limit(limit),
  ]);

  if (listingsResult.error) {
    console.error('Error fetching public listing ids:', listingsResult.error);
    return { areas: areasResult.items, listingIds: [] };
  }

  return {
    areas: areasResult.items,
    listingIds: (listingsResult.data || []).map((row: { source_message_id: string }) => row.source_message_id),
  };
}
