import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { embedStreamItem } from '../services/embeddingService';

let running = false;

export async function backfillEmbeddings(req: Request, res: Response) {
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey !== process.env.ADMIN_API_KEY && apiKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (running) {
    return res.json({ status: 'already_running', message: 'Backfill already in progress' });
  }

  const dryRun = req.query.dry === 'true';
  const batchSize = Math.min(Number(req.query.batch) || 10, 50);
  const maxTotal = Math.min(Number(req.query.max) || Infinity, 100000);

  running = true;
  res.json({ status: 'started', message: 'Backfill running in background' });

  const admin = supabaseAdmin!;
  let totalDone = 0;
  const results: { table: string; done: number; failed: number }[] = [];

  try {
    for (const table of ['stream_items_commercial', 'stream_items_residential'] as const) {
      let offset = 0;
      let done = 0;
      let failed = 0;

      while (done + failed < maxTotal) {
        const { data: rows, error } = await (admin
          .from(table)
          .select('id, locality, bhk, price_label, type, furnishing, building_name, property_use, city, property_category, deal_type, asset_class, micro_location, parsed_payload, record_type')
          .is('embedding', null)
          .order('id')
          .range(offset, offset + batchSize - 1) as any);

        if (error) { console.error(`[backfill] error: ${error.message}`); break; }
        if (!rows || rows.length === 0) break;

        for (const row of rows) {
          if (done + failed >= maxTotal) break;

          try {
            const parsedPayload = row.parsed_payload as Record<string, any> | null;
            const embedding = await embedStreamItem({
              record_type: row.record_type || null,
              deal_type: row.deal_type || row.type?.toLowerCase() || null,
              asset_class: row.asset_class || null,
              property_category: row.property_category || null,
              building_name: row.building_name || null,
              micro_location: parsedPayload?.microLocation || null,
              locality: row.locality || null,
              city: row.city || null,
              bhk: row.bhk ? `${row.bhk}BHK` : null,
              price_label: row.price_label || null,
              area_sqft: null,
              furnishing: row.furnishing || null,
              property_use: row.property_use || null,
            });

            if (!embedding) { failed++; continue; }

            if (!dryRun) {
              await admin.from(table).update({ embedding } as any).eq('id', row.id);
            }
            done++;
          } catch { failed++; }
        }

        offset += batchSize;
      }

      results.push({ table, done, failed });
      totalDone += done;
    }

    console.log(`[backfill] complete: ${JSON.stringify(results)}`);
  } catch (e: any) {
    console.error(`[backfill] error: ${e.message}`);
  } finally {
    running = false;
  }
}
