import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const q = String(body?.q || "").trim();

  if (!q) {
    return NextResponse.json({ redirectTo: "/listings" });
  }

  const params = new URLSearchParams();
  params.set("q", q);

  const lower = q.toLowerCase();
  if (lower.includes("rent")) params.set("type", "rent");
  else if (lower.includes("sale")) params.set("type", "sale");

  const bhkMatch = q.match(/\b(\d)\s*bhk\b/i);
  if (bhkMatch) params.set("bhk", bhkMatch[1]);

  const localityMatch = q.match(/\b(bandra|powai|andheri|worli|juhu|thane|goregaon|malad|chembur|dadar|kandivali|borivali)\b/i);
  if (localityMatch) params.set("locality", localityMatch[1].toLowerCase());

  return NextResponse.json({ redirectTo: `/listings?${params.toString()}` });
}
