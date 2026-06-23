import { supabaseAdmin } from "../src/lib/supabase.server";
import { TOP_LOCALITIES } from "./localities";

export type StreamMarketItem = {
  id: string;
  type: string | null;
  deal_type?: string | null;
  bhk: string | null;
  price_label: string | null;
  price_numeric: number | null;
  locality: string | null;
  city?: string | null;
  record_type?: string | null;
  property_category?: string | null;
  asset_class?: string | null;
  created_at: string;
  raw_text?: string | null;
  parsed_payload?: Record<string, unknown> | null;
};

export type MarketInsight = {
  id: string;
  slug: string;
  locality: string;
  title: string;
  summary: string;
  listing_count: number;
  requirement_count: number;
  avg_price_numeric: number | null;
  min_price_numeric: number | null;
  max_price_numeric: number | null;
  demand_signal: "high_demand" | "good_supply" | "active" | string | null;
  period_label: string;
  period_start: string;
  period_end: string;
  published_at: string;
  created_at?: string;
};

const STREAM_MARKET_SELECT = "id, type, deal_type, bhk, price_label, price_numeric, locality, city, record_type, property_category, asset_class, created_at, raw_text, parsed_payload";
const RESIDENTIAL_STREAM_SELECT = STREAM_MARKET_SELECT;
const COMMERCIAL_STREAM_SELECT = STREAM_MARKET_SELECT.replace(", bhk", "");

export function isRequirementType(type?: string | null) {
  return String(type || "").toLowerCase().includes("requirement");
}

export async function fetchLocalityStreamItems(localityName: string, days = 30, limit = 100): Promise<StreamMarketItem[]> {
  if (!supabaseAdmin) return [];

  try {
    const normalizedLocality = normalizeLocalityQuery(localityName);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    return fetchSplitStreamMarketItems({
      normalizedLocality,
      limit,
      applyWindow: (query) => query.gte("created_at", since),
      errorLabel: "locality stream items",
    });
  } catch (error) {
    console.error("[www] Locality stream fetch crashed", error);
    return [];
  }
}

export async function fetchInsightStreamItems(localityName: string, periodStart: string, periodEnd: string) {
  if (!supabaseAdmin) return [];

  try {
    const normalizedLocality = normalizeLocalityQuery(localityName);
    return fetchSplitStreamMarketItems({
      normalizedLocality,
      limit: 200,
      applyWindow: (query) => query.gte("created_at", periodStart).lte("created_at", periodEnd),
      errorLabel: "insight stream items",
    });
  } catch (error) {
    console.error("[www] Insight stream fetch crashed", error);
    return [];
  }
}

async function fetchSplitStreamMarketItems(input: {
  normalizedLocality: string | null;
  limit: number;
  applyWindow: (query: any) => any;
  errorLabel: string;
}): Promise<StreamMarketItem[]> {
  const buildQuery = (table: "stream_items_residential" | "stream_items_commercial", select: string) => {
    let query = supabaseAdmin
      .from(table)
      .select(select)
      .order("created_at", { ascending: false })
      .limit(input.limit);

    query = input.applyWindow(query);

    if (input.normalizedLocality) {
      query = query.eq("locality", input.normalizedLocality);
    }

    return query;
  };

  const [residentialResult, commercialResult] = await Promise.all([
    buildQuery("stream_items_residential", RESIDENTIAL_STREAM_SELECT),
    buildQuery("stream_items_commercial", COMMERCIAL_STREAM_SELECT),
  ]);

  if (residentialResult.error) {
    console.error(`[www] Failed to fetch ${input.errorLabel} from residential stream`, residentialResult.error);
  }
  if (commercialResult.error) {
    console.error(`[www] Failed to fetch ${input.errorLabel} from commercial stream`, commercialResult.error);
  }

  return [
    ...(((residentialResult.data || []) as any[]).map(toStreamMarketItem)),
    ...(((commercialResult.data || []) as any[]).map(toStreamMarketItem)),
  ]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, input.limit);
}

