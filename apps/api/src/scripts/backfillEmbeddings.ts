import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { execSync } from "child_process";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL / SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EMBED_URL = process.env.HETZNER_EMBED_URL || "http://116.202.9.89:11434";
const BATCH_SIZE = 10;

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const payload = JSON.stringify({ model: "nomic-embed-text", prompt: text });
    const result = execSync(`curl -s --max-time 15 -X POST ${EMBED_URL}/api/embeddings -d '${payload.replace(/'/g, "'\\''")}'`, {
      timeout: 20000,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    const data = JSON.parse(result) as { embedding?: number[] };
    return data.embedding ?? null;
  } catch {
    return null;
  }
}

function buildFingerprint(row: Record<string, unknown>): string {
  return [
    row.property_category,
    row.deal_type,
    row.asset_class,
    row.building_name,
    row.micro_location,
    row.locality,
    row.city,
    row.bhk ? `${row.bhk}BHK` : null,
    row.price_label,
    row.furnishing,
    row.property_use,
  ]
    .map((p) => String(p || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" | ");
}

async function backfillTable(table: string) {
  let offset = 0;
  let done = 0;
  let failed = 0;

  while (true) {
    console.log(`${table}: fetching offset ${offset}`);
    const { data: rows, error } = await supabase
      .from(table)
      .select("id, locality, bhk, price_numeric, price_label, type, furnishing, building_name, property_use, city, property_category, deal_type, asset_class, micro_location")
      .is("embedding", null)
      .order("id")
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) { console.error(`Fetch error:`, error.message); break; }
    if (!rows || rows.length === 0) { console.log(`${table}: no more rows`); break; }
    console.log(`${table}: got ${rows.length} rows`);

    for (const row of rows) {
      const fingerprint = buildFingerprint(row);
      if (!fingerprint) { failed++; console.log(`  skip id=${row.id?.toString().substring(0,8)}, no fingerprint`); continue; }

      const embedding = await generateEmbedding(fingerprint);
      if (!embedding) { failed++; console.log(`  fail id=${row.id?.toString().substring(0,8)}, no embedding`); continue; }

      const { error: updateErr } = await supabase
        .from(table)
        .update({ embedding } as any)
        .eq("id", row.id);

      if (updateErr) { failed++; console.log(`  fail id=${row.id?.toString().substring(0,8)}, update: ${updateErr.message}`); }
      else { done++; }

      await new Promise((r) => setTimeout(r, 200));
    }

    offset += BATCH_SIZE;
    console.log(`${table}: progress: done=${done} failed=${failed}`);
  }

  return { done, failed };
}

async function main() {
  console.log("Backfilling embeddings...");
  for (const table of ["stream_items_residential", "stream_items_commercial"]) {
    const { done, failed } = await backfillTable(table);
    console.log(`${table}: done=${done} failed=${failed}`);
  }
  console.log("Done");
}

main().catch(console.error);
