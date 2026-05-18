import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createHash } from "crypto";

function getDeviceLabel(userAgent: string) {
  const normalized = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipad/.test(normalized)) return "mobile";
  return "web";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing listing id" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const { data: row } = await supabase
    .from("listings")
    .select("tenant_id, structured_data, raw_text")
    .eq("id", id)
    .eq("status", "Active")
    .single()
    .throwOnError();

  if (!row) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const data = (row.structured_data || {}) as Record<string, unknown>;
  const rawText = String(row.raw_text || "");

  const phone =
    String(data.contact_number || data.phone || data.contactPhone || data.sourcePhone || "").replace(/\D/g, "") ||
    rawText.match(/(?:\+91[-\s]?)?([6-9]\d{9})/)?.[1] ||
    null;

  if (!phone) {
    return NextResponse.json({ error: "Broker contact not available" }, { status: 404 });
  }

  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const userAgent = request.headers.get("user-agent") || "public-web";
  const visitorSeed = `${forwardedFor}|${userAgent}|${id}`;
  const visitorId = `public:${createHash("sha256").update(visitorSeed).digest("hex").slice(0, 24)}`;

  await supabase.from("wa_click_events").insert({
    listing_id: id,
    broker_phone: phone.slice(-10),
    user_id: visitorId,
    workspace_id: String((row as any).tenant_id || "public"),
    source: "www",
    device: getDeviceLabel(userAgent),
  });

  const waUrl = `https://wa.me/91${phone.slice(-10)}?text=${encodeURIComponent(
    "Hi, I saw your property listing on PropAI. Is it still available?"
  )}`;

  return NextResponse.redirect(waUrl);
}
