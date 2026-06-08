import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";

dotenv.config();

const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const EMBED_URL = process.env.HETZNER_EMBED_URL || "http://116.202.9.89:11434";
const STATE_FILE = "/tmp/backfill_state.json";

function loadState() {
  if (!existsSync(STATE_FILE)) return { tableIdx: 0, offset: 0 };
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}
function saveState(s: any) { writeFileSync(STATE_FILE, JSON.stringify(s)); }

function ollamaOk(): boolean {
  try {
    const r = execSync(`curl -s --max-time 20 -o /dev/null -w "%{http_code}" -X POST ${EMBED_URL}/api/embeddings -d '{"model":"nomic-embed-text","prompt":"health"}'`, { timeout: 25000, encoding: "utf8" });
    return r.trim() === "200";
  } catch { return false; }
}

function genEmbed(text: string): number[] | null {
  try {
    const payload = JSON.stringify({ model: "nomic-embed-text", prompt: text });
    const r = execSync(`curl -s --max-time 25 -X POST ${EMBED_URL}/api/embeddings -d '${payload.replace(/'/g, "'\\''")}'`, { timeout: 30000, encoding: "utf8", maxBuffer: 1024 * 1024 });
    const d = JSON.parse(r) as { embedding?: number[] };
    return d.embedding ?? null;
  } catch { return null; }
}

function finger(row: any): string {
  return [row.property_category, row.deal_type, row.asset_class, row.building_name, row.micro_location, row.locality, row.city, row.bhk ? `${row.bhk}BHK` : null, row.price_label, row.furnishing, row.property_use].filter(Boolean).join(" | ");
}

async function main() {
  const tables = ["stream_items_residential", "stream_items_commercial"];
  let state = loadState();
  let consecutiveFails = 0;
  
  while (state.tableIdx < tables.length) {
    const table = tables[state.tableIdx];
    const { data, error } = await s.from(table)
      .select("id, locality, bhk, price_label, type, furnishing, building_name, property_use, city, property_category, deal_type, asset_class, micro_location")
      .is("embedding", null).order("id").range(state.offset, state.offset + 2);
    
    if (error) { console.error(`Error: ${error.message}`); break; }
    if (!data || !data.length) {
      console.log(`${table}: done`);
      state.tableIdx++; state.offset = 0; saveState(state);
      continue;
    }
    
    if (!ollamaOk()) {
      consecutiveFails++;
      const wait = Math.min(consecutiveFails * 10, 120);
      console.log(`Ollama down, waiting ${wait}s (fail #${consecutiveFails})`);
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }
    consecutiveFails = 0;
    
    for (const row of data) {
      const f = finger(row);
      if (!f) continue;
      const emb = genEmbed(f);
      if (!emb) continue;
      const { error: ue } = await s.from(table).update({ embedding: emb } as any).eq("id", row.id);
      if (ue) continue;
    }
    
    state.offset += 2; saveState(state);
    console.log(`${table}: offset=${state.offset}`);
  }
  console.log("Backfill complete");
}
main().catch(e => console.error(e));
