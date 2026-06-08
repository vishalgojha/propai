import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(normalized)) return null;
  return `91${normalized}`;
}

export async function POST(request: Request) {
  try {
    const { listingId, phone, name, message } = await request.json();

    if (!listingId?.trim()) {
      return NextResponse.json({ error: "Listing ID is required." }, { status: 400 });
    }

    const normalizedPhone = normalizePhone(phone || "");
    if (!normalizedPhone) {
      return NextResponse.json({ error: "Valid Indian mobile number is required." }, { status: 400 });
    }

    const leadName = String(name || "").trim() || "Website Lead";
    const leadMessage = String(message || "").trim() || null;

    let listing: Record<string, unknown> | null = null;
    const tables = ["stream_items", "stream_items_residential", "stream_items_commercial"] as const;

    for (const table of tables) {
      if (supabaseAdmin) {
        const { data } = await supabaseAdmin
          .from(table)
          .select("id, tenant_id, locality, parsed_payload")
          .eq("id", listingId)
          .maybeSingle();
        if (data) {
          listing = data as Record<string, unknown>;
          break;
        }
      }
    }

    if (!listing) {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }

    if (supabaseAdmin) {
      const { error: insertError } = await supabaseAdmin.from("public_property_leads").insert({
        stream_item_id: listing.id,
        broker_tenant_id: listing.tenant_id,
        lead_name: leadName,
        lead_phone: normalizedPhone,
        source_path: request.headers.get("referer") || "/listing",
        payload: {
          type: "intent",
          listingTitle: String((listing as any).parsed_payload?.displayTitle || ""),
          locality: String((listing as any).locality || ""),
          message: leadMessage,
          submittedFrom: request.headers.get("host") || "propai.live",
          userAgent: request.headers.get("user-agent") || "",
        },
      });

      if (insertError) {
        console.error("[Notify] DB insert failed:", insertError.message);
        return NextResponse.json({ error: "Failed to save." }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process." },
      { status: 500 },
    );
  }
}
