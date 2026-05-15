import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const SQLITE_PATH = process.env.GOLD_DB_PATH || '/home/vishal/walearn/listings.db';

type KnowledgeSeed = {
  knowledge_type: string;
  key: string;
  value: string;
  metadata: Record<string, unknown>;
  confidence: number;
  source: string;
};

async function extractKnowledge(): Promise<KnowledgeSeed[]> {
  const Database = require('better-sqlite3');
  const sqldb = new Database(SQLITE_PATH, { readonly: true });

  const seeds: KnowledgeSeed[] = [];

  // 1. Locality abbreviations from raw messages
  // Find common raw text fragments that map to specific localities
  const localityPatterns = sqldb.prepare(`
    SELECT r.content, s.locality
    FROM raw_messages r
    JOIN structured_listings s ON s.message_id = r.id
    WHERE s.locality IS NOT NULL AND r.content IS NOT NULL
      AND LENGTH(r.content) < 500
    ORDER BY RANDOM() LIMIT 1000
  `).all() as { content: string; locality: string }[];

  // Group by locality and find common keywords
  const localityKeywords = new Map<string, Map<string, number>>();
  for (const row of localityPatterns) {
    if (!row.content || !row.locality) continue;
    const words = row.content.toLowerCase()
      .replace(/[*#\n\r]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && w.length < 20);

    if (!localityKeywords.has(row.locality)) {
      localityKeywords.set(row.locality, new Map());
    }
    const kw = localityKeywords.get(row.locality)!;
    for (const word of words) {
      kw.set(word, (kw.get(word) || 0) + 1);
    }
  }

  // For each locality, find the top distinctive keywords
  for (const [locality, keywords] of localityKeywords) {
    const sorted = [...keywords.entries()]
      .filter(([k]) => !['the', 'for', 'and', 'with', 'available', 'bhk', 'sale', 'rent'].includes(k))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [keyword, count] of sorted) {
      if (count > 5) {
        const locKey = keyword.toLowerCase().replace(/[^a-z0-9]/g, '');
        seeds.push({
          knowledge_type: 'locality_keyword',
          key: locKey,
          value: locality,
          metadata: { frequency: count, original_keyword: keyword },
          confidence: Math.min(count / 20, 1),
          source: 'seed',
        });
      }
    }
  }

  // 2. Furnishing abbreviations
  const furnSamples = sqldb.prepare(`
    SELECT r.content, s.furnishing
    FROM raw_messages r
    JOIN structured_listings s ON s.message_id = r.id
    WHERE s.furnishing IS NOT NULL AND r.content IS NOT NULL
    ORDER BY RANDOM() LIMIT 500
  `).all() as { content: string; furnishing: string }[];

  const furnKeywords = new Map<string, Map<string, number>>();
  for (const row of furnSamples) {
    if (!row.content || !row.furnishing) continue;
    const words = row.content.toLowerCase()
      .replace(/[*#\n\r]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && w.length < 25);

    if (!furnKeywords.has(row.furnishing)) {
      furnKeywords.set(row.furnishing, new Map());
    }
    const kw = furnKeywords.get(row.furnishing)!;
    for (const word of words) {
      kw.set(word, (kw.get(word) || 0) + 1);
    }
  }

  const knownFurnWords = new Set(['furnished', 'furnish', 'unfurnished', 'uf', 'ff', 'sf', 'semi', 'fully', 'bare', 'shell']);
  for (const [furnishing, keywords] of furnKeywords) {
    const sorted = [...keywords.entries()]
      .filter(([k]) => knownFurnWords.has(k) || k.includes('furnish'))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [keyword, count] of sorted) {
      if (count > 3) {
        seeds.push({
          knowledge_type: 'furnishing_indicator',
          key: keyword.toLowerCase(),
          value: furnishing,
          metadata: { frequency: count },
          confidence: Math.min(count / 10, 1),
          source: 'seed',
        });
      }
    }
  }

  // 3. Transaction type indicators
  const typeSamples = sqldb.prepare(`
    SELECT r.content, s.transaction_type
    FROM raw_messages r
    JOIN structured_listings s ON s.message_id = r.id
    WHERE s.transaction_type IS NOT NULL AND r.content IS NOT NULL
    ORDER BY RANDOM() LIMIT 500
  `).all() as { content: string; transaction_type: string }[];

  const txnKeywords = new Map<string, Map<string, number>>();
  for (const row of typeSamples) {
    if (!row.content || !row.transaction_type) continue;
    const text = row.content.toLowerCase();
    const ttype = row.transaction_type === 'Rent/lease' ? 'Rent' : row.transaction_type;

    if (!txnKeywords.has(ttype)) {
      txnKeywords.set(ttype, new Map());
    }
    const kw = txnKeywords.get(ttype)!;
    const phrases = [
      ...text.matchAll(/(for\s+\w+|on\s+\w+|available\s+\w+|required|urgently|outright|sale|rent|lease)/gi)
    ].map(m => m[1].toLowerCase());
    for (const phrase of phrases) {
      kw.set(phrase, (kw.get(phrase) || 0) + 1);
    }
  }

  for (const [txType, keywords] of txnKeywords) {
    const sorted = [...keywords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [phrase, count] of sorted) {
      if (count > 3) {
        const value = txType === 'Rent' ? 'Rent/Lease' : txType;
        seeds.push({
          knowledge_type: 'type_indicator',
          key: phrase.toLowerCase(),
          value: value,
          metadata: { frequency: count },
          confidence: Math.min(count / 10, 1),
          source: 'seed',
        });
      }
    }
  }

  // 4. High-quality parsing examples (where all key fields were extracted)
  const bestExamples = sqldb.prepare(`
    SELECT r.content, s.bhk, s.transaction_type, s.locality, s.furnishing,
           s.price_lakhs, s.price_unit, s.area_sqft, s.prices_json, s.phones_json
    FROM raw_messages r
    JOIN structured_listings s ON s.message_id = r.id
    WHERE r.content IS NOT NULL
      AND s.bhk IS NOT NULL
      AND s.transaction_type IS NOT NULL
      AND s.price_lakhs IS NOT NULL
      AND LENGTH(r.content) < 500
    ORDER BY RANDOM() LIMIT 50
  `).all() as any[];

  for (const ex of bestExamples) {
    seeds.push({
      knowledge_type: 'parsing_example',
      key: ex.content.slice(0, 200),
      value: JSON.stringify({
        bhk: ex.bhk,
        transaction_type: ex.transaction_type,
        locality: ex.locality,
        furnishing: ex.furnishing,
        price_lakhs: ex.price_lakhs,
        price_unit: ex.price_unit,
        area_sqft: ex.area_sqft,
      }),
      metadata: { phones: ex.phones_json },
      confidence: 1.0,
      source: 'seed',
    });
  }

  sqldb.close();
  return seeds;
}

async function main() {
  console.log('Extracting knowledge from gold data...');
  const seeds = await extractKnowledge();
  console.log(`Extracted ${seeds.length} knowledge entries.`);

  // Clear existing seed data (keep learned data)
  const { error: delErr } = await db
    .from('domain_knowledge')
    .delete()
    .eq('source', 'seed');

  if (delErr) console.error('Clear failed:', delErr.message);
  else console.log('Cleared old seed data.');

  // Insert in batches
  const batchSize = 50;
  for (let i = 0; i < seeds.length; i += batchSize) {
    const batch = seeds.slice(i, i + batchSize);
    const { error } = await db.from('domain_knowledge').insert(batch);
    if (error) console.error(`Batch ${i} failed:`, error.message);
    else process.stdout.write('.');
  }
  console.log(`\nInserted ${seeds.length} knowledge entries.`);

  // Stats
  const { data: stats } = await db
    .from('domain_knowledge')
    .select('knowledge_type, source, COUNT(*)')
    .order('knowledge_type');
  console.log('\nKnowledge summary:');
  console.table(stats);
}

main().catch(console.error);
