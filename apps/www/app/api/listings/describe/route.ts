import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function daysAgo(dateStr: string): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export async function POST(request: Request) {
  try {
    const { price, configuration, locality, area_sqft, created_at, deal_type } = await request.json();
    if (!locality || !deal_type) {
      return NextResponse.json({ error: "locality and deal_type are required." }, { status: 400 });
    }

    const days = daysAgo(created_at);
    const priceStr = price && price > 0 ? `₹${(price / 10000000).toFixed(1)} Cr` : "Price on Request";
    const configLabel = String(configuration || "Property").trim();
    const dealLabel = deal_type === "Rent" ? "rent" : "sale";
    const areaLabel = area_sqft ? `${area_sqft} sqft` : "area not specified";
    const pricePerSqft = price && area_sqft ? Math.round(price / area_sqft) : null;
    const pricePerSqftLabel = pricePerSqft ? `Approx. ₹${pricePerSqft.toLocaleString("en-IN")}/sqft.` : "";

    const description = `<div class="prose">
<p><strong>${configLabel} for ${dealLabel} in ${locality}, Mumbai.</strong> This listing was posted ${days} day${days === 1 ? "" : "s"} ago and is currently shown at ${priceStr}${area_sqft ? ` with ${areaLabel}` : ""}.</p>
<p>This page intentionally stays factual and only reflects the listing record: deal type, configuration, locality, price, and area. ${pricePerSqftLabel}</p>
<p><em>Interested in this property? Visit PropAI Pulse for more details, site visits, and direct contact information.</em></p>
</div>`;

    return NextResponse.json({ description });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate description." },
      { status: 500 },
    );
  }
}
