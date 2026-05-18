import express from "express";
import path from "path";
import { createHash } from "crypto";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3002);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // --- API routes ---

  // GET /api/connect — redirect to wa.me for a listing
  app.get("/api/connect", async (req, res) => {
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: "Missing listing id" });
    if (!supabase) return res.status(500).json({ error: "Database not configured" });

    const { data: row } = await supabase
      .from("listings")
      .select("tenant_id, structured_data, raw_text")
      .eq("id", id)
      .eq("status", "Active")
      .single()
      .throwOnError();

    if (!row) return res.status(404).json({ error: "Listing not found" });

    const data = (row.structured_data || {}) as Record<string, unknown>;
    const rawText = String(row.raw_text || "");
    const phone =
      String(data.contact_number || data.phone || data.contactPhone || data.sourcePhone || "").replace(/\D/g, "") ||
      rawText.match(/(?:\+91[-\s]?)?([6-9]\d{9})/)?.[1] ||
      null;

    if (!phone) return res.status(404).json({ error: "Broker contact not available" });

    const forwardedFor = req.headers["x-forwarded-for"] as string || "";
    const userAgent = req.headers["user-agent"] || "public-web";
    const visitorSeed = `${forwardedFor}|${userAgent}|${id}`;
    const visitorId = `public:${createHash("sha256").update(visitorSeed).digest("hex").slice(0, 24)}`;

    await supabase.from("wa_click_events").insert({
      listing_id: id,
      broker_phone: phone.slice(-10),
      user_id: visitorId,
      workspace_id: String((row as any).tenant_id || "public"),
      source: "www",
      device: /mobile|android|iphone|ipad/i.test(userAgent) ? "mobile" : "web",
    }).maybeSingle();

    res.redirect(`https://wa.me/91${phone.slice(-10)}?text=${encodeURIComponent("Hi, I saw your property listing on PropAI. Is it still available?")}`);
  });

  // POST /api/leads — capture a lead for a listing
  app.post("/api/leads", async (req, res) => {
    const formData = req.body;
    const listingId = String(formData.listingId || "");
    const name = String(formData.name || "").trim();
    const phone = normalizeIndianPhone(String(formData.phone || ""));
    const referer = (req.headers["referer"] || req.headers["referrer"] || `/listings/${listingId}`) as string;

    if (!listingId || name.length < 2 || !phone) {
      return res.redirect(`/listings/${listingId}?lead=error`);
    }

    if (!supabase) return res.redirect(`/listings/${listingId}?lead=unavailable`);

    const { data: listing } = await supabase
      .from("listings")
      .select("id, tenant_id, status, structured_data")
      .eq("id", listingId)
      .eq("status", "Active")
      .maybeSingle();

    if (!listing) return res.redirect(`/listings/${listingId}?lead=missing`);

    const structured = (listing.structured_data || {}) as Record<string, unknown>;
    const { error: insertError } = await supabase.from("public_property_leads").insert({
      listing_id: listing.id,
      broker_tenant_id: listing.tenant_id,
      lead_name: name,
      lead_phone: phone,
      source_path: referer,
      payload: {
        listingTitle: String(structured.title || structured.name || ""),
        locality: String(structured.locality || structured.location || ""),
        submittedFrom: req.hostname,
        userAgent: req.headers["user-agent"] || null,
      },
    });

    res.redirect(`/listings/${listingId}?lead=${insertError ? "save-error" : "ok"}`);
  });

  // GET /api/listings — fetch public listings (with optional ?slug=)
  app.get("/api/listings", async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Database not configured" });

    const slugFilter = req.query.slug as string | undefined;

    const [{ data: listings, error: listingError }, { data: profiles }, { data: subscriptions }] = await Promise.all([
      supabase.from("listings").select("id, tenant_id, structured_data, raw_text, status, created_at").eq("status", "Active").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, phone, full_name"),
      supabase.from("subscriptions").select("tenant_id, plan, status")
    ]);

    if (listingError) return res.status(500).json({ error: listingError.message });

    const paidTenantIds = new Set(
      (subscriptions || [])
        .filter((row: any) => (row.status === "active" || row.status === "trial") && (row.plan === "Pro" || row.plan === "Team"))
        .map((row: any) => row.tenant_id)
    );

    const paidBrokerMap = new Map<string, { phone: string; fullName: string | null }>();
    for (const row of profiles || []) {
      const digits = digitsOnly((row as any).phone);
      if (!digits) continue;
      if (!paidTenantIds.has((row as any).id)) continue;
      paidBrokerMap.set(digits, { phone: digits, fullName: (row as any).full_name || null });
    }

    const all = ((listings || []) as any[])
      .map((row) => normalizeListing(row, paidBrokerMap))
      .filter(Boolean);

    if (slugFilter) {
      const listing = all.find((l: any) => l.slug === slugFilter || l.id === slugFilter) || null;
      return res.json({ listing });
    }

    res.json({ listings: all });
  });

  // POST /api/search — parse a free-text search query
  app.post("/api/search", async (req, res) => {
    const q = String(req.body?.q || "").trim();
    if (!q) return res.json({ redirectTo: "/listings" });

    const params = new URLSearchParams();
    params.set("q", q);

    const lower = q.toLowerCase();
    if (lower.includes("rent")) params.set("type", "rent");
    else if (lower.includes("sale")) params.set("type", "sale");

    const bhkMatch = q.match(/\b(\d)\s*bhk\b/i);
    if (bhkMatch) params.set("bhk", bhkMatch[1]);

    const localityMatch = q.match(/\b(bandra|powai|andheri|worli|juhu|thane|goregaon|malad|chembur|dadar|kandivali|borivali)\b/i);
    if (localityMatch) params.set("locality", localityMatch[1].toLowerCase());

    res.json({ redirectTo: `/listings?${params.toString()}` });
  });

  // --- Serve frontend ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`www server running on http://0.0.0.0:${PORT}`);
  });
}

