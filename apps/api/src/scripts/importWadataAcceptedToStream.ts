/// <reference types="node" />
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '../config/supabase';
import { parseIndianLocation } from '../utils/locationParser';
import { normaliseIndianPhone } from '../utils/phoneUtils';
import { buildStreamContentHash, computeStreamCompleteness } from '../utils/streamQuality';
declare const process: any;

type AcceptedRecord = {
  chat_name: string;
  source_file: string;
  source_files: string[];
  message_index: number;
  segment_index: number;
  segment_count: number;
  timestamp: string;
  sender: string;
  sender_phone: string | null;
  contact_phone: string | null;
  text: string;
  text_normalized: string;
  record_type: 'listing' | 'requirement' | 'junk';
  deal_type: 'rent' | 'sale' | 'lease' | 'unknown';
  property_category: 'residential' | 'commercial' | 'land' | 'unknown';
  property_use: string | null;
  locality: string | null;
  locality_candidates: string[];
  building_name: string | null;
  bhk: string | null;
  area_sqft: number | null;
  price_numeric: number | null;
  price_label: string;
  price_basis: string;
  price_confidence: string;
  title: string | null;
  confidence_score: number;
  publish_state: 'accepted' | 'review' | 'rejected';
  rejection_reason: string | null;
  record_hash: string;
};

type CliOptions = {
  inputDir: string;
  tenantId: string | null;
  batchSize: number;
  dryRun: boolean;
};

type StreamTable = 'stream_items_residential' | 'stream_items_commercial';