export async function fetchMarketInsights(limit = 200): Promise<MarketInsight[]> {
  if (!supabaseAdmin) return [];

  try {
    const { data, error } = await supabaseAdmin
      .from("market_insights")
      .select("id, slug, locality, title, summary, listing_count, requirement_count, avg_price_numeric, min_price_numeric, max_price_numeric, demand_signal, period_label, period_start, period_end, published_at, created_at")
      .order("published_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[www] Failed to fetch market insights", error);
      return [];
    }

    return ((data || []) as any[]).map(toMarketInsight);
  } catch (error) {
    console.error("[www] Market insights fetch crashed", error);
    return [];
  }
}

export async function fetchMarketInsightBySlug(slug: string): Promise<MarketInsight | null> {
  if (!supabaseAdmin) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from("market_insights")
      .select("id, slug, locality, title, summary, listing_count, requirement_count, avg_price_numeric, min_price_numeric, max_price_numeric, demand_signal, period_label, period_start, period_end, published_at, created_at")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error("[www] Failed to fetch market insight", error);
      return null;
    }

    return data ? toMarketInsight(data as any) : null;
  } catch (error) {
    console.error("[www] Market insight fetch crashed", error);
    return null;
  }
}

export async function fetchRelatedInsights(locality: string, currentSlug: string, limit = 3) {
  if (!supabaseAdmin) return [];

  try {
    const { data, error } = await supabaseAdmin
      .from("market_insights")
      .select("id, slug, locality, title, summary, listing_count, requirement_count, avg_price_numeric, min_price_numeric, max_price_numeric, demand_signal, period_label, period_start, period_end, published_at, created_at")
      .eq("locality", locality)
      .neq("slug", currentSlug)
      .order("published_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[www] Failed to fetch related insights", error);
      return [];
    }

    return ((data || []) as any[]).map(toMarketInsight);
  } catch (error) {
    console.error("[www] Related insights fetch crashed", error);
    return [];
  }
}

export function splitSupplyDemand(items: StreamMarketItem[]) {
  return {
    listings: items.filter((item) => !isRequirementType(item.type)),
    requirements: items.filter((item) => isRequirementType(item.type)),
  };
}

export function numericPrices(items: StreamMarketItem[]) {
  return items
    .map((item) => item.price_numeric)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
}

export function getMostCommonBhk(items: StreamMarketItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = normalizeBhk(item.bhk);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "1-4 BHK";
}

