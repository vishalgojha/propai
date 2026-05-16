import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { formatCurrencyShort, slugifyLocality, topLocalities } from "@/lib/site";

export type ListingType = "rent" | "sale" | "requirement";

export type PublicListing = {
  id: string;
  title: string;
  locality: string;
  localitySlug: string;
  area: string;
  city: string;
  type: ListingType;
  bhk: string;
  areaSqft: number | null;
  furnishing: string | null;
  priceAmount: number | null;
  priceLabel: string;
  tags: string[];
  brokerName: string | null;
  brokerPhone: string | null;
  isPro: boolean;
  brokerInitials: string;
  description: string;
  rawText: string;
  building: string | null;
  floor: string | null;
  parking: string | null;
  deposit: string | null;
  amenities: string[];
  createdAt: string;
  updatedAt: string;
  matchScore: number;
};

type LegacyListingRow = {
  id: string;
  tenant_id: string;
  structured_data: Record<string, unknown>;
  raw_text: string | null;
  status: string;
  created_at: string;
};

type ProBroker = {
  phone: string;
  fullName: string | null;
};

type Filters = {
  q?: string;
  locality?: string;
  type?: string;
  bhk?: string;
  sort?: string;
  page?: number;
  perPage?: number;
};

export const getAllListings = cache(async (): Promise<PublicListing[]> => {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return [];
  }
  const [{ data: listings, error: listingError }, { data: profiles }, { data: subscriptions }] = await Promise.all([
    supabase.from("listings").select("id, tenant_id, structured_data, raw_text, status, created_at").eq("status", "Active").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, phone, full_name"),
    supabase.from("subscriptions").select("tenant_id, plan, status")
  ]);

  if (listingError) {
    throw new Error(listingError.message);
  }

  const paidTenantIds = new Set(
    (subscriptions || [])
      .filter((row: any) => (row.status === "active" || row.status === "trial") && (row.plan === "Pro" || row.plan === "Team"))
      .map((row: any) => row.tenant_id)
  );

  const paidBrokerMap = new Map<string, ProBroker>();
  for (const row of profiles || []) {
    const digits = digitsOnly((row as any).phone);
    if (!digits) continue;
    if (!paidTenantIds.has((row as any).id)) continue;
    paidBrokerMap.set(digits, {
      phone: digits,
      fullName: (row as any).full_name || null
    });
  }

  return ((listings || []) as LegacyListingRow[])
    .map((row) => normalizeListing(row, paidBrokerMap))
    .filter((listing): listing is PublicListing => Boolean(listing));
});

function normalizeListing(row: LegacyListingRow, paidBrokerMap: Map<string, ProBroker>): PublicListing | null {
  const data = (row.structured_data || {}) as Record<string, unknown>;
  const rawText = String(row.raw_text || "");
  const title = pickString(data.title, data.name, data.displayTitle) || inferTitle(rawText) || "Property Listing";
  const location = pickString(data.location, data.locality, data.locality_canonical, data.address, data.area) || inferLocation(rawText) || "Unknown locality";
  const locality = normalizeLocality(location);
  const area = pickString(data.micro_market, data.microLocation, data.area, data.building, data.project) || locality;
  const city = pickString(data.city, data.city_canonical, "India") || "India";
  const bhk = pickString(data.bhk, data.layout, data.property_type) || inferBhk(rawText) || "Flexible";
  const areaSqft = parseAreaSqft(data.area_sqft, data.carpet_area, data.area);
  const furnishing = pickString(data.furnishing, data.furnished) || null;
  const type = normalizeType(pickString(data.type, data.deal_type, data.intent, data.category), rawText);
  const priceAmount = parsePriceAmount(data.price_numeric, data.price, rawText, type, areaSqft);
  const priceLabel = formatCurrencyShort(priceAmount, type === "rent");
  const building = pickString(data.building, data.building_name, data.project) || inferBuilding(rawText);
  const floor = pickString(data.floor, data.floor_number) || null;
  const parking = pickString(data.parking, data.car_parking, data.car_parkings) || inferParking(rawText);
  const deposit = pickString(data.deposit) || inferDeposit(rawText);
  const brokerDigits = digitsOnly(pickString(data.contact_number, data.phone, data.contactPhone, data.sourcePhone) || extractPhone(rawText));
  const proBroker = brokerDigits ? paidBrokerMap.get(brokerDigits) || null : null;
  const brokerName = proBroker?.fullName || null;
  const brokerPhone = proBroker?.phone || null;
  const amenities = inferAmenities(data, rawText);
  const tags = amenities.slice(0, 3);

  return {
    id: row.id,
    title,
    locality,
    localitySlug: slugifyLocality(locality),
    area,
    city,
    type,
    bhk,
    areaSqft,
    furnishing,
    priceAmount,
    priceLabel,
    tags,
    brokerName,
    brokerPhone,
    isPro: Boolean(proBroker),
    brokerInitials: initials(brokerName || "Broker"),
    description: rawText || title,
    rawText,
    building,
    floor,
    parking,
    deposit,
    amenities,
    createdAt: row.created_at,
    updatedAt: row.created_at,
    matchScore: inferMatchScore(data, rawText)
  };
}