function streamTableFor(propertyCategory?: string | null, propertyUse?: string | null): StreamTable {
  const cat = String(propertyCategory || '').toLowerCase();
  const use = String(propertyUse || '').toLowerCase();
  const commercialUses = ['office', 'retail', 'showroom', 'warehouse', 'industrial', 'shop', 'clinic', 'restaurant'];
  if (cat === 'commercial' || commercialUses.includes(use)) {
    return 'stream_items_commercial';
  }
  return 'stream_items_residential';
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputDir: path.resolve(process.cwd(), 'reports', 'wadata-import'),
    tenantId: process.env.PROPAI_TENANT_ID || null,
    batchSize: 100,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--') {
      continue;
    }

    if (arg === '--input' && next) {
      options.inputDir = path.resolve(next);
      index += 1;
    } else if (arg === '--tenant' && next) {
      options.tenantId = next.trim();
      index += 1;
    } else if (arg === '--batch-size' && next) {
      const value = Number(next);
      options.batchSize = Number.isFinite(value) && value > 0 ? Math.floor(value) : 100;
      index += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

function extractPhone(text: string): string | null {
  const match = String(text || '').match(/(?:\+?91[\s-]?)?([6-9]\d{9})/);
  if (!match?.[1]) return null;
  return normaliseIndianPhone(match[1]);
}

function normalizeLocality(record: AcceptedRecord): { locality: string | null; city: string | null } {
  const candidates = [
    record.locality,
    record.title,
    record.text,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const parsed = parseIndianLocation(candidate);
    if (parsed?.locality) {
      return { locality: parsed.locality, city: parsed.city === 'Unknown' ? null : parsed.city };
    }
  }

  const cleaned = String(record.locality || '').trim();
  if (cleaned && !/^unknown$/i.test(cleaned)) {
    return { locality: cleaned, city: null };
  }

  return { locality: null, city: null };
}

function inferStreamType(record: AcceptedRecord): 'Rent' | 'Sale' | 'Requirement' | 'Pre-leased' | 'Lease' {
  if (record.record_type === 'requirement') return 'Requirement';
  const lower = `${record.title || ''} ${record.text}`.toLowerCase();
  if (record.deal_type === 'rent' || lower.includes('for rent') || lower.includes(' on rent') || lower.includes('/mo') || lower.includes('/month')) return 'Rent';
  if (record.deal_type === 'lease' || lower.includes('leave and license') || lower.includes('leave & license')) return 'Lease';
  if (record.deal_type === 'sale' || lower.includes('for sale') || lower.includes('outright') || lower.includes('resale')) return 'Sale';
  return 'Requirement';
}

function inferAssetClass(record: AcceptedRecord): string {
  if (record.property_category === 'commercial') return 'commercial';
  if (record.property_category === 'land') return 'land';
  if (record.property_category === 'residential') return 'residential';
  return record.bhk ? 'residential' : 'unknown';
}

function inferPropertyUse(record: AcceptedRecord): string | null {
  if (record.property_use) return record.property_use;
  const text = `${record.title || ''} ${record.text}`.toLowerCase();
  if (text.includes('office')) return 'office';
  if (text.includes('shop')) return 'shop';
  if (text.includes('showroom')) return 'showroom';
  if (text.includes('warehouse') || text.includes('godown')) return 'warehouse';
  if (text.includes('flat') || text.includes('apartment')) return 'flat';
  return null;
}

function parseBhk(value: string | null): number | null {
  if (!value) return null;
  const match = String(value).match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

function buildParsedPayload(record: AcceptedRecord, locality: string | null, city: string | null, sourcePhone: string | null) {
  return {
    origin: 'wadata',
    chatName: cleanText(record.chat_name),
    sourceFile: cleanText(record.source_file),
    segmentIndex: record.segment_index,
    segmentCount: record.segment_count,
    text: cleanText(record.text),
    title: cleanText(record.title),
    confidenceScore: record.confidence_score,
    publishState: record.publish_state,
    rejectionReason: cleanText(record.rejection_reason),
    sourcePhone,
    locality,
    city,
    dealType: record.deal_type,
    recordType: record.record_type,
    propertyCategory: record.property_category,
    propertyUse: inferPropertyUse(record),
    buildingName: cleanText(record.building_name),
    importedAt: new Date().toISOString(),
  };
}

async function readJsonl(filePath: string): Promise<AcceptedRecord[]> {
  const records: AcceptedRecord[] = [];
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = JSON.parse(trimmed) as AcceptedRecord;
    if (parsed.publish_state !== 'accepted') continue;
    records.push(parsed);
  }

  return records;
}

async function upsertBatch(rows: any[]): Promise<number> {
  if (!rows.length || !supabaseAdmin) return 0;
  const grouped = new Map<StreamTable, any[]>();
  for (const row of rows) {
    const targetTable = row._targetTable as StreamTable;
    const existing = grouped.get(targetTable) || [];
    existing.push(row);
    grouped.set(targetTable, existing);
  }

  let inserted = 0;
  for (const [targetTable, groupRows] of grouped.entries()) {
    const payload = groupRows.map(({ _targetTable, ...row }) => row);
    const { error } = await supabaseAdmin
      .from(targetTable)
      .upsert(payload, { onConflict: 'tenant_id,message_id' });
    if (error) {
      if (groupRows.length === 1) {
        console.warn(JSON.stringify({
          event: 'wadata_import_row_skipped',
          table: targetTable,
          message_id: groupRows[0].message_id,
          source_message_id: groupRows[0].source_message_id,
          reason: error.message,
        }));
        continue;
      }

      const midpoint = Math.floor(groupRows.length / 2);
      inserted += await upsertBatch(groupRows.slice(0, midpoint));
      inserted += await upsertBatch(groupRows.slice(midpoint));
      continue;
    }

    inserted += groupRows.length;
  }

  return inserted;
}

async function upsertCanonicalBatch(rows: any[]): Promise<number> {
  if (!rows.length || !supabaseAdmin) return 0;

  const payload = rows.map(({ _targetTable, ...row }) => row);
  const { error } = await supabaseAdmin
    .from('stream_items')
    .upsert(payload, { onConflict: 'tenant_id,message_id' });

  if (!error) {
    return payload.length;
  }

  if (payload.length === 1) {
    console.warn(JSON.stringify({
      event: 'wadata_canonical_row_skipped',
      message_id: payload[0].message_id,
      source_message_id: payload[0].source_message_id,
      reason: error.message,
    }));
    return 0;
  }

  const midpoint = Math.floor(payload.length / 2);
  const [left, right] = await Promise.all([
    upsertCanonicalBatch(payload.slice(0, midpoint)),
    upsertCanonicalBatch(payload.slice(midpoint)),
  ]);
  return left + right;
}

async function upsertPublicStreamBatch(rows: any[]): Promise<number> {
  if (!rows.length || !supabaseAdmin) return 0;

  const payload = rows.map(({ _targetTable, ...row }) => row);
  const { error } = await supabaseAdmin
    .from('stream_items')
    .upsert(payload, { onConflict: 'tenant_id,message_id' });

  if (!error) {
    return payload.length;
  }

  if (payload.length === 1) {
    console.warn(JSON.stringify({
      event: 'wadata_public_stream_row_skipped',
      message_id: payload[0].message_id,
      source_message_id: payload[0].source_message_id,
      reason: error.message,
    }));
    return 0;
  }

  const midpoint = Math.floor(payload.length / 2);
  const [left, right] = await Promise.all([
    upsertPublicStreamBatch(payload.slice(0, midpoint)),
    upsertPublicStreamBatch(payload.slice(midpoint)),
  ]);
  return left + right;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tenantId = options.tenantId || 'dry-run-tenant';

  if (!options.dryRun && !supabaseAdmin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  if (!options.dryRun && !options.tenantId) {
    throw new Error('--tenant or PROPAI_TENANT_ID is required');
  }

  const inputPath = path.join(options.inputDir, 'accepted.jsonl');
  if (!fs.existsSync(inputPath)) {
    throw new Error(`accepted.jsonl not found at ${inputPath}`);
  }

  const records = await readJsonl(inputPath);
  let processed = 0;
  let inserted = 0;
  let publicInserted = 0;
  let canonicalInserted = 0;
  const batch: Array<Record<string, unknown> & { _targetTable: StreamTable }> = [];
  const publicBatch: Array<Record<string, unknown>> = [];
  const canonicalBatch: Array<Record<string, unknown>> = [];

  for (const record of records) {
    const normalized = normalizeLocality(record);
    const sourcePhone = normaliseIndianPhone(record.sender_phone || record.contact_phone || extractPhone(record.text) || undefined);
    const streamType = inferStreamType(record);
    const targetTable = streamTableFor(record.property_category, inferPropertyUse(record));
    const locality = normalized.locality;
    const city = normalized.city;
    const messageId = `wadata:${record.record_hash}`;
    const sourceGroupId = `wadata:${createHash('sha1').update(record.chat_name).digest('hex').slice(0, 16)}`;
    const sourceGroupName = record.chat_name;
    const completeness = computeStreamCompleteness({
      locality,
      bhk: record.bhk,
      sqft: record.area_sqft,
      priceNumeric: record.price_numeric,
      brokerContactValid: Boolean(sourcePhone),
    });

    const row = {
      tenant_id: tenantId,
      message_id: messageId,
      source_group_id: cleanText(sourceGroupId),
      source_group_name: cleanText(sourceGroupName),
      source_phone: cleanText(sourcePhone),
      raw_text: cleanText(record.text),
      type: cleanText(streamType),
      record_type: cleanText(record.record_type),
      locality: cleanText(locality),
      city: cleanText(city),
      price_label: cleanText(record.price_label),
      price_numeric: record.price_numeric,
      deal_type: cleanText(record.deal_type),
      property_category: cleanText(record.property_category === 'commercial' ? 'commercial' : 'residential'),
      area_sqft: record.area_sqft,
      confidence_score: record.confidence_score,
      ingestion_status: 'accepted',
      created_at: record.timestamp,
      _targetTable: targetTable,
    };

    const publicRow = {
      ...row,
      parsed_payload: buildParsedPayload(record, locality, city, sourcePhone),
      property_use: inferPropertyUse(record),
      floor_number: null,
      total_floors: null,
      furnishing: null,
    };

    const canonicalRow = {
      tenant_id: tenantId,
      message_id: messageId,
      source_message_id: `${record.source_file}:${record.message_index}:${record.segment_index}`,
      source_group_id: cleanText(sourceGroupId),
      source_group_name: cleanText(sourceGroupName),
      source_phone: cleanText(sourcePhone),
      raw_text: cleanText(record.text),
      type: cleanText(streamType),
      record_type: cleanText(record.record_type),
      locality: cleanText(locality),
      city: cleanText(city),
      bhk: cleanText(record.bhk),
      building_name: cleanText(record.building_name),
      price_label: cleanText(record.price_label),
      price_numeric: record.price_numeric,
      deal_type: cleanText(record.deal_type),
      asset_class: cleanText(record.property_category === 'commercial' ? 'commercial' : 'residential'),
      property_category: cleanText(record.property_category === 'commercial' ? 'commercial' : 'residential'),
      area_sqft: record.area_sqft,
      furnishing: null,
      floor_number: null,
      total_floors: null,
      property_use: inferPropertyUse(record),
      confidence_score: record.confidence_score,
      parsed_payload: buildParsedPayload(record, locality, city, sourcePhone),
      ingestion_status: 'accepted',
      suppression_reason: null,
      suppressed_at: null,
      resolution_context: {
        origin: 'wadata',
        chatName: cleanText(record.chat_name),
        sourceFile: cleanText(record.source_file),
        segmentIndex: record.segment_index,
        segmentCount: record.segment_count,
        title: cleanText(record.title),
        publishState: record.publish_state,
      },
      created_at: record.timestamp,
    };

    processed += 1;
    if (options.dryRun) {
      continue;
    }

    batch.push(row);
    publicBatch.push(publicRow);
    canonicalBatch.push(canonicalRow);
    if (batch.length >= options.batchSize) {
        inserted += await upsertBatch(batch.splice(0, batch.length));
        publicInserted += await upsertPublicStreamBatch(publicBatch.splice(0, publicBatch.length));
        canonicalInserted += await upsertCanonicalBatch(canonicalBatch.splice(0, canonicalBatch.length));
      }
  }

  if (!options.dryRun && batch.length) {
    inserted += await upsertBatch(batch.splice(0, batch.length));
  }

  if (!options.dryRun && publicBatch.length) {
    publicInserted += await upsertPublicStreamBatch(publicBatch.splice(0, publicBatch.length));
  }

  if (!options.dryRun && canonicalBatch.length) {
    canonicalInserted += await upsertCanonicalBatch(canonicalBatch.splice(0, canonicalBatch.length));
  }

  console.log(
    JSON.stringify(
      {
        input: inputPath,
        processed,
        inserted: options.dryRun ? 0 : inserted,
        public_inserted: options.dryRun ? 0 : publicInserted,
        canonical_inserted: options.dryRun ? 0 : canonicalInserted,
        dry_run: options.dryRun,
        tenant: tenantId,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
