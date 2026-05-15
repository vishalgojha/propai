import { extractAll } from "./extractor.js";
import { generateEmbedding } from "./embed.js";
import {
  rawMessageExists,
  insertRawMessage,
  upsertListing,
  getStats,
  contentHash,
  listingHash,
} from "./db.js";
import type { RawMessage, IngestPayload } from "./types.js";

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const INTERVAL_MS = parseInt(process.env.POLL_INTERVAL || "30000", 10);
const TENANT_ID = process.env.TENANT_ID || "00000000-0000-0000-0000-000000000001";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INGEST_URL = process.env.INGEST_URL || "http://localhost:3000/api/listings/ingest";

interface MCPRow {
  id: string;
  chat_jid?: string;
  sender?: string;
  content?: string;
  timestamp?: string;
  chat_name?: string;
}

export interface PipelineOptions {
  max?: number;
  webhook?: boolean;
}

async function sendWebhook(
  payload: IngestPayload,
): Promise<void> {
  console.log(`Flushing ${payload.message_id} to ${INGEST_URL}...`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-tenant-id": TENANT_ID,
  };
  if (SERVICE_ROLE_KEY) headers["x-service-key"] = SERVICE_ROLE_KEY;

  const res = await fetch(INGEST_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ingest failed (${res.status}): ${body}`);
  }

  const result = await res.json();
  console.log(`Flushed ${payload.message_id}:`, result);
}

export async function processMessage(
  msg: MCPRow,
  opts: PipelineOptions,
): Promise<void> {
  if (rawMessageExists(msg.id)) return;

  insertRawMessage(
    msg.id,
    msg.chat_jid || "",
    msg.sender || "unknown",
    msg.content || "",
    msg.timestamp || new Date().toISOString(),
    msg.chat_name || "",
  );

  const text = msg.content || "";
  const extracted = extractAll(text);
  const preview = text.slice(0, 200);

  const listing: import("./types.js").ExtractedListing = {
    message_id: msg.id,
    chat_name: msg.chat_name || "",
    sender: msg.sender || "unknown",
    timestamp: msg.timestamp || new Date().toISOString(),
    bhk: extracted.bhk,
    transaction_type: extracted.transaction_type,
    locality: extracted.locality,
    furnishing: extracted.furnishing,
    parking: extracted.parking,
    area_sqft: extracted.area_sqft,
    price_value: extracted.price_value,
    price_unit: extracted.price_unit,
    price_lakhs: extracted.price_lakhs,
    prices_json: JSON.stringify(extracted.prices),
    all_localities_json: JSON.stringify(extracted.localities),
    phones_json: JSON.stringify(extracted.phones),
    content_preview: preview,
    content_hash: contentHash(text),
    listing_hash: listingHash(extracted.bhk, extracted.locality, extracted.price_lakhs, JSON.stringify(extracted.phones)),
  };

  upsertListing(listing);
  console.log(`Ingested ${msg.id}: ${extracted.bhk ?? "?"} ${extracted.transaction_type ?? "?"} ${extracted.locality ?? "?"}`);

  if (opts.webhook && WEBHOOK_URL) {
    // Legacy webhook (simple POST)
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(listing),
    }).catch((e) => console.error(`Webhook failed: ${e.message}`));
  }

  if (opts.webhook && SERVICE_ROLE_KEY && INGEST_URL) {
    const payload: IngestPayload = {
      message_id: msg.id,
      chat_name: msg.chat_name || "",
      sender: msg.sender || "unknown",
      timestamp: msg.timestamp || new Date().toISOString(),
      content: text,
      ...extracted,
    };

    try {
      await sendWebhook(payload);
    } catch (e: any) {
      console.error(`Ingest webhook failed for ${msg.id}: ${e.message}`);
    }
  }
}

export async function runPipeline(opts: PipelineOptions): Promise<{ processed: number }> {
  const { default: Database } = await import("better-sqlite3");

  const mcpDbPath = process.env.MCP_DB_PATH;
  if (!mcpDbPath) {
    throw new Error("MCP_DB_PATH env var required (path to WhatsApp MCP SQLite DB)");
  }

  const mcp = new Database(mcpDbPath, { readonly: true });
  let processed = 0;

  try {
    const rows = mcp
      .prepare("SELECT id, chat_jid, sender, content, timestamp, chat_name FROM messages ORDER BY timestamp ASC")
      .all() as MCPRow[];

    console.log(`Found ${rows.length} messages in MCP DB`);

    const toProcess = opts.max ? rows.slice(0, opts.max) : rows;

    for (const msg of toProcess) {
      await processMessage(msg, opts);
      processed++;
    }
  } finally {
    mcp.close();
  }

  const stats = getStats();
  console.log(`Processed ${processed} messages. Total listings: ${stats.total_listings}`);

  return { processed };
}

export async function watchLoop(opts: PipelineOptions): Promise<void> {
  console.log(`Starting watch loop (every ${INTERVAL_MS}ms)...`);

  const run = async () => {
    try {
      await runPipeline(opts);
    } catch (e: any) {
      console.error(`Pipeline error:`, e.message);
    }
  };

  await run();

  setInterval(run, INTERVAL_MS);
}
