import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase.server";

export interface PublicListing {
  id: string;
  title: string;
  price: number;
  locality: string;
  type: "Rent" | "Sale" | "Requirement";
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

export async function fetchPublicListings(): Promise<PublicListing[]> {
  if (!supabaseAdmin) {
    throw new Error("Database not configured");
  }

  const [{ data: streamItems, error: streamError }, { data: profiles }, { data: subscriptions }] = await Promise.all([
    supabaseAdmin
      .from("stream_items")
      .select("id, tenant_id, type, deal_type, locality, city, bhk, area_sqft, price_label, price_numeric, confidence_score, source_phone, raw_text, created_at, parsed_payload")
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("profiles").select("id, phone, full_name"),
    supabaseAdmin.from("subscriptions").select("tenant_id, plan, status"),
  ]);

  if (streamError) {
    throw new Error(streamError.message);
  }

  const paidTenantIds = new Set(
    (subscriptions || [])
      .filter(
        (row: any) =>
          (row.status === "active" || row.status === "trial") &&
          (row.plan === "Pro" || row.plan === "Trial")
      )
      .map((row: any) => row.tenant_id)
  );

  const paidBrokerMap = new Map<string, { phone: string; fullName: string | null }>();
  for (const row of profiles || []) {
    const digits = digitsOnly((row as any).phone);
    if (!digits) continue;
    if (!paidTenantIds.has((row as any).id)) continue;
    paidBrokerMap.set(digits, { phone: digits, fullName: (row as any).full_name || null });
  }

  return ((streamItems || []) as any[])
    .filter((row) => paidTenantIds.has(String((row as any).tenant_id || "")))
    .map((row) => normalizeStreamListing(row, paidBrokerMap))
    .filter(Boolean);
}

export async function fetchPublicListingBySlug(slug: string): Promise<PublicListing | null> {
  const listings = await fetchPublicListings();
  return listings.find((listing) => listing.slug === slug || listing.id === slug) || null;
}

export async function recordPublicWaClick(input: {
  listingId: string;
  forwardedFor: string;
  userAgent: string;
}) {
  if (!supabaseAdmin) {
    throw new Error("Database not configured");
  }

  const { data: row } = await supabaseAdmin
    .from("stream_items")
    .select("id, tenant_id, source_phone, raw_text, parsed_payload")
    .eq("id", input.listingId)
    .single()
    .throwOnError();

  if (!row) {
    return null;
  }

  const rawText = String(row.raw_text || "");
  const phone =
    String((row as any).source_phone || (row as any).parsed_payload?.contactPhone || (row as any).parsed_payload?.sourcePhone || "").replace(/\D/g, "") ||
    rawText.match(/(?:\+91[-\s]?)?([6-9]\d{9})/)?.[1] ||
    null;

  if (!phone) {
    return { phone: null };
  }

  const visitorSeed = `${input.forwardedFor}|${input.userAgent}|${input.listingId}`;
  const visitorId = `public:${createHash("sha256").update(visitorSeed).digest("hex").slice(0, 24)}`;

  await supabaseAdmin
    .from("wa_click_events")
    .insert({
      listing_id: input.listingId,
      broker_phone: phone.slice(-10),
      user_id: visitorId,
      workspace_id: String((row as any).tenant_id || "public"),
      source: "www",
      device: /mobile|android|iphone|ipad/i.test(input.userAgent) ? "mobile" : "web",
    })
    .maybeSingle();

  return { phone: phone.slice(-10) };
}

export async function createPublicLead(input: {
  listingId: string;
  name: string;
  phone: string;
  referer: string;
  hostname: string;
  userAgent: string | null;
}) {
  if (!supabaseAdmin) {
    return "unavailable";
  }

  const normalizedPhone = normalizeIndianPhone(input.phone);
  if (!input.listingId || input.name.trim().length < 2 || !normalizedPhone) {
    return "error";
  }

  const { data: listing } = await supabaseAdmin
    .from("stream_items")
    .select("id, tenant_id, locality, parsed_payload")
    .eq("id", input.listingId)
    .maybeSingle();

  if (!listing) {
    return "missing";
  }

  const { error: insertError } = await supabaseAdmin.from("public_property_leads").insert({
    stream_item_id: listing.id,
    broker_tenant_id: listing.tenant_id,
    lead_name: input.name.trim(),
    lead_phone: normalizedPhone,
    source_path: input.referer,
    payload: {
      listingTitle: String((listing as any).parsed_payload?.displayTitle || ""),
      locality: String((listing as any).locality || ""),
      submittedFrom: input.hostname,
      userAgent: input.userAgent,
    },
  });

  return insertError ? "save-error" : "ok";
}

export function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(normalized)) return null;
  return normalized;
}

