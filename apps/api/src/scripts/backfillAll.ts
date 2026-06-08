import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";

const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucWtjY3RlZ3BxeGp2Z2RnYWtmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg3MzgxMiwiZXhwIjoyMDkzNDQ5ODEyfQ.OrN3VjFNJj7CFxox1nhAlV0a7OzD_poxu5F6KzK4ue4"
const SUPABASE = "https://mnqkcctegpqxjvgdgakf.supabase.co"
const OLLAMA = "http://116.202.9.89:11434"
const STATE_FILE = "/tmp/bf_state.json"

function rest(url: string, method = "GET", body?: string): string {
  try {
    const cmd = `curl -s --max-time 10 -X ${method} "${url}" -H "apikey: ${API_KEY}" -H "Authorization: Bearer ${API_KEY}" -H "Content-Type: application/json" ${body ? `-d '${body.replace(/'/g, "'\\''")}'` : ""}`
    return execSync(cmd, { timeout: 15000, encoding: "utf8", maxBuffer: 5*1024*1024 });
  } catch (e: any) {
    return e.stdout?.toString() || "";
  }
}

function callEmbed(fp: string): string | null {
  try {
    const payload = JSON.stringify({ model: "nomic-embed-text", prompt: fp });
    const r = execSync(`curl -s --max-time 25 -X POST ${OLLAMA}/api/embeddings -d '${payload.replace(/'/g, "'\\''")}'`, { timeout: 30000, encoding: "utf8" });
    const d = JSON.parse(r);
    return d.embedding ? JSON.stringify(d.embedding) : null;
  } catch { return null; }
}

function ls() {
  if (!existsSync(STATE_FILE)) return { tableIdx: 0, rowIdx: 0 };
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}
function ss(x: any) { writeFileSync(STATE_FILE, JSON.stringify(x)); }

async function run() {
  const tables = ["stream_items_commercial", "stream_items_residential"];
  let state = ls();
  let done = 0, fail = 0;
  
  while (state.tableIdx < tables.length) {
    const table = tables[state.tableIdx];
    
    // Get all rows at once (they're only 1000 each)
    const raw = rest(`${SUPABASE}/rest/v1/${table}?select=id,embedding&limit=2000`);
    if (!raw) { state.tableIdx++; ss(state); continue; }
    
    let allRows: any[];
    try { allRows = JSON.parse(raw); } catch { state.tableIdx++; ss(state); continue; }
    
    // Find rows without embeddings (starting from saved offset)
    let nullRows: any[] = [];
    for (let i = state.rowIdx; i < allRows.length; i++) {
      const r = allRows[i];
      if (r.embedding === null || typeof r.embedding !== "string" || !r.embedding.startsWith("[")) {
        nullRows.push(r);
      }
    }
    
    if (nullRows.length === 0) { console.log(`${table}: all done`); state.tableIdx++; state.rowIdx = 0; ss(state); continue; }
    console.log(`${table}: ${nullRows.length} remaining (from ${state.rowIdx})`);
    
    for (const row of nullRows) {
      // Get full row data
      const fullRaw = rest(`${SUPABASE}/rest/v1/${table}?select=locality,bhk,price_label,type,furnishing,building_name,property_use,city,property_category,deal_type,asset_class,micro_location&id=eq.${row.id}&limit=1`);
      let r: any;
      try { r = JSON.parse(fullRaw)[0]; } catch { fail++; continue; }
      if (!r) { fail++; continue; }
      
      const parts = [r.property_category, r.deal_type, r.asset_class, r.building_name, r.micro_location, r.locality, r.city, r.bhk ? `${r.bhk}BHK` : null, r.price_label, r.furnishing, r.property_use];
      const fp = parts.filter(Boolean).join(" | ");
      if (!fp) { fail++; continue; }
      
      const emb = callEmbed(fp);
      if (!emb) { fail++; continue; }
      
      rest(`${SUPABASE}/rest/v1/${table}?id=eq.${row.id}`, "PATCH", `{"embedding":${emb}}`);
      done++;
      
      state.rowIdx = parseInt(row.id, 36) || state.rowIdx;
      if ((done + fail) % 5 === 0) console.log(`${table}: done=${done} fail=${fail}`);
      await new Promise(r => setTimeout(r, 800));
    }
    
    state.tableIdx++; state.rowIdx = 0; ss(state);
  }
  console.log(`DONE: done=${done} fail=${fail}`);
}
run().catch(console.error);
