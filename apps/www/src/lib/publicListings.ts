import { createHash } from "crypto";
import { parsePrice } from "@propai/price-parser";
import { supabaseAdmin } from "@/lib/supabase.server";
import { neighbouringLocalities, slugifyLocalityName } from "../../lib/localities";

// Standard locality names from mumbai-localities.ts (API side)
const STANDARD_LOCALITIES = new Set([
  "Bandra West",
  "Bandra East",
  "Juhu",
  "Worli",
  "Lower Parel",
  "Prabhadevi",
  "Dadar",
  "Mahalaxmi",
  "Marine Drive",
  "Malabar Hill",
  "Colaba",
  "Nariman Point",
  "Andheri West",
  "Andheri East",
  "Versova",
  "Powai",
  "Vikhroli",
  "Ghatkopar West",
  "Ghatkopar East",
  "Mulund West",
  "Mulund East",
  "Thane West",
  "Thane East",
  "Borivali West",
  "Borivali East",
  "Malad West",
  "Malad East",
  "Goregaon West",
  "Goregaon East",
  "Kandivali West",
  "Kandivali East",
  "Dahisar West",
  "Dahisar East",
  "Mira Road",
  "Bhayander",
  "Khar West",
  "Khar East",
  "Santacruz West",
  "Santacruz East",
  "Vile Parle West",
  "Vile Parle East",
  "Sion",
  "Kurla",
  "Chembur",
  "Vashi",
  "Nerul",
  "Kharghar",
  "Panvel",
  "Airoli",
  "Ghansoli",
  "Dombivali",
  "Kalyan",
  "Oshiwara",
  "Lokhandwala",
  "Hiranandani Gardens",
]);

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

  const [{ data: streamItems, error: streamError }, { data: profiles }] = await Promise.all([
    supabaseAdmin
      .from("stream_items")
      .select("id, tenant_id, type, deal_type, record_type, locality, city, bhk, area_sqft, price_label, price_numeric, confidence_score, source_phone, raw_text, created_at, parsed_payload, property_category, asset_class")
      .neq("record_type", "buyer_requirement")
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("profiles").select("id, phone, full_name"),
  ]);

  if (streamError) {
    throw new Error(streamError.message);
  }

  const brokerMap = new Map<string, { phone: string; fullName: string | null }>();
  for (const row of profiles || []) {
    const digits = digitsOnly((row as any).phone);
    if (!digits) continue;
    brokerMap.set(digits, { phone: digits, fullName: (row as any).full_name || null });
  }

  const listings = ((streamItems || []) as any[])
    .filter((row) => row.tenant_id)
    .filter((row) => {
      const locality = String(row.locality || '').trim().toLowerCase();
      if (['mumbai market', 'mumbai', 'navi mumbai', 'thane', 'pune'].includes(locality)) return false;
      return true;
    })
    .filter((row) => {
      const label = String(row.price_label || "");
      const text = String(row.raw_text || "");
      const type = String(row.type || row.deal_type || "");
      const lower = `${type} ${text}`.toLowerCase();
      if (lower.includes("requirement")) return false;
      if (/[â¹]/.test(label)) return false;
      return true;
    })
    .filter((row) => {
      const price = Number(row.price_numeric);
      const type = String(row.type || row.deal_type || "").toLowerCase();
      if (!Number.isFinite(price) || price <= 0) return true;
      if (type.includes("rent") && price > 5_000_000) return false;  // rent > 50L/mo = encoding artifact
      if (type.includes("rent") && price < 5_000) return false;      // rent < 5K/mo = not real
      if (type.includes("sale") && price > 500_000_000) return false; // sale > 500Cr = encoding artifact
      return true;
    })
    .filter((row) => {
      const isCommercial = String(row.property_category || '').trim() === 'commercial' || String(row.asset_class || '').trim() === 'commercial';
      if (isCommercial) return true;
      const isJunk = String(row.bhk || '').trim() === 'N/A'
        && (row.area_sqft == null || Number(row.area_sqft) === 0)
        && (row.confidence_score == null || Number(row.confidence_score) < 0.3);
      return !isJunk;
    })
    .map((row) => normalizeStreamListing(row, brokerMap))
    .filter(Boolean);

  return dedupePublicListings(listings as PublicListing[]);
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

  if (!isTitleWorthyPublicListing({
    title,
    locality,
    type,
    bhk,
    areaSqft,
    price: priceAmount,
    availability,
    rawText,
  })) {
    return null;
  }

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

  if (!isTitleWorthyPublicListing({
    title,
    locality,
    type,
    bhk,
    areaSqft,
    price: priceAmount,
    availability,
    rawText,
  })) {
    return null;
  }

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