export function groupByBhk(items: StreamMarketItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = normalizeBhk(item.bhk) || "Flexible";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function groupRequirementsByBudget(items: StreamMarketItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = budgetRangeLabel(item.price_numeric);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function formatPriceShort(value?: number | null) {
  if (!value || !Number.isFinite(value) || value <= 0) return "Price on request";
  if (value >= 10_000_000) return `₹${trimDecimal(value / 10_000_000)}Cr`;
  if (value >= 100_000) return `₹${trimDecimal(value / 100_000)}L`;
  if (value >= 1_000) return `₹${trimDecimal(value / 1_000)}K`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export function formatPriceRange(min?: number | null, max?: number | null) {
  if (!min && !max) return "Price data updating";
  if (min && max && min !== max) return `${formatPriceShort(min)} - ${formatPriceShort(max)}`;
  return formatPriceShort(min || max || null);
}

export function formatTimeAgo(value?: string | null) {
  if (!value) return "Recently";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Recently";
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatDisplayDate(value?: string | null) {
  if (!value) return "Updating";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Updating";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDisplayDateTime(value?: string | null) {
  if (!value) return "Updating";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Updating";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function demandSignalLabel(signal?: string | null) {
  switch (signal) {
    case "high_demand":
      return "High Demand";
    case "good_supply":
      return "Good Supply";
    default:
      return "Active Market";
  }
}

export function demandSignalClass(signal?: string | null) {
  switch (signal) {
    case "high_demand":
      return "border-blue-500/30 bg-blue-500/10 text-blue-300";
    case "good_supply":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    default:
      return "border-[color:var(--accent-border)] bg-[var(--accent-glow)] text-[var(--accent)]";
  }
}

function toStreamMarketItem(row: any): StreamMarketItem {
  const price = row.price_numeric == null ? null : Number(row.price_numeric);
  return {
    id: String(row.id || ""),
    type: row.type == null ? null : String(row.type),
    deal_type: row.deal_type == null ? null : String(row.deal_type),
    bhk: row.bhk == null ? null : String(row.bhk),
    price_label: row.price_label == null ? null : String(row.price_label),
    price_numeric: Number.isFinite(price) ? price : null,
    locality: row.locality == null ? null : String(row.locality),
    city: row.city == null ? null : String(row.city),
    record_type: row.record_type == null ? null : String(row.record_type),
    property_category: row.property_category == null ? null : String(row.property_category),
    asset_class: row.asset_class == null ? null : String(row.asset_class),
    created_at: String(row.created_at || new Date().toISOString()),
    raw_text: row.raw_text == null ? null : String(row.raw_text),
    parsed_payload: row.parsed_payload && typeof row.parsed_payload === "object" ? row.parsed_payload : null,
  };
}

function toMarketInsight(row: any): MarketInsight {
  return {
    id: String(row.id || ""),
    slug: String(row.slug || ""),
    locality: String(row.locality || "Mumbai"),
    title: String(row.title || "Mumbai property market insight"),
    summary: String(row.summary || "Market data is being refreshed for this locality."),
    listing_count: Math.max(0, Number(row.listing_count) || 0),
    requirement_count: Math.max(0, Number(row.requirement_count) || 0),
    avg_price_numeric: coerceNumber(row.avg_price_numeric),
    min_price_numeric: coerceNumber(row.min_price_numeric),
    max_price_numeric: coerceNumber(row.max_price_numeric),
    demand_signal: row.demand_signal == null ? null : String(row.demand_signal),
    period_label: String(row.period_label || "Recent period"),
    period_start: String(row.period_start || row.published_at || new Date().toISOString()),
    period_end: String(row.period_end || row.published_at || new Date().toISOString()),
    published_at: String(row.published_at || new Date().toISOString()),
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

function normalizeBhk(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (match) return `${match[1]} BHK`;
  if (/studio/i.test(text)) return "Studio";
  return text.replace(/\s+/g, " ");
}

function budgetRangeLabel(value?: number | null) {
  if (!value || !Number.isFinite(value) || value <= 0) return "Budget updating";
  if (value < 100_000) return "Under ₹1L";
  if (value < 250_000) return "₹1L - ₹2.5L";
  if (value < 500_000) return "₹2.5L - ₹5L";
  if (value < 10_000_000) return "₹5L - ₹1Cr";
  if (value < 30_000_000) return "₹1Cr - ₹3Cr";
  return "₹3Cr+";
}

function trimDecimal(value: number) {
  return value.toFixed(value >= 10 ? 1 : 2).replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1");
}

function coerceNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export type LocalityMarketData = {
  locality: string;
  slug: string;
  listingCount: number;
  requirementCount: number;
  avgRent: number | null;
  avgSale: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  topBhk: string | null;
  demandSignal: 'high_demand' | 'balanced' | 'oversupplied';
  brokerCount: number;
  lastActivity: string | null;
};

export async function fetchLocalityMarketData(): Promise<LocalityMarketData[]> {
  if (!supabaseAdmin) return [];

  try {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [resResult, comResult] = await Promise.all([
      supabaseAdmin
        .from('stream_items_residential')
        .select('locality, record_type, bhk, price_numeric, deal_type, created_at, source_phone')
        .gte('created_at', since)
        .not('locality', 'is', null)
        .neq('locality', '')
        .limit(5000),
      supabaseAdmin
        .from('stream_items_commercial')
        .select('locality, record_type, price_numeric, deal_type, created_at, source_phone')
        .gte('created_at', since)
        .not('locality', 'is', null)
        .neq('locality', '')
        .limit(2000),
    ]);

    const rawRows = [
      ...((resResult.data || []) as any[]),
      ...((comResult.data || []) as any[]),
    ];

    const LOCALITY_BLOCKLIST = new Set([
      'mumbai market', 'mumbai', 'navi mumbai', 'thane', 'pune',
      'not parsed', 'unknown', 'n/a',
    ]);

    const byLocality = new Map<string, {
      listings: number;
      requirements: number;
      rents: number[];
      sales: number[];
      bhks: Map<string, number>;
      brokers: Set<string>;
      lastActive: string | null;
      minPrice: number | null;
      maxPrice: number | null;
    }>();

    for (const row of rawRows) {
      const loc = String(row.locality || '').trim().replace(/\b\w/g, (c) => c.toUpperCase());
      if (!loc || loc.length < 3 || LOCALITY_BLOCKLIST.has(loc.toLowerCase())) continue;
      if (/[&@#]/.test(loc)) continue;

      if (!byLocality.has(loc)) {
        byLocality.set(loc, {
          listings: 0,
          requirements: 0,
          rents: [],
          sales: [],
          bhks: new Map(),
          brokers: new Set(),
          lastActive: null,
          minPrice: null,
          maxPrice: null,
        });
      }

      const bucket = byLocality.get(loc)!;
      const type = String(row.type || row.deal_type || '').toLowerCase();
      const recordType = String(row.record_type || '').toLowerCase();

      if (recordType === 'requirement' || type.includes('requirement')) {
        bucket.requirements++;
      } else {
        bucket.listings++;
      }

      const price = Number(row.price_numeric);
      if (Number.isFinite(price) && price > 0) {
        if (type.includes('rent')) {
          if (price < 5_000_000) bucket.rents.push(price);
        } else if (type.includes('sale') || !type.includes('rent')) {
          if (price < 500_000_000) bucket.sales.push(price);
        }
        if (bucket.minPrice === null || price < bucket.minPrice) bucket.minPrice = price;
        if (bucket.maxPrice === null || price > bucket.maxPrice) bucket.maxPrice = price;
      }

      const bhk = String(row.bhk || '').trim();
      if (bhk && bhk !== 'N/A') {
        const match = bhk.match(/(\d+(?:\.\d+)?)/);
        if (match) {
          const key = `${match[1]} BHK`;
          bucket.bhks.set(key, (bucket.bhks.get(key) || 0) + 1);
        }
      }

      if (row.source_phone) {
        bucket.brokers.add(String(row.source_phone));
      }

      const createdAt = String(row.created_at || '');
      if (createdAt && (!bucket.lastActive || createdAt > bucket.lastActive)) {
        bucket.lastActive = createdAt;
      }
    }

    const localities = TOP_LOCALITIES
      .map((loc) => {
        const bucket = byLocality.get(loc.name);
        if (!bucket) return null;

        const total = bucket.listings + bucket.requirements;
        const avgRent = bucket.rents.length > 0
          ? Math.round(bucket.rents.reduce((a, b) => a + b, 0) / bucket.rents.length)
          : null;
        const avgSale = bucket.sales.length > 0
          ? Math.round(bucket.sales.reduce((a, b) => a + b, 0) / bucket.sales.length)
          : null;
        const ratio = bucket.requirements > 0 ? bucket.listings / bucket.requirements : bucket.listings;
        const demandSignal: 'high_demand' | 'balanced' | 'oversupplied' =
          ratio < 0.5 ? 'high_demand'
          : ratio > 2 ? 'oversupplied'
          : 'balanced';
        const topBhk = [...bucket.bhks.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

        return {
          locality: loc.name,
          slug: loc.slug,
          listingCount: bucket.listings,
          requirementCount: bucket.requirements,
          avgRent,
          avgSale,
          minPrice: bucket.minPrice,
          maxPrice: bucket.maxPrice,
          topBhk,
          demandSignal,
          brokerCount: bucket.brokers.size,
          lastActivity: bucket.lastActive,
        };
      })
      .filter((item) => item !== null)
      .sort((a, b) => (b.listingCount + b.requirementCount) - (a.listingCount + a.requirementCount)) as LocalityMarketData[];

    return localities;
  } catch (error) {
    console.error('[www] Failed to fetch locality market data', error);
    return [];
  }
}

function normalizeLocalityQuery(value?: string | null) {
  const text = String(value || "").replace(/\+/g, " ").trim();
  if (!text) return "";
  return text
    .split(",")[0]
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