function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(normalized)) return null;
  return normalized;
}

// --- Listing normalization (ported from Next.js lib/listings.ts) ---

function generateListingSlug(listing: { bhk: string; localitySlug: string; type: string; id: string }) {
  const shortId = listing.id.replace(/-/g, "").slice(-8);
  const bhkPart = slugifyBhk(listing.bhk);
  return `${bhkPart}-in-${listing.localitySlug}-${listing.type}-${shortId}`;
}

function slugifyBhk(bhk: string) {
  const match = bhk.match(/^(\d+(?:\.\d+)?)/);
  return match ? `${match[1]}-bhk` : bhk.toLowerCase().replace(/\s+/g, "-");
}

function normalizeListing(row: any, paidBrokerMap: Map<string, { phone: string; fullName: string | null }>) {
  const data = (row.structured_data || {}) as Record<string, unknown>;
  const rawText = String(row.raw_text || "");
  const title = pickString(data.title, data.name, data.displayTitle) || inferTitle(rawText) || "Property Listing";
  const location = pickString(data.location, data.locality, data.locality_canonical, data.address, data.area) || inferLocation(rawText) || "Unknown locality";
  const locality = normalizeLocality(location);
  const bhk = pickString(data.bhk, data.layout, data.property_type) || inferBhk(rawText) || "Flexible";
  const type = normalizeType(pickString(data.type, data.deal_type, data.intent, data.category), rawText);
  const priceAmount = parsePriceAmount(data.price_numeric, data.price, rawText, type);
  const floor = pickString(data.floor, data.floor_number) || null;
  const furnishing = pickString(data.furnishing, data.furnished) || null;
  const areaSqft = parseAreaSqft(data.area_sqft, data.carpet_area, data.area);
  const availability = pickString(data.availability, data.available_from, data.possession) || null;
  const brokerDigits = digitsOnly(pickString(data.contact_number, data.phone, data.contactPhone, data.sourcePhone) || extractPhone(rawText));
  const slug = generateListingSlug({ bhk, localitySlug: slugifyLocality(locality), type: type.toLowerCase(), id: row.id });

  return {
    id: row.id,
    title,
    price: priceAmount || 0,
    locality,
    type: type as 'Rent' | 'Sale' | 'Requirement',
    bhk,
    area_sqft: areaSqft || undefined,
    furnishing: furnishing || undefined,
    availability: availability || undefined,
    raw_text: rawText,
    created_at: row.created_at,
    slug,
    floor: floor || undefined,
    broker_phone: brokerDigits ? `91${brokerDigits}` : undefined,
  };
}

function inferTitle(rawText: string) {
  return rawText.split("\n").map(l => l.trim()).find(l => l.length > 8 && !l.includes("http")) || null;
}

function inferLocation(rawText: string) {
  const match = rawText.match(/\b(?:in\s+|at\s+)?(bandra|powai|andheri|worli|thane|juhu|goregaon|malad|chembur|dadar)/i);
  if (match) {
    const name = match[1];
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }
  const line = rawText.split("\n").map(t => t.trim()).find(e => /bandra|powai|andheri|worli|thane|juhu|goregaon|malad|chembur|dadar/i.test(e));
  return line || null;
}

function normalizeLocality(value: string) {
  const trimmed = value.split(",")[0]?.trim() || value.trim();
  if (!trimmed) return "Unknown Locality";
  return trimmed.replace(/\b\w/g, c => c.toUpperCase());
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
    .filter(m => Number.isFinite(Number(m[1])))
    .map(m => {
      let amount = Number(m[1]);
      const unit = String(m[2] || "").toLowerCase();
      if (unit === "cr" || unit === "crore") amount *= 10000000;
      else if (unit === "l" || unit === "lac" || unit === "lakh") amount *= 100000;
      else if (unit === "k" || unit === "thousand") amount *= 1000;
      else if (type === "Sale" && amount < 1000) amount *= 100000;

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

startServer();
