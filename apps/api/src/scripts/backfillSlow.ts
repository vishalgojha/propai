import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";

dotenv.config();
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const EMBED_URL = "http://116.202.9.89:11434";
const STATE_FILE = "/tmp/backfill_state2.json";

function ls() {
  if (!existsSync(STATE_FILE)) return { tableIdx: 0, offset: 0 };
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}
function ss(x: any) { writeFileSync(STATE_FILE, JSON.stringify(x)); }

function callEmbed(text: string): number[] | null {
  try {
    const payload = JSON.stringify({ model: "nomic-embed-text", prompt: text });
    const r = execSync(`curl -s --max-time 30 -X POST ${EMBED_URL}/api/embeddings -d '${payload.replace(/'/g, "'\\''")}'`, { timeout: 35000, encoding: "utf8", maxBuffer: 1024*1024 });
    const d = JSON.parse(r) as { embedding?: number[] };
    return d.embedding ?? null;
  } catch { return null; }
}

function fp(row: any): string {
  return [row.property_category, row.deal_type, row.asset_class, row.building_name, row.micro_location, row.locality, row.city, row.bhk ? `${row.bhk}BHK` : null, row.price_label, row.furnishing, row.property_use].filter(Boolean).join(" | ");
}

async function run() {
  const tables = ["stream_items_residential", "stream_items_commercial"];
  let state = ls();
  let sinceLastOk = 0;

  while (state.tableIdx < tables.length) {
    const table = tables[state.tableIdx];
    
    // Get one row at a time
    const { data, error } = await s.from(table)
      .select("id, locality, bhk, price_label, type, furnishing, building_name, property_use, city, property_category, deal_type, asset_class, micro_location")
      .is("embedding", null).order("id").range(state.offset, state.offset);
    
    if (error) { console.error(error.message); break; }
    if (!data || !data.length) {
      console.log(`${table}: done (${state.offset} processed)`);
      state.tableIdx++; state.offset = 0; ss(state);
      continue;
    }

    // Throttle: if we haven't checked health recently, do it
    sinceLastOk++;
    if (sinceLastOk > 3) {
      try {
        execSync(`curl -s --max-time 10 -o /dev/null -w "%{http_code}" -X POST ${EMBED_URL}/api/embeddings -d '{"model":"nomic-embed-text","prompt":"h"}'`, { timeout: 15000, encoding: "utf8" });
        sinceLastOk = 0;
      } catch {
        console.log("Ollama slow, waiting 20s...");
        await new Promise(r => setTimeout(r, 20000));
        continue;
      }
    }

    const row = data[0];
    const f = fp(row);
    if (f) {
      const emb = callEmbed(f);
      if (emb) {
        await s.from(table).update({ embedding: emb } as any).eq("id", row.id);
        state.offset++; ss(state);
        const total = (state.tableIdx === 0 ? state.offset : "(commercial)");
        if (state.offset % 10 === 0) console.log(`${table}: ${total}`);
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log("DONE");
}
run().catch(console.error);
