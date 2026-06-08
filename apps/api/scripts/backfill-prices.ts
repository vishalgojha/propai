import { createClient } from "@supabase/supabase-js";
import { parsePrice } from "@propai/price-parser";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function inferDealType(listingType: string, rawText: string): string | undefined {
  const t = listingType.toLowerCase();
  if (t.includes("rent")) return "rent";
  if (t.includes("sale")) return "sale";
  if (/\b(rent|rental|lease)\b/i.test(rawText)) return "rent";
  if (/\b(sale|outright|sell)\b/i.test(rawText)) return "sale";
  return undefined;
}

async function main() {
  // Only fix rows where price is suspiciously low for the type
  // or where price looks like area (price === area_sqft)
  const { data: rows, error } = await supabase
    .from("public_listings")
    .select("source_message_id, raw_message, price, size_sqft, listing_type, message_timestamp");

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  console.log(`Total rows: ${rows.length}`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.raw_message) {
      skipped++;
      continue;
    }

    const dealType = inferDealType(row.listing_type || "", row.raw_message);
    const parsed = parsePrice(row.raw_message, dealType);
    const newPrice = parsed.numeric;
    const oldPrice = row.price;

    if (newPrice === null || newPrice === oldPrice) {
      skipped++;
      continue;
    }

    // Skip if the new price is also clearly wrong (< 1000 for anything or > 100Cr)
    if (newPrice < 1000 || newPrice > 1_000_000_000) {
      skipped++;
      continue;
    }

    const { error: updateError } = await supabase
      .from("public_listings")
      .update({ price: newPrice })
      .eq("source_message_id", row.source_message_id);

    if (updateError) {
      console.error(`Update failed for ${row.source_message_id}:`, updateError.message);
    } else {
      updated++;
      if (oldPrice !== newPrice) {
        console.log(`  ${row.source_message_id}: ${oldPrice} → ${newPrice} (${parsed.label})`);
      }
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped`);
}

main().catch(console.error);