function isTitleWorthyPublicListing(input: {
  title: string;
  locality: string;
  type: string;
  bhk?: string | number | null;
  areaSqft?: number | null;
  price?: number | null;
  availability?: string | null;
  rawText: string;
}) {
  const title = String(input.title || "").trim();
  const locality = String(input.locality || "").trim();
  const rawText = String(input.rawText || "").trim();
  if (title.length < 12 || locality.length < 3) return false;
  if (/^(property listing|broker-sourced property)$/i.test(title)) return false;

  const normalizedTitle = normalizeListingText(title);
  const normalizedRaw = normalizeListingText(rawText);
  const titleKeywords = `${normalizedTitle} ${normalizedRaw}`;
  const hasTypeSignal = /\b(rent|sale|lease|requirement|wanted|office|shop|warehouse|plot|land|flat|apartment|villa|penthouse|studio|commercial|residential|pg|bare shell)\b/i.test(titleKeywords);
  const hasSubstance = Boolean(
    (typeof input.bhk === "string" && input.bhk.trim() && !/^flexible$/i.test(input.bhk.trim())) ||
    (typeof input.bhk === "number" && Number.isFinite(input.bhk)) ||
    (typeof input.areaSqft === "number" && Number.isFinite(input.areaSqft) && input.areaSqft > 0) ||
    (typeof input.price === "number" && Number.isFinite(input.price) && input.price > 0) ||
    String(input.availability || "").trim()
  );

  if (!hasTypeSignal || !hasSubstance) return false;
  if (normalizedRaw.length < 20) return false;

  return true;
}

function parsePriceAmount(value: unknown, priceLabel: unknown, rawText: string, type: string) {
  const combinedText = `${String(priceLabel || "")} ${rawText}`.trim();
  const parsedNumeric = parsePrice(combinedText, type).numeric;

  if (type === "Rent") {
    const contextualRent = parseRentPriceAmount(combinedText);
    if (contextualRent) return contextualRent;
  }

  if (typeof value === "number" && Number.isFinite(value)) return value;
  return parsedNumeric;
}

function parseRentPriceAmount(text: string) {
  const patterns = [
    /(?:rent|lease|asking|for rent|available for rent)[^\d]{0,24}(?:rs\.?|inr|₹)?\s*([\d.]+)\s*(cr|crore|l|lac|lakh|k|thousand)?/ig,
    /(?:rs\.?|inr|₹)?\s*([\d.]+)\s*(cr|crore|l|lac|lakh|k|thousand)?\s*(?:\/\s*month|per\s*month|monthly|pm|p\.m\.|rent)\b/ig,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const amount = convertPriceToken(match[1], match[2]);
      if (amount != null && amount >= 5_000 && amount <= 5_000_000) {
        return amount;
      }
    }
  }

  return null;
}

