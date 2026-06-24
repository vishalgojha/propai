import { supabaseAdmin } from "../src/lib/supabase.server";
import type { LocalityMapData } from "../src/components/LocalityDataMap";

export async function fetchExploreData(): Promise<LocalityMapData[]> {
  if (!supabaseAdmin) return [];

  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();

  try {
    const [resResult, comResult] = await Promise.all([
      supabaseAdmin
        .from("stream_items_residential")
        .select("locality, bhk, price_numeric, deal_type, created_at")
        .gte("created_at", since)
        .not("locality", "is", null)
        .neq("locality", "")
        .limit(5000),
      supabaseAdmin
        .from("stream_items_commercial")
        .select("locality, bhk, price_numeric, deal_type, created_at")
        .gte("created_at", since)
        .not("locality", "is", null)
        .neq("locality", "")
        .limit(5000),
    ]);

    const rows = [
      ...((resResult.data || []) as any[]),
      ...((comResult.data || []) as any[]),
    ];

    const TOP_LOCALITIES_SLUGS = [
      "bandra-west", "bandra-east", "khar-west", "santacruz-west", "juhu",
      "andheri-west", "andheri-east", "versova", "lokhandwala", "powai",
      "goregaon-west", "malad-west", "borivali-west", "kandivali-west",
      "worli", "lower-parel", "prabhadevi", "dadar-west", "matunga", "chembur",
    ];

    const NAME_SLUG_MAP: Record<string, string> = {
      "bandra west": "bandra-west", "bandra east": "bandra-east",
      "khar west": "khar-west", "santacruz west": "santacruz-west",
      "juhu": "juhu", "andheri west": "andheri-west",
      "andheri east": "andheri-east", "versova": "versova",
      "lokhandwala": "lokhandwala", "powai": "powai",
      "goregaon west": "goregaon-west", "malad west": "malad-west",
      "borivali west": "borivali-west", "kandivali west": "kandivali-west",
      "worli": "worli", "lower parel": "lower-parel",
      "prabhadevi": "prabhadevi", "dadar west": "dadar-west",
      "matunga": "matunga", "chembur": "chembur",
    };

    const byLocality = new Map<string, {
      prices: number[];
      rents: number[];
      listings: number;
      requirements: number;
      bhkOne: number;
      bhkTwo: number;
      bhkThree: number;
      bhkFourPlus: number;
    }>();

    for (const slug of TOP_LOCALITIES_SLUGS) {
      byLocality.set(slug, {
        prices: [],
        rents: [],
        listings: 0,
        requirements: 0,
        bhkOne: 0,
        bhkTwo: 0,
        bhkThree: 0,
        bhkFourPlus: 0,
      });
    }

    for (const row of rows) {
      const raw = String(row.locality || "").trim().toLowerCase();
      const slug = NAME_SLUG_MAP[raw];
      if (!slug) continue;
      const bucket = byLocality.get(slug);
      if (!bucket) continue;

      const dealType = String(row.deal_type || row.type || "").toLowerCase();
      const isRent = dealType === "rent" || dealType === "rental" || dealType === "lease";
      const isSale = dealType === "sale" || dealType === "sell" || dealType === "buy";
      const isRequirement = dealType === "requirement" || dealType === "want" || dealType === "buyer" || (row as any).record_type === "requirement";

      if (isRequirement) {
        bucket.requirements++;
      } else {
        bucket.listings++;
      }

      let price = Number(row.price_numeric) || 0;

      if (isSale && (price < 500000 || price > 1000000000)) {
        price = 0;
      }
      if (isRent && (price < 1000 || price > 500000)) {
        price = 0;
      }

      if (price > 0) {
        if (isRent) {
          bucket.rents.push(price);
        } else if (isSale) {
          bucket.prices.push(price);
        }
      }

      const bhk = String(row.bhk || "").toLowerCase().replace(/\s+/g, "");
      if (bhk.includes("1bhk") || bhk === "1" || bhk === "1rk") bucket.bhkOne++;
      else if (bhk.includes("2bhk") || bhk === "2") bucket.bhkTwo++;
      else if (bhk.includes("3bhk") || bhk === "3") bucket.bhkThree++;
      else if (bhk.includes("4bhk") || bhk.includes("5bhk") || (parseInt(bhk) >= 4)) bucket.bhkFourPlus++;
    }

    const localities: LocalityMapData[] = TOP_LOCALITIES_SLUGS.map((slug) => {
      const bucket = byLocality.get(slug)!;
      const total = bucket.listings + bucket.requirements;
      const bhkTotal = bucket.bhkOne + bucket.bhkTwo + bucket.bhkThree + bucket.bhkFourPlus || 1;

      const avgSalePrice = bucket.prices.length > 0
        ? Math.round(bucket.prices.reduce((a, b) => a + b, 0) / bucket.prices.length)
        : null;

      const avgRentalRate = bucket.rents.length > 0
        ? Math.round(bucket.rents.reduce((a, b) => a + b, 0) / bucket.rents.length)
        : null;

      const rentalYield = avgSalePrice && avgRentalRate && avgSalePrice > 0
        ? Math.round((avgRentalRate * 12 / avgSalePrice) * 100 * 10) / 10
        : null;

      const inventoryDensity = bucket.requirements > 0
        ? Math.round((bucket.listings / total) * 100)
        : null;

      const name = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

      return {
        id: slug,
        name,
        avgSalePrice,
        avgRentalRate,
        activeListings: bucket.listings,
        rentalYield,
        inventoryDensity,
        bhkMix: {
          oneBhk: Math.round((bucket.bhkOne / bhkTotal) * 100),
          twoBhk: Math.round((bucket.bhkTwo / bhkTotal) * 100),
          threeBhk: Math.round((bucket.bhkThree / bhkTotal) * 100),
          fourPlus: Math.round((bucket.bhkFourPlus / bhkTotal) * 100),
        },
      };
    });

    return localities;
  } catch (error) {
    console.error("[www] Failed to fetch explore data", error);
    return [];
  }
}
