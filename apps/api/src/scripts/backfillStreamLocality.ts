import 'dotenv/config';
import { supabaseAdmin } from '../config/supabase';
import { parseIndianLocation } from '../utils/locationParser';

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 100;
const DRY_RUN = process.argv.includes('--dry-run');

type StreamLocalityRow = {
    id: string;
    locality: string | null;
    city: string | null;
    created_at: string;
};

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
    if (!supabaseAdmin) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
    }

    let offset = 0;
    let updated = 0;

    while (true) {
        const { data, error } = await supabaseAdmin
            .from('stream_items')
            .select('id, locality, city, created_at')
            .not('locality', 'is', null)
            .order('created_at', { ascending: true })
            .range(offset, offset + BATCH_SIZE - 1);

        if (error) {
            throw error;
        }

        const rows = (data || []) as StreamLocalityRow[];
        if (rows.length === 0) {
            break;
        }

        for (const row of rows) {
            const currentLocality = String(row.locality || '').trim();
            if (!currentLocality) {
                continue;
            }

            const resolved = parseIndianLocation(currentLocality);
            if (!resolved) {
                continue;
            }

            const nextLocality = String(resolved.locality || '').trim();
            const nextCity = String(resolved.city || '').trim() || null;
            const currentCity = String(row.city || '').trim() || null;
            const localityChanged = nextLocality !== currentLocality;
            const cityChanged = nextCity !== currentCity;

            if (!localityChanged && !cityChanged) {
                continue;
            }

            console.log(`[backfill] ${row.id} "${currentLocality}" → "${nextLocality}"${cityChanged ? ` [city: "${currentCity || 'null'}" → "${nextCity || 'null'}"]` : ''}`);

            if (DRY_RUN) {
                updated += 1;
                continue;
            }

            const { error: updateError } = await supabaseAdmin
                .from('stream_items')
                .update({
                    locality: nextLocality,
                    city: nextCity,
                })
                .eq('id', row.id);

            if (updateError) {
                throw updateError;
            }

            updated += 1;
        }

        offset += rows.length;
        await sleep(BATCH_DELAY_MS);
    }

    console.log(`[backfill] ${DRY_RUN ? 'would update' : 'updated'} ${updated} rows`);
}

void run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    console.error(message);
    process.exit(1);
});
