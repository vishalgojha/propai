import type { PublicListing } from "@/lib/publicListings";

export type { PublicListing };

export async function getListings(locality?: string): Promise<PublicListing[]> {
  const requestUrl = locality?.trim()
    ? `/api/listings?locality=${encodeURIComponent(locality.trim())}`
    : '/api/listings';

  const res = await fetch(requestUrl);
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
  return getListings(locality);
}
