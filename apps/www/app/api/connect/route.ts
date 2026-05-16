import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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
    .select("structured_data, raw_text")
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

  const waUrl = `https://wa.me/91${phone.slice(-10)}?text=${encodeURIComponent(
    "Hi, I saw your property listing on PropAI. Is it still available?"
  )}`;

  return NextResponse.redirect(waUrl);
}
