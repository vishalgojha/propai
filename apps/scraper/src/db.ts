import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import type { ExtractedListing } from "./types.js";

const DB_PATH = process.env.SCRAPER_DB_PATH || path.join(process.cwd(), "listings.db");

let _db: Database.Database | null = null;

function db(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    initTables();
  }
  return _db;
}

function initTables(): void {
  const d = db();
  d.exec(`
    CREATE TABLE IF NOT EXISTS raw_messages (
      id TEXT PRIMARY KEY,
      chat_jid TEXT,
      sender TEXT,
      content TEXT,
      timestamp TEXT,
      chat_name TEXT
    );

    CREATE TABLE IF NOT EXISTS structured_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE,
      chat_name TEXT,
      sender TEXT,
      timestamp TEXT,
      bhk TEXT,
      transaction_type TEXT,
      locality TEXT,
      furnishing TEXT,
      parking INTEGER DEFAULT 0,
      area_sqft INTEGER,
      price_value REAL,
      price_unit TEXT,
      price_lakhs REAL,
      prices_json TEXT DEFAULT '[]',
      all_localities_json TEXT DEFAULT '[]',
      phones_json TEXT DEFAULT '[]',
      content_preview TEXT,
      content_hash TEXT,
      listing_hash TEXT,
      FOREIGN KEY (message_id) REFERENCES raw_messages(id)
    );
  `);

  const existing = (d.pragma("table_info(structured_listings)") as any[]).map((r: any) => r.name);
  const addCol = (col: string, def: string) => {
    if (!existing.includes(col)) {
      d.exec(`ALTER TABLE structured_listings ADD COLUMN ${col} ${def}`);
    }
  };
  addCol("content_hash", "TEXT");
  addCol("listing_hash", "TEXT");

  d.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_message_id ON structured_listings(message_id);
    CREATE INDEX IF NOT EXISTS idx_listings_bhk ON structured_listings(bhk);
    CREATE INDEX IF NOT EXISTS idx_listings_type ON structured_listings(transaction_type);
    CREATE INDEX IF NOT EXISTS idx_listings_locality ON structured_listings(locality);
    CREATE INDEX IF NOT EXISTS idx_listings_price ON structured_listings(price_lakhs);
    CREATE INDEX IF NOT EXISTS idx_listings_timestamp ON structured_listings(timestamp);
  `);
}

export function contentHash(text: string): string {
  return crypto.createHash("sha256").update(text, "utf-8").digest("hex").slice(0, 16);
}

export function listingHash(
  bhk: string | null,
  locality: string | null,
  priceLakhs: number | null,
  phonesJson: string,
): string | null {
  const phones: string[] = JSON.parse(phonesJson || "[]");
  const key = [bhk ?? "", locality ?? "", priceLakhs ? String(Math.round(priceLakhs * 100) / 100) : "", [...phones].sort().join(",")].join("|");
  if (!key.replace(/\|/g, "")) return null;
  return crypto.createHash("md5").update(key).digest("hex").slice(0, 16);
}

export function rawMessageExists(msgId: string): boolean {
  const row = db().prepare("SELECT 1 FROM raw_messages WHERE id = ?").get(msgId);
  return !!row;
}

export function insertRawMessage(
  msgId: string,
  chatJid: string,
  sender: string,
  content: string,
  ts: string,
  chatName: string,
): void {
  db()
    .prepare(
      "INSERT OR IGNORE INTO raw_messages (id, chat_jid, sender, content, timestamp, chat_name) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(msgId, chatJid, sender, content, ts, chatName);
}

export function upsertListing(listing: ExtractedListing): void {
  db()
    .prepare(
      `INSERT OR IGNORE INTO structured_listings
       (message_id, chat_name, sender, timestamp,
        bhk, transaction_type, locality, furnishing, parking,
        area_sqft, price_value, price_unit, price_lakhs,
        prices_json, all_localities_json, phones_json,
        content_preview, content_hash, listing_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      listing.message_id,
      listing.chat_name,
      listing.sender,
      listing.timestamp,
      listing.bhk,
      listing.transaction_type,
      listing.locality,
      listing.furnishing,
      listing.parking,
      listing.area_sqft,
      listing.price_value,
      listing.price_unit,
      listing.price_lakhs,
      listing.prices_json,
      listing.all_localities_json,
      listing.phones_json,
      listing.content_preview,
      listing.content_hash,
      listing.listing_hash,
    );
}

export function queryListings(opts: {
  transactionType?: string;
  bhk?: string;
  locality?: string;
  minPrice?: number;
  maxPrice?: number;
  furnishing?: string;
  limit?: number;
  offset?: number;
}): ExtractedListing[] {
  const { transactionType, bhk, locality, minPrice, maxPrice, furnishing, limit = 50, offset = 0 } = opts;
  const clauses: string[] = [];
  const params: any[] = [];

  if (transactionType) {
    clauses.push("transaction_type = ?");
    params.push(transactionType);
  }
  if (bhk) {
    clauses.push("bhk = ?");
    params.push(bhk);
  }
  if (locality) {
    clauses.push("locality LIKE ?");
    params.push(`%${locality}%`);
  }
  if (minPrice !== undefined) {
    clauses.push("price_lakhs >= ?");
    params.push(minPrice);
  }
  if (maxPrice !== undefined) {
    clauses.push("price_lakhs <= ?");
    params.push(maxPrice);
  }
  if (furnishing) {
    clauses.push("furnishing = ?");
    params.push(furnishing);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(limit, offset);
  const rows = db()
    .prepare(`SELECT * FROM structured_listings ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
    .all(...params) as ExtractedListing[];
  return rows;
}

export function getStats(): Record<string, any> {
  const d = db();
  const total = (d.prepare("SELECT COUNT(*) as c FROM structured_listings").get() as any).c;
  const byType = d.prepare("SELECT transaction_type, COUNT(*) as c FROM structured_listings GROUP BY transaction_type").all() as any[];
  const byBhk = d.prepare("SELECT bhk, COUNT(*) as c FROM structured_listings WHERE bhk IS NOT NULL GROUP BY bhk ORDER BY c DESC LIMIT 10").all() as any[];
  const byLocality = d.prepare("SELECT locality, COUNT(*) as c FROM structured_listings WHERE locality IS NOT NULL GROUP BY locality ORDER BY c DESC LIMIT 15").all() as any[];

  return {
    total_listings: total,
    by_type: Object.fromEntries(byType.map((r: any) => [r.transaction_type, r.c])),
    by_bhk: Object.fromEntries(byBhk.map((r: any) => [r.bhk, r.c])),
    by_locality: Object.fromEntries(byLocality.map((r: any) => [r.locality, r.c])),
  };
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
