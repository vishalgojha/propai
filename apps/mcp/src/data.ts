import { supabase } from "./supabase.js";
import { formatBudgetRange, igrSummary, toNumber } from "./format.js";
import type { IgrTransaction, LocalityStats, PublicListing } from "./types.js";

const PUBLIC_LISTING_COLUMNS =
  "source_message_id, source_group_name, listing_type, area, sub_area, location, price, price_type, size_sqft, furnishing, bhk, property_type, title, description, raw_message, cleaned_message, primary_contact_name, primary_contact_number, primary_contact_wa, message_timestamp, created_at";

function clampLimit(limit: number | undefined, fallback = 10, max = 50) {
  if (!limit || !Number.isFinite(limit)) return fallback;
  return Math.min(Math.max(Math.floor(limit), 1), max);
}

function applyLocality(query: any, locality?: string, city?: string) {
  const terms = [locality, city].map((value) => value?.trim()).filter(Boolean) as string[];
  for (const term of terms) {
    query = query.or(`area.ilike.%${term}%,sub_area.ilike.%${term}%,location.ilike.%${term}%,search_text.ilike.%${term}%`);
  }
  return query;
}

function applyBudget(query: any, maxBudgetCr?: number) {
  if (maxBudgetCr == null) return query;
  return query.lte("price", maxBudgetCr);
}

function applyListingType(query: any, requested?: string, fallback?: string) {
  const type = requested === "all" ? undefined : requested || fallback;
  if (!type) return query;
  if (type === "rent" || type === "lease") {
    return query.or(`listing_type.ilike.%${type}%,price_type.eq.monthly,property_type.ilike.%${type}%`);
  }
  return query.or(`listing_type.ilike.%${type}%,property_type.ilike.%${type}%`);
}

export async function logToolCall(brokerId: string | undefined, toolName: string, input: unknown) {
  console.log(JSON.stringify({ event: "mcp_tool_call", broker_id: brokerId || null, tool: toolName }));

  try {
    await supabase.from("agent_events").insert({
      tenant_id: brokerId,
      event_type: "mcp_tool_call",
      description: `MCP tool called: ${toolName}`,
      metadata: { input },
    });
  } catch (error) {
    console.warn("Failed to write MCP analytics event:", error instanceof Error ? error.message : error);
  }
}

export async function searchPublicListings(input: {
  locality?: string;
  city?: string;
  property_type?: "sale" | "rent" | "lease" | "all";
  bhk?: number;
  max_budget_cr?: number;
  budget_min_cr?: number;
  budget_max_cr?: number;
  listingKind?: "listing" | "requirement";
  limit?: number;
}) {
  const limit = clampLimit(input.limit);
  let query = supabase
    .from("public_listings")
    .select(PUBLIC_LISTING_COLUMNS)
    .order("message_timestamp", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (input.listingKind) {
    query = query.ilike("listing_type", `%${input.listingKind}%`);
  }

  query = applyLocality(query, input.locality, input.city);
  query = applyListingType(query, input.property_type);

  if (input.bhk != null) {
    query = query.eq("bhk", input.bhk);
  }

  query = applyBudget(query, input.max_budget_cr ?? input.budget_max_cr);

  if (input.budget_min_cr != null) {
    query = query.gte("price", input.budget_min_cr);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    ...row,
    price: toNumber(row.price),
    size_sqft: toNumber(row.size_sqft),
    bhk: toNumber(row.bhk),
  })) as PublicListing[];
}

export async function getFreshStream(input: { hours?: number; city?: string; limit?: number }) {
  const hours = Math.min(Math.max(input.hours ?? 6, 1), 168);
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  let query = supabase
    .from("public_listings")
    .select(PUBLIC_LISTING_COLUMNS)
    .gte("message_timestamp", since)
    .order("message_timestamp", { ascending: false, nullsFirst: false })
    .limit(clampLimit(input.limit, 20, 100));

  query = applyLocality(query, undefined, input.city);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    ...row,
    price: toNumber(row.price),
    size_sqft: toNumber(row.size_sqft),
    bhk: toNumber(row.bhk),
  })) as PublicListing[];
}

export async function getLastTransactionForBuilding(buildingName: string) {
  const name = buildingName.trim();
  if (!name) return null;

  const { data, error } = await supabase
    .from("igr_transactions")
    .select("doc_number, reg_date, building_name, locality, consideration, area_sqft, price_per_sqft, config")
    .ilike("building_name", `%${name}%`)
    .order("reg_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    ...data,
    consideration: toNumber(data.consideration),
    area_sqft: toNumber(data.area_sqft),
    price_per_sqft: toNumber(data.price_per_sqft),
  } as IgrTransaction;
}

export async function getLocalityStats(locality: string, months = 6): Promise<LocalityStats | null> {
  const name = locality.trim();
  if (!name) return null;

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);

  const { data, error } = await supabase
    .from("igr_transactions")
    .select("consideration, price_per_sqft, locality")
    .ilike("locality", `%${name}%`)
    .gte("reg_date", cutoffDate.toISOString().slice(0, 10))
    .order("reg_date", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = data || [];
  const priceValues = rows.map((row) => toNumber(row.price_per_sqft)).filter((value): value is number => value != null);
  const considerationValues = rows.map((row) => toNumber(row.consideration)).filter((value): value is number => value != null);

  return {
    locality: name,
    months,
    avg_price_per_sqft: priceValues.length ? Math.round(priceValues.reduce((sum, value) => sum + value, 0) / priceValues.length) : null,
    median_consideration: median(considerationValues),
    min_consideration: considerationValues.length ? Math.min(...considerationValues) : null,
    max_consideration: considerationValues.length ? Math.max(...considerationValues) : null,
    transaction_count: rows.length,
  };
}

export async function getIgrPrice(input: { building_name?: string; locality?: string }) {
  const transaction = input.building_name ? await getLastTransactionForBuilding(input.building_name) : null;
  const statsLocality = transaction?.locality || input.locality || "";
  const stats = statsLocality ? await getLocalityStats(statsLocality, 6) : null;

  return {
    transaction,
    locality_stats: stats,
    summary: igrSummary(transaction, stats, input.building_name, input.locality),
  };
}

export function describeSearch(input: {
  locality?: string;
  city?: string;
  bhk?: number;
  max_budget_cr?: number;
  budget_min_cr?: number;
  budget_max_cr?: number;
}) {
  const place = [input.locality, input.city].filter(Boolean).join(", ") || "all areas";
  const bhk = input.bhk ? `${input.bhk}BHK ` : "";
  const budget = formatBudgetRange(input.budget_min_cr, input.max_budget_cr ?? input.budget_max_cr);
  return `${bhk}${place}, ${budget}`;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}
