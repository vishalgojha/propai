import crypto from "node:crypto";
import { supabase } from "./supabase.js";
import { formatBudgetRange, formatCurrencyCr, formatPerSqft, igrSummary, toNumber } from "./format.js";
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

type LeadRecordInput = {
  brokerId: string;
  name: string;
  phone?: string;
  recordType: "inventory_listing" | "buyer_requirement";
  rawText: string;
  source?: string;
  payload?: Record<string, unknown>;
  budget?: number | null;
  locationHint?: string | null;
  city?: string | null;
  locality?: string | null;
  urgency?: "high" | "medium" | "low" | null;
  priorityBucket?: "P1" | "P2" | "P3" | null;
  priorityScore?: number | null;
};

function normalizePhone(value?: string | null) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return value?.trim() || "";
}

function fallbackLeadId(input: { recordType: string; phone?: string; locality?: string | null; rawText: string }) {
  const hash = crypto.createHash("sha256").update(input.rawText).digest("hex").slice(0, 12);
  return [input.recordType, input.phone || "unknown", input.locality || "na", hash].join(":");
}

function parseBudgetToCr(value?: string | number | null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)\s*(cr|crore|crores|lakh|lakhs|lac|lacs|k|thousand)?/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = (match[2] || "cr").toLowerCase();
  if (["cr", "crore", "crores"].includes(unit)) return amount;
  if (["lakh", "lakhs", "lac", "lacs"].includes(unit)) return amount / 100;
  if (["k", "thousand"].includes(unit)) return amount / 10000;
  return amount;
}

function inferUrgency(text: string): "high" | "medium" | "low" {
  if (/\b(urgent|immediate|today|asap|closing|hot)\b/i.test(text)) return "high";
  if (/\b(this week|soon|priority|follow up)\b/i.test(text)) return "medium";
  return "low";
}

function inferPriorityBucket(urgency: "high" | "medium" | "low"): "P1" | "P2" | "P3" {
  if (urgency === "high") return "P1";
  if (urgency === "medium") return "P2";
  return "P3";
}

function scoreFromUrgency(urgency: "high" | "medium" | "low") {
  if (urgency === "high") return 85;
  if (urgency === "medium") return 68;
  return 52;
}

async function upsertLeadRecord(input: LeadRecordInput) {
  const now = new Date().toISOString();
  const phone = normalizePhone(input.phone);
  const urgency = input.urgency || inferUrgency(input.rawText);
  const priorityBucket = input.priorityBucket || inferPriorityBucket(urgency);
  const priorityScore = input.priorityScore ?? scoreFromUrgency(urgency);
  const locality = input.locality || input.locationHint || null;
  const leadId = fallbackLeadId({
    recordType: input.recordType,
    phone,
    locality,
    rawText: input.rawText,
  });

  const { error } = await supabase.from("lead_records").upsert({
    tenant_id: input.brokerId,
    lead_id: leadId,
    phone: phone || null,
    name: input.name,
    record_type: input.recordType,
    dataset_mode: "mixed",
    budget: input.budget ?? null,
    location_hint: input.locationHint ?? locality,
    city: input.city ?? null,
    city_canonical: input.city ?? null,
    locality_canonical: locality,
    micro_market: locality,
    matched_alias: locality,
    confidence: 0.72,
    unresolved_flag: !locality,
    resolution_method: locality ? "normalized_alias" : "unresolved",
    urgency,
    priority_bucket: priorityBucket,
    priority_score: priorityScore,
    sentiment_score: 0.1,
    intent_score: input.recordType === "buyer_requirement" ? 0.82 : 0.7,
    recency_score: 1,
    sentiment_risk: 0,
    raw_text: input.rawText,
    source: input.source || "mcp",
    payload: input.payload || null,
    created_at: now,
    updated_at: now,
  }, { onConflict: "tenant_id,lead_id" });

  if (error) throw new Error(error.message);

  return {
    lead_id: leadId,
    phone: phone || null,
    priority_bucket: priorityBucket,
    urgency,
    priority_score: priorityScore,
  };
}

