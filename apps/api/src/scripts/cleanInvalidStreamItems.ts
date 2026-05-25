import 'dotenv/config';
import { supabaseAdmin } from '../config/supabase';

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 100;
const DRY_RUN = process.argv.includes('--dry-run');

type StreamCleanupRow = {
    id: string;
    type: string | null;
    locality: string | null;
    ingestion_status: string | null;
    created_at: string;
};

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMissingType(row: StreamCleanupRow) {
    return !String(row.type || '').trim();
}

function isMissingLocality(row: StreamCleanupRow) {
    return !String(row.locality || '').trim();
}

async function run() {
    if (!supabaseAdmin) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
    }

    let offset = 0;
    let suppressed = 0;
    let missingTypeCount = 0;
    let missingLocalityCount = 0;

    while (true) {
        const { data, error } = await supabaseAdmin
            .from('stream_items')
            .select('id, type, locality, ingestion_status, created_at')
            .order('created_at', { ascending: true })
            .range(offset, offset + BATCH_SIZE - 1);

        if (error) {
            throw error;
        }

        const rows = (data || []) as StreamCleanupRow[];
        if (rows.length === 0) {
            break;
        }

        for (const row of rows) {
            if (String(row.ingestion_status || '').trim() === 'suppressed') {
                continue;
            }

            const missingType = isMissingType(row);
            const missingLocality = isMissingLocality(row);
            if (!missingType && !missingLocality) {
                continue;
            }

            console.log(`[cleanup] suppress ${row.id} type="${String(row.type || '').trim() || 'null'}" locality="${String(row.locality || '').trim() || 'null'}"`);

            suppressed += 1;
            if (missingType) missingTypeCount += 1;
            if (missingLocality) missingLocalityCount += 1;

            if (DRY_RUN) {
                continue;
            }

            const { error: updateError } = await supabaseAdmin
                .from('stream_items')
                .update({ ingestion_status: 'suppressed' })
                .eq('id', row.id);

            if (updateError) {
                throw updateError;
            }
        }

        offset += rows.length;
        await sleep(BATCH_DELAY_MS);
    }

    console.log(`[cleanup] suppressed ${suppressed} rows — ${missingTypeCount} missing type, ${missingLocalityCount} missing locality`);
}

void run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    console.error(message);
    process.exit(1);
});
