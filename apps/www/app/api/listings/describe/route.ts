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

function stripComparativeClauses(text: string): string {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !/(\bthan\b|\bcounterpart\b|\bbetter value\b|\blower than\b|\bhigher than\b|\bsame postal code\b|\bminutes away\b.*\bpreferred\b)/i.test(sentence))
    .join(' ')
    .trim();
}

function buildFallbackDescription(input: {
  locality: string;
  configuration?: string | number | null;
  deal_type: string;
  priceStr: string;
  area_sqft?: number | null;
  days: number;
}) {
  const configLabel = String(input.configuration || "Property").trim();
  const dealLabel = input.deal_type === "Rent" ? "rent" : "sale";
  const areaLabel = input.area_sqft ? `${input.area_sqft} sqft` : "area not specified";
  return `<div class="prose">
<p><strong>${configLabel} for ${dealLabel} in ${input.locality}, Mumbai.</strong> This listing was posted ${input.days} day${input.days === 1 ? "" : "s"} ago and is currently shown at ${input.priceStr}${input.area_sqft ? ` with ${areaLabel}` : ""}.</p>
<p>This page keeps the description factual and uses only the listing record plus locality context. It does not invent missing details.</p>
<p><em>Interested in this property? Visit PropAI Pulse for more details, site visits, and direct contact information.</em></p>
</div>`;
}

const SYSTEM_PROMPT = `You are a factual property listing writer for PropAI, a Mumbai real estate platform.
Write a concise but useful property description based only on the exact data provided below.
Do not invent amenities, exact distances, nearby landmarks, price trends, or comparisons unless explicitly present in the input.

Requirements:
- Use only the provided locality, deal type, configuration, price, area, and locality context.
- Never mention a different locality as superior/inferior unless the input explicitly says so.
- Never compare one Bandra side to the other, or one micro-market to another, unless the input explicitly asks for a comparison.
- If the locality context is thin, stay generic and factual.
- Use clear Indian real-estate language, not hype.
- Keep it around 180-280 words.
- Return valid HTML with 3-4 short paragraphs.
- End with a brief CTA to visit PropAI Pulse.

DATA:
- Locality: {locality}, Mumbai
- Deal type: {deal_type}
- Configuration: {configuration}
- Price: {price}
- Area: {area_sqft} sqft
- Listing age: {days_ago} days
- Locality context:
{locality_blurb}

STYLE:
- Professional, factual, and readable.
- No flowery phrases like "dream home", "stunning", or "luxurious".
- No bullet points.
- Do not mention any city other than Mumbai.
- Do not mention postal codes unless provided.`;

export async function POST(request: Request) {
  try {
    const { price, configuration, locality, area_sqft, created_at, deal_type } = await request.json();
    if (!locality || !deal_type) {
      return NextResponse.json({ error: "locality and deal_type are required." }, { status: 400 });
    }

    const days = daysAgo(created_at);
    const priceStr = price && price > 0 ? `₹${(price / 10000000).toFixed(1)} Cr` : "Price on Request";
    const configLabel = String(configuration || "Property").trim();
    const blurb = stripComparativeClauses(getLocalityBlurb(locality, configuration) || `The listing is in ${locality}, Mumbai.`);
    const prompt = SYSTEM_PROMPT
      .replace("{locality}", locality)
      .replace("{deal_type}", deal_type)
      .replace("{configuration}", configLabel)
      .replace("{price}", priceStr)
      .replace("{area_sqft}", area_sqft ? String(area_sqft) : "N/A")
      .replace("{days_ago}", String(days))
      .replace("{locality_blurb}", blurb);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ description: buildFallbackDescription({ locality, configuration, deal_type, priceStr, area_sqft, days }) });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.25, topP: 0.9, maxOutputTokens: 700 },
        }),
      },
    );

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[Describe] Gemini API error:", res.status, errBody);
      return NextResponse.json({ description: buildFallbackDescription({ locality, configuration, deal_type, priceStr, area_sqft, days }) });
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const description = String(text).trim() || buildFallbackDescription({ locality, configuration, deal_type, priceStr, area_sqft, days });
    return NextResponse.json({ description });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate description." },
      { status: 500 },
    );
  }
}