export async function saveListingRecord(input: {
  brokerId: string;
  name?: string;
  phone?: string;
  raw_text: string;
  bhk?: string;
  location?: string;
  price?: string;
  carpet_area?: string;
  furnishing?: string;
  possession_date?: string;
  contact_number?: string;
}) {
  const structured = {
    bhk: input.bhk || null,
    location: input.location || null,
    price: input.price || null,
    carpet_area: input.carpet_area || null,
    furnishing: input.furnishing || null,
    possession_date: input.possession_date || null,
    contact_number: normalizePhone(input.contact_number || input.phone) || null,
    source: "mcp",
  };

  const { data, error } = await supabase
    .from("listings")
    .insert({
      tenant_id: input.brokerId,
      source_group_id: "mcp",
      structured_data: structured,
      raw_text: input.raw_text,
    })
    .select("id, created_at")
    .single();

  if (error) throw new Error(error.message);

  const lead = await upsertLeadRecord({
    brokerId: input.brokerId,
    name: input.name || "MCP Listing",
    phone: input.phone || input.contact_number,
    recordType: "inventory_listing",
    rawText: input.raw_text,
    source: "mcp",
    locationHint: input.location || null,
    locality: input.location || null,
    budget: parseBudgetToCr(input.price),
    payload: structured,
  });

  return {
    listing_id: data?.id || null,
    created_at: data?.created_at || null,
    lead,
    listing: structured,
  };
}

export async function createRequirementRecord(input: {
  brokerId: string;
  name?: string;
  phone?: string;
  raw_text: string;
  budget?: string | number;
  location_pref?: string;
  timeline?: string;
  possession?: string;
  bhk_preference?: string[];
  property_type?: string;
  listing_type?: string;
}) {
  const budgetCr = parseBudgetToCr(input.budget);
  const payload = {
    budget: budgetCr,
    location_pref: input.location_pref || null,
    timeline: input.timeline || null,
    possession: input.possession || null,
    bhk_preference: input.bhk_preference || [],
    property_type: input.property_type || null,
    listing_type: input.listing_type || null,
  };

  const lead = await upsertLeadRecord({
    brokerId: input.brokerId,
    name: input.name || "MCP Requirement",
    phone: input.phone,
    recordType: "buyer_requirement",
    rawText: input.raw_text,
    source: "mcp",
    budget: budgetCr,
    locationHint: input.location_pref || null,
    locality: input.location_pref || null,
    payload,
  });

  return {
    requirement: payload,
    lead,
  };
}

