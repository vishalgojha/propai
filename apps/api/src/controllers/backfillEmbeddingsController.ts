import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { embedStreamItem } from '../services/embeddingService';

const tasks = new Map<string, { status: string; progress: string; done: number; failed: number; table: string }>();

export async function backfillEmbeddings(req: Request, res: Response) {
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey !== process.env.ADMIN_API_KEY && apiKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const dryRun = req.query.dry === 'true';
  const batchSize = Math.min(Number(req.query.batch) || 10, 50);
  const maxTotal = Math.min(Number(req.query.max) || Infinity, 10000);

  const taskId = `bf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  tasks.set(taskId, { status: 'queued', progress: '', done: 0, failed: 0, table: '' });

  res.json({ task_id: taskId, status: 'started', dry_run: dryRun, message: 'Backfill running in background. Check /api/backfill-status/:task_id' });

  setImmediate(async () => {
    const admin = supabaseAdmin!;
    let totalDone = 0;
    const results: { table: string; done: number; failed: number }[] = [];

    for (const table of ['stream_items_residential', 'stream_items_commercial'] as const) {
      let offset = 0;
      let done = 0;
      let failed = 0;

      while (done + failed < maxTotal) {
        const { data: rows, error } = await (admin
          .from(table)
          .select('*')
          .is('embedding', null)
          .order('id')
          .range(offset, offset + batchSize - 1) as any);

        if (error) { tasks.set(taskId, { status: 'error', progress: error.message, done, failed, table }); return; }
        if (!rows || rows.length === 0) break;

        for (const row of rows) {
          if (done + failed >= maxTotal) break;

          tasks.set(taskId, { status: 'running', progress: `${table}: ${done + failed + 1}`, done, failed, table });

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

    tasks.set(taskId, {
      status: 'completed',
      progress: `total_done=${totalDone}`,
      done: totalDone,
      failed: results.reduce((a, r) => a + r.failed, 0),
      table: '',
    });
  });
}

export function backfillStatus(req: Request, res: Response) {
  const taskId = req.params.task_id as string;
  const task = tasks.get(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
}
