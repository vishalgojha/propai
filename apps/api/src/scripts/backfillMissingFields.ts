import 'dotenv/config';
import { supabaseAdmin } from '../config/supabase';
import {
    extractFloorNumber,
    extractPropertyUse,
    extractTotalFloors,
    normalizeFurnishing,
} from '../services/channelService';

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 100;
const DRY_RUN = process.argv.includes('--dry-run');

type StreamFieldRow = {
    id: string;
    raw_text: string | null;
    floor_number: string | null;
    total_floors: string | null;
    property_use: string | null;
    furnishing: string | null;
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
            .select('id, raw_text, floor_number, total_floors, property_use, furnishing, created_at')
            .or('floor_number.is.null,property_use.is.null,furnishing.is.null')
            .order('created_at', { ascending: true })
            .range(offset, offset + BATCH_SIZE - 1);

        if (error) {
            throw error;
        }

        const rows = (data || []) as StreamFieldRow[];
        if (rows.length === 0) {
            break;
        }

        for (const row of rows) {
            const rawText = String(row.raw_text || '').trim();
            if (!rawText) {
                continue;
            }

            const nextFloorNumber = row.floor_number || extractFloorNumber(rawText);
            const nextTotalFloors = row.total_floors || extractTotalFloors(rawText);
            const nextPropertyUse = row.property_use || extractPropertyUse(rawText);
            const nextFurnishing = row.furnishing || normalizeFurnishing(rawText);

            const updates: Partial<Pick<StreamFieldRow, 'floor_number' | 'total_floors' | 'property_use' | 'furnishing'>> = {};

            if (!row.floor_number && nextFloorNumber) {
                updates.floor_number = nextFloorNumber;
            }
            if (!row.total_floors && nextTotalFloors) {
                updates.total_floors = nextTotalFloors;
            }
            if (!row.property_use && nextPropertyUse) {
                updates.property_use = nextPropertyUse;
            }
            if (!row.furnishing && nextFurnishing) {
                updates.furnishing = nextFurnishing;
            }

            if (Object.keys(updates).length === 0) {
                continue;
            }

            console.log(`[backfill] ${row.id} ${JSON.stringify(updates)}`);

            if (DRY_RUN) {
                updated += 1;
                continue;
            }

            const { error: updateError } = await supabaseAdmin
                .from('stream_items')
                .update(updates)
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
