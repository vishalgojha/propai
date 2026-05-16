import { NextResponse } from "next/server";

type ParsedQuery = {
  type?: string;
  bhk?: string;
  locality?: string;
  max_price?: number | null;
  keywords?: string[];
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const q = String(body?.q || "").trim();

  if (!q) {
    return NextResponse.json({ redirectTo: "/listings" });
  }

  const parsed = await parseQuery(q);
  const params = new URLSearchParams();
  params.set("q", q);
  if (parsed.type) params.set("type", parsed.type);
  if (parsed.locality) params.set("locality", parsed.locality);
  if (parsed.bhk) params.set("bhk", parsed.bhk);
  return NextResponse.json({ redirectTo: `/listings?${params.toString()}` });
}

async function parseQuery(q: string): Promise<ParsedQuery> {
  return heuristicParse(q);
}

function heuristicParse(q: string): ParsedQuery {
  const lower = q.toLowerCase();
  return {
    type: lower.includes("rent") ? "rent" : lower.includes("sale") ? "sale" : undefined,
    bhk: q.match(/\b\d\s*bhk\b/i)?.[0]?.replace(/\s+/g, "") || undefined,
    locality: q.match(/\b(bandra|powai|andheri|worli|juhu|thane|goregaon|malad|chembur|dadar)\b/i)?.[0] || undefined,
    keywords: q.split(/\s+/).filter(Boolean).slice(0, 5)
  };
}
