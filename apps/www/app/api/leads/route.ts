import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const formData = await request.formData();
  const listingId = String(formData.get("listingId") || "");
  const name = String(formData.get("name") || "").trim();
  const phone = normalizeIndianPhone(String(formData.get("phone") || ""));

  if (!listingId || name.length < 2 || !phone) {
    return redirectToListing(request.url, listingId, "error");
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return redirectToListing(request.url, listingId, "unavailable");
  }

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, tenant_id, status, structured_data")
    .eq("id", listingId)
    .eq("status", "Active")
    .maybeSingle();

  if (listingError || !listing) {
    return redirectToListing(request.url, listingId, "missing");
  }

  const structured = (listing.structured_data || {}) as Record<string, unknown>;
  const sourcePath = request.headers.get("referer") || `/listings/${listingId}`;
  const { error: insertError } = await supabase.from("public_property_leads").insert({
    listing_id: listing.id,
    broker_tenant_id: listing.tenant_id,
    lead_name: name,
    lead_phone: phone,
    source_path: sourcePath,
    payload: {
      listingTitle: String(structured.title || structured.name || ""),
      locality: String(structured.locality || structured.location || structured.locality_canonical || ""),
      submittedFrom: new URL(request.url).hostname,
      userAgent: request.headers.get("user-agent") || null
    }
  });

  if (insertError) {
    console.error("[www] lead capture failed", insertError.message);
    return redirectToListing(request.url, listingId, "save-error");
  }

  return redirectToListing(request.url, listingId, "ok");
}

function redirectToListing(requestUrl: string, listingId: string, status: string) {
  const pathname = listingId ? `/listings/${listingId}` : "/listings";
  return NextResponse.redirect(new URL(`${pathname}?lead=${status}`, requestUrl));
}

function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(normalized)) {
    return null;
  }
  return normalized;
}
