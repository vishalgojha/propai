import 'dotenv/config';
import { supabaseAdmin } from '../config/supabase';
import { buildingResolverService } from '../services/buildingResolverService';

const BATCH_SIZE = 100;

type StreamBuildingRow = {
  id: string;
  raw_text: string | null;
  building_name: string | null;
  locality: string | null;
  created_at: string;
};

async function run() {
  if (!supabaseAdmin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  let processed = 0;
  let updated = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('stream_items')
      .select('id, raw_text, building_name, locality, created_at')
      .is('building_name', null)
      .not('raw_text', 'is', null)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      throw error;
    }

    const rows = (data || []) as StreamBuildingRow[];
    if (!rows.length) {
      break;
    }

    for (const row of rows) {
      processed += 1;
      const rawText = String(row.raw_text || '').trim();
      if (!rawText) {
        continue;
      }

      const resolved = await buildingResolverService.resolveStreamItemMetadata(rawText);
      if (!resolved.buildingName) {
        continue;
      }

      const nextLocality = String(row.locality || '').trim();
      const shouldUpdateLocality = !nextLocality || /^unknown$/i.test(nextLocality);
      const payload: Record<string, string | null> = {
        building_name: resolved.buildingName,
      };

      if (shouldUpdateLocality && resolved.locality) {
        payload.locality = resolved.locality;
      }

      const { error: updateError } = await supabaseAdmin
        .from('stream_items')
        .update(payload)
        .eq('id', row.id);

      if (updateError) {
        throw updateError;
      }

      updated += 1;
      console.log(`[backfill-building] ${row.id} -> building="${resolved.buildingName}" locality="${payload.locality || nextLocality || 'unchanged'}"`);
    }

    console.log(`[backfill-building] processed ${processed}, updated ${updated}`);
  }

  console.log(`[backfill-building] complete: processed ${processed}, updated ${updated}`);
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  console.error(message);
  process.exit(1);
});
