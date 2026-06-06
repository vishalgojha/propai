import { supabaseAdmin } from '../config/supabase';
import { inferIgrCity } from '../services/igrLocationResolver';

type IgrRow = {
  id: number;
  building_name: string | null;
  locality: string | null;
  source: string | null;
  property_description: string | null;
};

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 200;

function inferCity(row: IgrRow): string | null {
  return inferIgrCity({
    buildingName: row.building_name,
    locality: row.locality,
  });
}

let igrTransactionsCityColumnAvailablePromise: Promise<boolean> | null = null;

async function hasIgrTransactionsCityColumn() {
  if (!igrTransactionsCityColumnAvailablePromise) {
    igrTransactionsCityColumnAvailablePromise = (async () => {
      const admin = supabaseAdmin;
      if (!admin) {
        return false;
      }

      const { error } = await admin
        .from('igr_transactions')
        .select('city')
        .limit(1);

      if (!error) {
        return true;
      }

      const message = String(error.message || '').toLowerCase();
      const code = String(error.code || '').toUpperCase();
      if (code === 'PGRST204' || code === 'PGRST205' || message.includes('could not find') || message.includes('schema cache')) {
        return false;
      }

      throw new Error(error.message);
    })();
  }

  return igrTransactionsCityColumnAvailablePromise;
}

async function main() {
  if (!supabaseAdmin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for IGR city backfill');
  }

  const hasCityColumn = await hasIgrTransactionsCityColumn();
  if (!hasCityColumn) {
    if (!DRY_RUN) {
      throw new Error('igr_transactions.city does not exist on the live database yet. Apply the migration before running the backfill.');
    }
  }

  let processed = 0;
  let updated = 0;
  let offset = 0;

  while (true) {
    let query = supabaseAdmin
      .from('igr_transactions')
      .select('id, building_name, locality, source, property_description')
      .order('id', { ascending: true });

    if (hasCityColumn) {
      query = query.is('city', null);
    }

    const { data, error } = await query.range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data || []) as IgrRow[];
    if (!rows.length) {
      break;
    }

    for (const row of rows) {
      processed += 1;
      const inferredCity = inferCity(row);
      if (!inferredCity) {
        continue;
      }

      if (DRY_RUN) {
        console.log(`[igr-city-backfill] would update ${row.id} -> city="${inferredCity}"`);
        updated += 1;
        continue;
      }

      const { error: updateError } = await supabaseAdmin
        .from('igr_transactions')
        .update({ city: inferredCity })
        .eq('id', row.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      updated += 1;
      console.log(`[igr-city-backfill] updated ${row.id} -> city="${inferredCity}"`);
    }

    offset += BATCH_SIZE;
  }

  console.log(`[igr-city-backfill] complete: processed ${processed}, updated ${updated}${DRY_RUN ? ' (dry-run)' : ''}`);
}

main().catch((error) => {
  console.error('[igr-city-backfill] failed', error instanceof Error ? error.message : error);
  process.exit(1);
});
