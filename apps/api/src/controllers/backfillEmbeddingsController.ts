import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { embedStreamItem } from '../services/embeddingService';

export async function backfillEmbeddings(req: Request, res: Response) {
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey !== process.env.ADMIN_API_KEY && apiKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const dryRun = req.query.dry !== 'false';
  const batchSize = Math.min(Number(req.query.batch) || 20, 50);
  const maxTotal = Math.min(Number(req.query.max) || Infinity, 10000);
  const admin = supabaseAdmin!;

  let totalDone = 0;
  const results: { table: string; done: number; failed: number }[] = [];

  for (const table of ['stream_items_residential', 'stream_items_commercial'] as const) {
    let offset = 0;
    let done = 0;
    let failed = 0;

    while (done + failed < maxTotal) {
      const { data: rows, error } = await admin
        .from(table)
        .select('id, locality, bhk, price_label, type, furnishing, building_name, property_use, city, property_category, deal_type, asset_class, micro_location, parsed_payload')
        .is('embedding', null)
        .order('id')
        .range(offset, offset + batchSize - 1);

      if (error) { return res.status(500).json({ error: error.message }); }
      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        if (done + failed >= maxTotal) break;

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
      }

      offset += batchSize;
    }

    results.push({ table, done, failed });
    totalDone += done;
  }

  res.json({
    dry_run: dryRun,
    total_done: totalDone,
    tables: results,
  });
}