export async function scheduleFollowUp(input: {
  brokerId: string;
  lead_id?: string;
  lead_name: string;
  lead_phone?: string;
  due_at?: string;
  notes?: string;
  action_type?: "call" | "email" | "visit";
  priority_bucket?: "P1" | "P2" | "P3";
}) {
  const dueAt = input.due_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("follow_up_tasks")
    .upsert({
      tenant_id: input.brokerId,
      lead_id: input.lead_id || null,
      lead_name: input.lead_name,
      lead_phone: normalizePhone(input.lead_phone) || null,
      action_type: input.action_type || "call",
      due_at: dueAt,
      status: "pending",
      notes: input.notes || null,
      priority_bucket: input.priority_bucket || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,lead_id,action_type,due_at" });

  if (error) throw new Error(error.message);

  return {
    scheduled: true,
    due_at: dueAt,
    action_type: input.action_type || "call",
  };
}

export async function getBrokerActivity(input: { brokerId: string; days?: number }) {
  const days = Math.min(Math.max(input.days ?? 7, 1), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [leadResult, messageResult, followUpResult] = await Promise.all([
    supabase
      .from("lead_records")
      .select("record_type, locality_canonical, location_hint, priority_bucket, created_at")
      .eq("tenant_id", input.brokerId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("messages")
      .select("remote_jid, text, sender, timestamp, created_at")
      .eq("tenant_id", input.brokerId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("follow_up_tasks")
      .select("lead_name, due_at, status, priority_bucket")
      .eq("tenant_id", input.brokerId)
      .eq("status", "pending")
      .order("due_at", { ascending: true })
      .limit(25),
  ]);

  if (leadResult.error) throw new Error(leadResult.error.message);
  if (messageResult.error) throw new Error(messageResult.error.message);
  if (followUpResult.error) throw new Error(followUpResult.error.message);

  const leads = leadResult.data || [];
  const messages = messageResult.data || [];
  const followUps = followUpResult.data || [];
  const localities = new Map<string, number>();

  for (const row of leads) {
    const locality = String(row.locality_canonical || row.location_hint || "").trim();
    if (!locality) continue;
    localities.set(locality, (localities.get(locality) || 0) + 1);
  }

  return {
    days,
    leads_total: leads.length,
    listings_total: leads.filter((row) => row.record_type === "inventory_listing").length,
    requirements_total: leads.filter((row) => row.record_type === "buyer_requirement").length,
    p1_total: leads.filter((row) => row.priority_bucket === "P1").length,
    messages_total: messages.length,
    active_chats: new Set(messages.map((row) => row.remote_jid).filter(Boolean)).size,
    pending_follow_ups: followUps.length,
    next_follow_up: followUps[0] || null,
    top_localities: [...localities.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([locality, count]) => ({ locality, count })),
  };
}

export async function getPendingFollowUps(input: { brokerId: string; limit?: number }) {
  const { data, error } = await supabase
    .from("follow_up_tasks")
    .select("lead_id, lead_name, lead_phone, action_type, due_at, status, notes, priority_bucket, created_at")
    .eq("tenant_id", input.brokerId)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(clampLimit(input.limit, 25, 100));

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getRecentSavedListings(input: { brokerId: string; limit?: number }) {
  const { data, error } = await supabase
    .from("listings")
    .select("id, structured_data, raw_text, created_at")
    .eq("tenant_id", input.brokerId)
    .order("created_at", { ascending: false })
    .limit(clampLimit(input.limit, 20, 100));

  if (error) throw new Error(error.message);
  return (data || []) as Array<{
    id: string;
    structured_data: Record<string, unknown> | null;
    raw_text: string | null;
    created_at: string | null;
  }>;
}

export async function getRecentRequirements(input: { brokerId: string; limit?: number }) {
  const { data, error } = await supabase
    .from("lead_records")
    .select("lead_id, name, phone, location_hint, locality_canonical, budget, raw_text, created_at")
    .eq("tenant_id", input.brokerId)
    .eq("record_type", "buyer_requirement")
    .order("created_at", { ascending: false })
    .limit(clampLimit(input.limit, 20, 100));

  if (error) throw new Error(error.message);
  return (data || []) as Array<{
    lead_id: string;
    name: string;
    phone: string | null;
    location_hint: string | null;
    locality_canonical: string | null;
    budget: number | null;
    raw_text: string | null;
    created_at: string | null;
  }>;
}

export async function getStoredThreadMessages(input: {
  brokerId: string;
  remoteJid?: string;
  limit?: number;
}) {
  let query = supabase
    .from("messages")
    .select("remote_jid, text, sender, timestamp, created_at")
    .eq("tenant_id", input.brokerId)
    .order("timestamp", { ascending: false, nullsFirst: false })
    .limit(clampLimit(input.limit, 40, 200));

  if (input.remoteJid) {
    query = query.eq("remote_jid", input.remoteJid);
  } else {
    query = query.not("remote_jid", "is", null);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as Array<{
    remote_jid: string;
    text: string | null;
    sender: string | null;
    timestamp: string | null;
    created_at: string | null;
  }>;
}

export async function getMarketSummary(input: {
  locality?: string;
  city?: string;
  property_type?: "sale" | "rent" | "lease" | "all";
  bhk?: number;
  days?: number;
  limit?: number;
}) {
  const days = Math.min(Math.max(input.days ?? 30, 1), 180);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from("public_listings")
    .select(PUBLIC_LISTING_COLUMNS)
    .gte("message_timestamp", since)
    .order("message_timestamp", { ascending: false, nullsFirst: false })
    .limit(clampLimit(input.limit, 200, 500));

  query = applyLocality(query, input.locality, input.city);
  query = applyListingType(query, input.property_type);
  if (input.bhk != null) {
    query = query.eq("bhk", input.bhk);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data || []).map((row) => ({
    ...row,
    price: toNumber(row.price),
    size_sqft: toNumber(row.size_sqft),
    bhk: toNumber(row.bhk),
  })) as PublicListing[];

  const prices = rows.map((row) => row.price).filter((value): value is number => value != null);
  const ppsf = rows
    .map((row) => row.price != null && row.size_sqft ? row.price / row.size_sqft : null)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const localityCounts = new Map<string, number>();
  for (const row of rows) {
    const locality = String(row.sub_area || row.area || row.location || "").trim();
    if (!locality) continue;
    localityCounts.set(locality, (localityCounts.get(locality) || 0) + 1);
  }

  return {
    days,
    listing_count: rows.length,
    avg_price_cr: prices.length ? Number((prices.reduce((sum, value) => sum + value, 0) / prices.length).toFixed(2)) : null,
    median_price_cr: median(prices),
    avg_price_per_sqft: ppsf.length ? Math.round(ppsf.reduce((sum, value) => sum + value, 0) / ppsf.length) : null,
    freshest_message_at: rows[0]?.message_timestamp || rows[0]?.created_at || null,
    top_localities: [...localityCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([locality, count]) => ({ locality, count })),
    sample: rows.slice(0, 5),
  };
}

export async function estimatePrice(input: {
  locality?: string;
  building_name?: string;
  bhk?: number;
  area_sqft?: number;
  property_type?: "sale" | "rent" | "lease" | "all";
}) {
  const market = await getMarketSummary({
    locality: input.locality,
    property_type: input.property_type || "sale",
    bhk: input.bhk,
    days: 90,
    limit: 250,
  });
  const igr = await getIgrPrice({
    building_name: input.building_name,
    locality: input.locality,
  });

  const publicPpsf = market.avg_price_per_sqft;
  const igrPpsf = igr.locality_stats?.avg_price_per_sqft ?? null;
  const referencePpsf = publicPpsf || igrPpsf || null;
  const estimatedPriceCr = referencePpsf && input.area_sqft
    ? Number(((referencePpsf * input.area_sqft) / 10000000).toFixed(2))
    : market.median_price_cr;

  return {
    estimated_price_cr: estimatedPriceCr,
    reference_price_per_sqft: referencePpsf,
    public_market: market,
    igr_market: igr.locality_stats,
    igr_transaction: igr.transaction,
    summary: referencePpsf
      ? input.area_sqft
        ? `Estimated value: ${formatCurrencyCr(estimatedPriceCr)} using ${formatPerSqft(referencePpsf)} and ${Math.round(input.area_sqft).toLocaleString("en-IN")} sqft.`
        : `Reference market rate: ${formatPerSqft(referencePpsf)}. Add area_sqft for a tighter estimate.`
      : "Not enough comparable data to estimate a price yet.",
  };
}

export async function qualifyLead(input: {
  brokerId: string;
  lead_id?: string;
  name?: string;
  phone?: string;
  raw_text: string;
  budget?: string | number;
  location_pref?: string;
  timeline?: string;
  possession?: string;
}) {
  const phone = normalizePhone(input.phone);
  const budgetCr = parseBudgetToCr(input.budget);
  const urgency = inferUrgency([input.raw_text, input.timeline, input.possession].filter(Boolean).join(" "));
  const priorityBucket = inferPriorityBucket(urgency);
  const priorityScore = scoreFromUrgency(urgency);

  let existingLeadId = input.lead_id || null;
  if (!existingLeadId && phone) {
    const { data } = await supabase
      .from("lead_records")
      .select("lead_id")
      .eq("tenant_id", input.brokerId)
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    existingLeadId = data?.lead_id || null;
  }

  const payload = {
    qualification: {
      budget: budgetCr,
      location_pref: input.location_pref || null,
      timeline: input.timeline || null,
      possession: input.possession || null,
      qualified_at: new Date().toISOString(),
      qualified_via: "mcp",
    },
  };

  const lead = await upsertLeadRecord({
    brokerId: input.brokerId,
    name: input.name || "Qualified lead",
    phone,
    recordType: "buyer_requirement",
    rawText: input.raw_text,
    source: "mcp",
    budget: budgetCr,
    locationHint: input.location_pref || null,
    locality: input.location_pref || null,
    urgency,
    priorityBucket,
    priorityScore,
    payload: existingLeadId ? { ...payload, lead_id: existingLeadId } : payload,
  });

  return {
    lead_id: existingLeadId || lead.lead_id,
    qualification: payload.qualification,
    urgency,
    priority_bucket: priorityBucket,
    priority_score: priorityScore,
  };
}

export async function summarizeThread(input: {
  brokerId: string;
  remote_jid: string;
  limit?: number;
}) {
  const rows = (await getStoredThreadMessages({
    brokerId: input.brokerId,
    remoteJid: input.remote_jid,
    limit: input.limit,
  })).filter((row) => String(row.text || "").trim());
  const ordered = [...rows].reverse();
  const inboundCount = rows.filter((row) => !String(row.sender || "").toLowerCase().includes("ai")).length;
  const outboundCount = rows.length - inboundCount;
  const latest = rows[0] || null;

  return {
    remote_jid: input.remote_jid,
    message_count: rows.length,
    inbound_count: inboundCount,
    outbound_count: outboundCount,
    last_message_at: latest?.timestamp || latest?.created_at || null,
    participants: [...new Set(rows.map((row) => String(row.sender || "").trim()).filter(Boolean))],
    key_points: ordered.slice(-5).map((row) => ({
      sender: row.sender,
      text: String(row.text || "").slice(0, 240),
      timestamp: row.timestamp || row.created_at,
    })),
  };
}

export function buildBroadcastDraft(input: {
  title?: string;
  location?: string;
  bhk?: string;
  price?: string;
  area_sqft?: number;
  furnishing?: string;
  contact_name?: string;
  contact_number?: string;
  notes?: string;
  call_to_action?: string;
}) {
  const lines = [
    input.title || "Fresh listing",
    [input.bhk, input.location].filter(Boolean).join(" in "),
    input.price ? `Price: ${input.price}` : null,
    input.area_sqft ? `Area: ${Math.round(input.area_sqft).toLocaleString("en-IN")} sqft` : null,
    input.furnishing ? `Furnishing: ${input.furnishing}` : null,
    input.notes || null,
    input.contact_name || input.contact_number
      ? `Contact: ${[input.contact_name, normalizePhone(input.contact_number)].filter(Boolean).join(" ")}`
      : null,
    input.call_to_action || "DM for inspection, photos, and deal details.",
  ].filter(Boolean);

  return lines.join("\n");
}
