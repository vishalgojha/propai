import { NextResponse } from "next/server";
import { getLocalityBlurb } from "@/data/localityBlurbs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function daysAgo(dateStr: string): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

const SYSTEM_PROMPT = `You are a factual property listing writer for PropAI, a Mumbai real estate platform. 
Write a detailed, informative property description of minimum 500 words based only 
on the data points provided. Do not invent or assume any data not given to you.

This is not a residential-only platform. Property types include 
residential (1/2/3 BHK, studio), commercial (office, shop, showroom), 
and industrial (warehouse, godown). Write accordingly based on the configuration/property type.

RULES:
- No flowery language. No "dream home", "stunning", "luxurious", "nestled" etc.
- Write like a knowledgeable Mumbai broker explaining a property to a serious buyer
- Use Indian number format (₹1.9 Cr, not ₹19,000,000)
- Cover all sections below
- Naturally include SEO keywords: [locality] property for sale/rent, [configuration] in [locality] Mumbai, 
  buy/rent flat/office/shop in [locality], Mumbai real estate
- Do NOT hardcode "BHK" — use "Configuration" or "Property Type" throughout

LISTING DATA:
- Type: {deal_type} (Sale/Rent)
- Configuration: {configuration}
- Locality: {locality}, Mumbai
- Price: {price}
- Area: {area_sqft} sqft (if available)
- Listed: {days_ago} days ago
- Source: Broker network

LOCALITY CONTEXT:
{locality_blurb}

SECTIONS TO COVER:

1. Property Overview (50-80 words)
   - Configuration, deal type, locality, price, area in plain sentences
   - Price per sqft if both price and area available

2. About the Locality (150-200 words)
   - Infrastructure, connectivity, metro/rail access
   - Key landmarks, markets, schools, hospitals nearby
   - Who typically looks for property here — working professionals, families, businesses
   - Rental yield or capital appreciation context if sale

3. Price Analysis (80-100 words)
   - How this listing compares to current market range in this locality
   - Whether price is at market, above, or below
   - Use generic market language — do not make up specific numbers

4. What the Data Says (80-100 words)
   - Area per room or per unit rough calculation
   - Value per sqft if both price and area available
   - How old the listing is and what that signals
   - Any other parsed data points available

5. Nearby Localities to Consider (60-80 words)
   - 2-3 nearby localities with similar or slightly different price points
   - Reference them naturally

6. How to Enquire (30-40 words)
   - Via PropAI broker network
   - No direct broker number shown on public page
   - CTA to connect via PropAI`;

export async function POST(request: Request) {
  try {
    const { price, configuration, locality, area_sqft, created_at, deal_type } = await request.json();
    if (!locality || !deal_type) {
      return NextResponse.json({ error: "locality and deal_type are required." }, { status: 400 });
    }

    const blurb = getLocalityBlurb(locality, configuration) || `${locality} is a locality in Mumbai.`;
    const days = daysAgo(created_at);
    const priceStr = price && price > 0 ? `₹${(price / 10000000).toFixed(1)} Cr` : "Price on Request";

    const prompt = SYSTEM_PROMPT
      .replace("{deal_type}", deal_type)
      .replace("{configuration}", configuration || "Property")
      .replace("{locality}", locality)
      .replace("{price}", priceStr)
      .replace("{area_sqft}", area_sqft ? String(area_sqft) : "N/A")
      .replace("{days_ago}", String(days))
      .replace("{locality_blurb}", blurb);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        description: `<div class="prose">
<p><strong>${configuration} for ${deal_type === "Rent" ? "rent" : "sale"} in ${locality}, Mumbai</strong></p>
<p>${blurb}</p>
<p>Price: ${priceStr}${area_sqft ? ` | Area: ${area_sqft} sqft` : ""}</p>
<p><em>Interested in this property? Connect via PropAI's broker network to get more details.</em></p>
</div>`,
      });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
        }),
      },
    );

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[Describe] Gemini API error:", res.status, errBody);
      return NextResponse.json({ error: "AI generation failed." }, { status: 502 });
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return NextResponse.json({ description: text });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate description." },
      { status: 500 },
    );
  }
}