function generateListingSlug(listing: { bhk: string; localitySlug: string; type: string; id: string }) {
  const shortId = listing.id.replace(/-/g, "").slice(-8);
  const bhkPart = slugifyBhk(listing.bhk);
  return `${bhkPart}-in-${listing.localitySlug}-${listing.type}-${shortId}`;
}

function slugifyBhk(bhk: string) {
  const match = bhk.match(/^(\d+(?:\.\d+)?)/);
  return match ? `${match[1]}-bhk` : bhk.toLowerCase().replace(/\s+/g, "-");
}

function normalizeListing(row: any, paidBrokerMap: Map<string, { phone: string; fullName: string | null }>): PublicListing | null {
  const data = (row.structured_data || {}) as Record<string, unknown>;
  const rawText = String(row.raw_text || "");
  const title = pickString(data.title, data.name, data.displayTitle) || inferTitle(rawText) || "Property Listing";
  const location =
    pickString(data.location, data.locality, data.locality_canonical, data.address, data.area) ||
    inferLocation(rawText);
  const locality = normalizeLocality(location || "");
  if (!isListableLocation(locality)) return null;
  const bhk = pickString(data.bhk, data.layout, data.property_type) || inferBhk(rawText) || "Flexible";
  const type = normalizeType(pickString(data.type, data.deal_type, data.intent, data.category), rawText);
  const priceAmount = parsePriceAmount(data.price_numeric, data.price, rawText, type);
  const floor = pickString(data.floor, data.floor_number) || null;
  const furnishing = pickString(data.furnishing, data.furnished) || null;
  const areaSqft = parseAreaSqft(data.area_sqft, data.carpet_area, data.area);
  const availability = pickString(data.availability, data.available_from, data.possession) || null;
  const brokerDigits = digitsOnly(
    pickString(data.contact_number, data.phone, data.contactPhone, data.sourcePhone) || extractPhone(rawText)
  );
  const fallbackBroker = brokerDigits ? paidBrokerMap.get(brokerDigits) : null;
  const slug = generateListingSlug({
    bhk,
    localitySlug: slugifyLocality(locality),
    type: type.toLowerCase(),
    id: row.id,
  });

  return {
    id: row.id,
    title,
    price: priceAmount || 0,
    locality,
    type: type as "Rent" | "Sale" | "Requirement",
    bhk,
    area_sqft: areaSqft || undefined,
    furnishing: furnishing || undefined,
    availability: availability || undefined,
    raw_text: rawText,
    created_at: row.created_at,
    slug,
    floor: floor || undefined,
    broker_phone: brokerDigits ? `91${fallbackBroker?.phone || brokerDigits}` : undefined,
  };
}

function normalizeStreamListing(row: any, paidBrokerMap: Map<string, { phone: string; fullName: string | null }>): PublicListing | null {
  const data = (row.parsed_payload || {}) as Record<string, unknown>;
  const rawText = String(row.raw_text || "");
  const title =
    pickString(data.displayTitle, data.title, data.buildingName, data.microLocation) ||
    inferTitle(rawText) ||
    "Property Listing";
  const location =
    pickString(row.locality, data.locality, data.microLocation, data.buildingName, row.city) ||
    inferLocation(rawText);
  const locality = normalizeLocality(location || "");
  if (!isListableLocation(locality)) return null;
  const bhk = pickString(row.bhk, data.bhk) || inferBhk(rawText) || "Flexible";
  const type = normalizeType(pickString(row.type, row.deal_type, data.type, data.deal_type), rawText);
  const priceAmount = parsePriceAmount(row.price_numeric, row.price_label, rawText, type);
  const floor = pickString((data as any).floor_number, (data as any).floorNumber) || null;
  const furnishing = pickString(data.furnishing) || null;
  const areaSqft = parseAreaSqft(row.area_sqft, data.area_sqft, data.areaSqft);
  const availability = pickString(data.availability, data.available_from, data.possession) || null;
  const brokerDigits = digitsOnly(
    pickString(row.source_phone, data.contactPhone, data.sourcePhone) || extractPhone(rawText)
  );
  const fallbackBroker = brokerDigits ? paidBrokerMap.get(brokerDigits) : null;
  const slug = generateListingSlug({
    bhk,
    localitySlug: slugifyLocality(locality),
    type: type.toLowerCase(),
    id: row.id,
  });

  return {
    id: row.id,
    title,
    price: priceAmount || 0,
    locality,
    type: type as "Rent" | "Sale" | "Requirement",
    bhk,
    area_sqft: areaSqft || undefined,
    furnishing: furnishing || undefined,
    availability: availability || undefined,
    raw_text: rawText,
    created_at: row.created_at,
    slug,
    floor: floor || undefined,
    broker_phone: brokerDigits ? `91${fallbackBroker?.phone || brokerDigits}` : undefined,
  };
}