function convertPriceToken(amountText: string, unitText?: string) {
  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = String(unitText || "").toLowerCase();
  if (unit === "cr" || unit === "crore") return amount * 10_000_000;
  if (unit === "l" || unit === "lac" || unit === "lakh") return amount * 100_000;
  if (unit === "k" || unit === "thousand") return amount * 1_000;
  return amount;
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

function dedupePublicListings(listings: PublicListing[]) {
  const seen = new Set<string>();
  const deduped: PublicListing[] = [];

  for (const listing of listings) {
    const key = [
      listing.type.toLowerCase(),
      normalizeListingText(listing.locality),
      normalizeListingText(listing.title),
      normalizeListingText(String(listing.bhk || "")),
      String(Math.round(Number(listing.price || 0))),
      normalizeListingText(listing.broker_phone || ""),
      normalizeListingText(listing.raw_text).slice(0, 180),
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(listing);
  }

  return deduped;
}

function normalizeListingText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function fetchTodayParsedCount(): Promise<number> {
  if (!supabaseAdmin) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count } = await supabaseAdmin
    .from("stream_items")
    .select("*", { count: "exact", head: true })
    .gte("created_at", today.toISOString());
  return count || 0;
}

export type CityLocality = {
  city: string;
  localities: {
    name: string;
    slug: string;
    count: number;
    related: { name: string; slug: string; count: number }[];
  }[];
};

const FOOTER_KNOWN_LOCALITIES = new Set([
  "bandra west", "bandra east", "khar west", "khar", "santacruz west", "santacruz east",
  "vile parle", "andheri west", "andheri east", "juhu", "versova", "goregaon west", "goregaon east",
  "malad west", "malad east", "kandivali west", "kandivali east", "borivali west", "borivali east",
  "dahisar", "powai", "worli", "lower parel", "prabhadevi", "dadar west", "dadar east",
  "mahim", "matunga", "sion", "chembur", "ghatkopar", "vikhroli", "kanjurmarg", "bhandup",
  "mulund", "colaba", "marine lines", "churchgate", "nariman point", "fort", "byculla",
  "wadala", "parel", "jogeshwari", "mira road", "bhayandar", "vasai", "nalasopara", "virar", "palghar",
  "thane west", "thane east", "dombivli", "kalyan", "ulhasnagar", "ambarnath", "badlapur",
  "nerul", "vashi", "sanpada", "ghansoli", "koparkhairane", "airoli", "panvel",
  "kharghar", "kamothe", "kalamboli", "taloja",
  "pimpri-chinchwad", "kharadi", "wakad", "hinjewadi", "baner", "aundh",
  "lonavala", "khandala",
]);

const CITY_LOOKUP: [RegExp, string][] = [
  [/^thane/i, "Thane"],
  [/^dombivli|^kalyan|^ulhasnagar|^ambarnath|^badlapur/i, "Thane"],
  [/^nerul|^vashi|^sanpada|^ghansoli|^koparkhairane|^airoli|^panvel|^kharghar|^kamothe|^kalamboli|^taloja/i, "Navi Mumbai"],
  [/^pimpri|^kharadi|^wakad|^hinjewadi|^baner|^aundh/i, "Pune"],
];

function inferFooterCity(locality: string, dbCity: string | null): string {
  if (dbCity && !/unknown|null/i.test(dbCity) && dbCity.length > 2) return dbCity;
  for (const [pattern, city] of CITY_LOOKUP) {
    if (pattern.test(locality)) return city;
  }
  return "Mumbai";
}

function isValidFooterLocality(name: string): boolean {
  const lower = name.toLowerCase().trim();
  if (lower.length < 3) return false;
  if (/not parsed|unknown|n\/?a|location|undefined|null/.test(lower)) return false;
  if (/\b(project|chsl|wing|floor|sqft|bhk|furnish|avenue|building|tower|phase)\b/i.test(name)) return false;
  if (/^(we have|offering|semi furnished|fully furnished|partly furnished|unfurnished|balcony|area|legal|kids|making|can remove|for family|close to|a wing|a swimming|auditors|well|kitchen|icecream|cs no)\b/i.test(name)) return false;
  if (/^[a-z]\s+wing\b/i.test(name)) return false;
  // Must be in standard locality whitelist
  if (!STANDARD_LOCALITIES.has(name.trim())) return false;
  return name.length >= 4;
}

export async function fetchLocalitiesForFooter(minCount = 2): Promise<CityLocality[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("stream_items")
      .select("city, locality")
      .not("locality", "is", null)
      .neq("locality", "")
      .limit(5000);
    if (error || !data) return [];
    const raw = (data as any[]).reduce<Record<string, { name: string; slug: string; city: string | null; count: number }>>((acc, row) => {
      const loc = String(row.locality || "").trim();
      if (!isValidFooterLocality(loc)) return acc;
      const key = loc.toLowerCase();
      if (!acc[key]) acc[key] = {
        name: loc.replace(/\b\w/g, (c) => c.toUpperCase()),
        slug: slugifyLocalityName(loc),
        city: String(row.city || "").trim() || null,
        count: 0,
      };
      acc[key].count++;
      return acc;
    }, {} as Record<string, { name: string; slug: string; city: string | null; count: number }>);
    const cityMap = new Map<string, { name: string; slug: string; count: number; related: { name: string; slug: string; count: number }[] }[]>();
    for (const [key, val] of Object.entries(raw) as [string, { name: string; slug: string; city: string | null; count: number }][]) {
      if (val.count < minCount) continue;
      const city = inferFooterCity(key, val.city);
      if (!cityMap.has(city)) cityMap.set(city, []);
      const related = neighbouringLocalities(val.slug, 2)
        .map((locality) => {
          const relatedKey = locality.name.toLowerCase();
          const relatedRow = raw[relatedKey];
          if (!relatedRow) return null;
          return {
            name: relatedRow.name,
            slug: relatedRow.slug,
            count: relatedRow.count,
          };
        })
        .filter((item): item is { name: string; slug: string; count: number } => Boolean(item));

      cityMap.get(city)!.push({ name: val.name, slug: val.slug, count: val.count, related });
    }
    const result: CityLocality[] = [];
    const CITIES = ["Mumbai", "Thane", "Navi Mumbai", "Pune"];
    const sortMap = new Map(CITIES.map((c, i) => [c, i]));
    for (const [city, localities] of cityMap) {
      localities.sort((a, b) => b.count - a.count);
      result.push({ city, localities });
    }
    result.sort((a, b) => (sortMap.get(a.city) ?? 99) - (sortMap.get(b.city) ?? 99));
    return result;
  } catch {
    return [];
  }
}

function slugifyLocality(locality: string) {
  return locality.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