export async function getHomepageData() {
  const all = await getAllListings();
  const latest = all.slice(0, 8);
  const featured = all.filter((item) => item.isPro).sort((a, b) => b.matchScore - a.matchScore).slice(0, 4);
  const localityCounts = topLocalities.map((locality) => {
    const count = all.filter((item) => item.locality.toLowerCase() === locality.toLowerCase()).length;
    return { locality, slug: slugifyLocality(locality), count };
  });
  return {
    latest,
    featured,
    localityCounts,
    stats: {
      listings: all.length,
      brokers: new Set(all.filter((item) => item.brokerPhone).map((item) => item.brokerPhone)).size,
      localities: new Set(all.map((item) => item.localitySlug)).size
    }
  };
}

export async function getListingsPageData(filters: Filters) {
  const all = await getAllListings();
  let filtered = all;
  const q = String(filters.q || "").trim().toLowerCase();
  const locality = String(filters.locality || "").trim().toLowerCase();
  const type = String(filters.type || "").trim().toLowerCase();
  const bhk = String(filters.bhk || "").trim().toLowerCase();
  const sort = String(filters.sort || "newest");
  const page = Math.max(1, Number(filters.page || 1));
  const perPage = Math.max(1, Number(filters.perPage || 24));

  if (q) {
    filtered = filtered.filter((listing) =>
      [listing.title, listing.locality, listing.area, listing.description, listing.bhk, listing.tags.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }

  if (locality) {
    filtered = filtered.filter((listing) => listing.localitySlug === slugifyLocality(locality) || listing.locality.toLowerCase().includes(locality));
  }

  if (type) {
    filtered = filtered.filter((listing) => listing.type === type);
  }

  if (bhk) {
    filtered = filtered.filter((listing) => listing.bhk.toLowerCase().includes(bhk));
  }

  filtered = sortListings(filtered, sort);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * perPage;

  return {
    totalAll: all.length,
    total,
    page: currentPage,
    totalPages,
    results: filtered.slice(start, start + perPage),
    localities: Array.from(new Set(all.map((listing) => listing.locality))).sort()
  };
}

export async function getListingById(id: string) {
  const listings = await getAllListings();
  return listings.find((listing) => listing.id === id) || null;
}

export async function getRelatedListings(listing: PublicListing) {
  const all = await getAllListings();
  return all.filter((item) => item.id !== listing.id && item.localitySlug === listing.localitySlug && item.type === listing.type).slice(0, 4);
}

export async function getLocalityPageData(slug: string, page = 1, perPage = 24) {
  const all = await getAllListings();
  const filtered = all.filter((listing) => listing.localitySlug === slug);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const sliceStart = (currentPage - 1) * perPage;
  const rent = filtered.filter((item) => item.type === "rent");
  const sale = filtered.filter((item) => item.type === "sale");
  return {
    listings: filtered.slice(sliceStart, sliceStart + perPage),
    total: filtered.length,
    page: currentPage,
    totalPages,
    locality: filtered[0]?.locality || slug.replace(/-/g, " "),
    stats: {
      rent: rent.length,
      sale: sale.length,
      avgRent: avg(rent.map((item) => item.priceAmount || 0)),
      avgSale: avg(sale.map((item) => item.priceAmount || 0))
    }
  };
}

// Removed: Static generation not needed - using dynamic rendering

export async function getAllLocalitySlugs() {
  const listings = await getAllListings();
  return Array.from(new Set(listings.map((listing) => listing.localitySlug)));
}

function avg(values: number[]) {
  const clean = values.filter((value) => value > 0);
  if (clean.length === 0) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function sortListings(listings: PublicListing[], sort: string) {
  const next = [...listings];
  if (sort === "price_asc") return next.sort((a, b) => (a.priceAmount || Number.MAX_SAFE_INTEGER) - (b.priceAmount || Number.MAX_SAFE_INTEGER));
  if (sort === "price_desc") return next.sort((a, b) => (b.priceAmount || 0) - (a.priceAmount || 0));
  if (sort === "match") return next.sort((a, b) => b.matchScore - a.matchScore);
  return next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function inferTitle(rawText: string) {
  return rawText.split("\n").map((line) => line.trim()).find((line) => line.length > 8 && !line.includes("http")) || null;
}

function inferLocation(rawText: string) {
  const match = rawText.match(/\b(?:in\s+|at\s+)?(bandra|powai|andheri|worli|thane|juhu|goregaon|malad|chembur|dadar)/i);
  if (match) {
    const name = match[1];
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }
  const line = rawText.split("\n").map((entry) => entry.trim()).find((entry) => /bandra|powai|andheri|worli|thane|juhu|goregaon|malad|chembur|dadar/i.test(entry));
  return line || null;
}

function normalizeLocality(value: string) {
  const trimmed = value.split(",")[0]?.trim() || value.trim();
  if (!trimmed) return "Unknown Locality";
  return trimmed.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inferBhk(rawText: string) {
  const match = rawText.match(/\b(\d(?:\.\d+)?)\s*bhk\b/i);
  return match ? `${match[1]}BHK` : null;
}

function parseAreaSqft(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const text = String(value || "");
    const match = text.match(/(\d{2,5}(?:\.\d+)?)\s*(sq\s*ft|sqft|carpet)/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function normalizeType(value: string | null, rawText: string): ListingType {
  const lower = `${value || ""} ${rawText}`.toLowerCase();
  if (lower.includes("requirement")) return "requirement";
  if (lower.includes("rent") || lower.includes("lease") || lower.includes("l/l")) return "rent";
  return "sale";
}

function parsePriceAmount(value: unknown, priceLabel: unknown, rawText: string, type: ListingType, areaSqft: number | null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const merged = `${String(priceLabel || "")} ${rawText}`;
  const rateMatch = areaSqft ? merged.match(/(\d+(?:\.\d+)?)\s*(k|l|lac|lakh)?\s*(?:psf|per\s*sq\.?\s*ft|\/\s*sqft)/i) : null;
  if (rateMatch && areaSqft) {
    let rate = Number(rateMatch[1]);
    const unit = String(rateMatch[2] || "").toLowerCase();
    if (unit === "k") rate *= 1000;
    if (unit === "l" || unit === "lac" || unit === "lakh") rate *= 100000;
    return Math.round(rate * areaSqft);
  }

  const candidates = [...merged.matchAll(/₹?\s*(\d+(?:\.\d+)?)\s*(cr|crore|l|lac|lakh|k|thousand)?/gi)]
    .filter((m) => Number.isFinite(Number(m[1])))
    .map((m) => {
      let amount = Number(m[1]);
      const unit = String(m[2] || "").toLowerCase();
      if (unit === "cr" || unit === "crore") amount *= 10000000;
      else if (unit === "l" || unit === "lac" || unit === "lakh") amount *= 100000;
      else if (unit === "k" || unit === "thousand") amount *= 1000;
      else if (type === "sale" && amount < 1000) amount *= 100000;

      const idx = m.index || 0;
      const before = merged.slice(Math.max(0, idx - 25), idx).toLowerCase();
      const after = merged.slice(idx + m[0].length, idx + m[0].length + 15).toLowerCase();

      let score = 0;
      if (unit) score += 8;
      if (/₹/.test(before)) score += 7;
      if (/rent|price|lease|sale|deposit|advance|cost/i.test(before)) score += 6;
      if (amount > 500) score += 2;
      if (amount >= 5000 && amount <= 100000000) score += 3;
      if (/sq\s*ft|sqft|sq|acres?|hectare/i.test(after)) score -= 10;
      if (/bhk|room|bed/i.test(after)) score -= 8;
      if (/contact|call|whatsapp|phone|mobile/i.test(after)) score -= 10;

      return { amount: Math.round(amount), score };
    });

  if (candidates.length === 0) return null;
  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
  if (best.score < 0) return null;
  return best.amount;
}

function inferBuilding(rawText: string) {
  const line = rawText.split("\n").map((entry) => entry.trim()).find((entry) => /^[A-Z][A-Z\s.&'-]{3,}$/i.test(entry) && !/rent|sale|price|sqft/i.test(entry));
  return line || null;
}

function inferParking(rawText: string) {
  const match = rawText.match(/(\d+)\s+car\s+parking/i);
  return match ? `${match[1]} car parking` : null;
}

function inferDeposit(rawText: string) {
  const match = rawText.match(/deposit[:\s-]*([^\n]+)/i);
  return match ? match[1].trim() : null;
}

function inferAmenities(data: Record<string, unknown>, rawText: string) {
  const amenityValues = Array.isArray(data.amenities) ? data.amenities.map((item) => String(item)) : [];
  const detected = [
    /sea view/i.test(rawText) ? "Sea View" : null,
    /gym/i.test(rawText) ? "Gym" : null,
    /parking/i.test(rawText) ? "Parking" : null,
    /furnished/i.test(rawText) ? "Furnished" : null,
    /lift/i.test(rawText) ? "Lift" : null,
    /balcony/i.test(rawText) ? "Balcony" : null
  ].filter(Boolean) as string[];
  return Array.from(new Set([...amenityValues, ...detected])).slice(0, 6);
}

function inferMatchScore(data: Record<string, unknown>, rawText: string) {
  const structuredConfidence = Number(data.confidence || data.match || 0);
  if (structuredConfidence > 0) return Math.max(1, Math.min(99, Math.round(structuredConfidence)));
  return Math.max(76, Math.min(98, 80 + Math.round(rawText.length / 50)));
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return null;
}

function extractPhone(rawText: string) {
  const match = rawText.match(/(?:\+91[-\s]?)?([6-9]\d{9})/);
  return match?.[1] || null;
}

function digitsOnly(value: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function initials(value: string) {
  return value.split(" ").filter(Boolean).slice(0, 2).map((chunk) => chunk[0]?.toUpperCase() || "").join("") || "P";
}