function inferTitle(rawText: string) {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 8 && !line.includes("http")) || null;
}

function inferLocation(rawText: string) {
  const LOCALITIES = [
    "bandra", "powai", "andheri", "worli", "thane", "juhu", "goregaon", "malad",
    "chembur", "dadar", "khar", "colaba", "marine lines", "churchgate", "nariman point",
    "fort", "kalbadevi", "byculla", "mahim", "matunga", "sion", "kings circle",
    "wadala", "parel", "lower parel", "prabhadevi", "santacruz", "vile parle",
    "versova", "jogeshwari", "kandivali", "borivali", "dahisar", "mulund",
    "bhandup", "vikhroli", "kanjurmarg", "ghatkopar", "powai", "nerul",
    "vashi", "sanpada", "ghansoli", "koparkhairane", "airoli", "panvel",
    "kharghar", "kamothe", "kalamboli", "taloja", "dombivli", "kalyan",
    "ulhasnagar", "ambarnath", "badlapur", "mira road", "bhayandar",
    "vasai", "nalasopara", "virar", "palghar", "lonavala", "khandala",
  ];
  const lower = rawText.toLowerCase();
  const matched = LOCALITIES.find((loc) => lower.includes(loc));
  if (matched) {
    return matched.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return null;
}

function normalizeLocality(value: string) {
  const trimmed = value.split(",")[0]?.trim() || value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (/not parsed|unknown|n\/?a|location|undefined|null/.test(lower)) return null;
  return trimmed.replace(/\b\w/g, (char) => char.toUpperCase());
}

function isListableLocation(locality: string | null): locality is string {
  return locality !== null && locality.length >= 3;
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

function normalizeType(value: string | null, rawText: string): string {
  const lower = `${value || ""} ${rawText}`.toLowerCase();
  if (lower.includes("requirement")) return "Requirement";
  if (lower.includes("rent") || lower.includes("lease") || lower.includes("l/l")) return "Rent";
  return "Sale";
}

function parsePriceAmount(value: unknown, priceLabel: unknown, rawText: string, type: string) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const merged = `${String(priceLabel || "")} ${rawText}`;
  const candidates = [...merged.matchAll(/₹?\s*(\d+(?:\.\d+)?)\s*(cr|crore|l|lac|lakh|k|thousand)?/gi)]
    .filter((match) => Number.isFinite(Number(match[1])))
    .map((match) => {
      let amount = Number(match[1]);
      const unit = String(match[2] || "").toLowerCase();
      if (unit === "cr" || unit === "crore") amount *= 10000000;
      else if (unit === "l" || unit === "lac" || unit === "lakh") amount *= 100000;
      else if (unit === "k" || unit === "thousand") amount *= 1000;
      else if (type === "Sale" && amount < 1000) amount *= 100000;

      const idx = match.index || 0;
      const before = merged.slice(Math.max(0, idx - 25), idx).toLowerCase();
      const after = merged.slice(idx + match[0].length, idx + match[0].length + 15).toLowerCase();

      let score = 0;
      if (unit) score += 8;
      if (/₹/.test(before)) score += 7;
      if (/rent|price|lease|sale|deposit|advance|cost/i.test(before)) score += 6;
      if (amount > 500) score += 2;
      if (amount >= 5000 && amount <= 100000000) score += 3;
      if (/sq\s*ft|sqft|sq|acres?|hectare/i.test(after)) score -= 10;
      if (/bhk|room|bed/i.test(after)) score -= 8;
      if (/contact|call|phone|mobile/i.test(after)) score -= 10;

      return { amount: Math.round(amount), score };
    });

  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a), { amount: 0, score: -999 });
  if (best.score < 0) return null;
  return best.amount;
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text && text !== "null" && text !== "undefined") return text;
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

function slugifyLocality(locality: string) {
  return locality.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
