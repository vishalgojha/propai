import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function toTitle(item: any): string {
    const parts: string[] = [];
    if (item.bhk) parts.push(item.bhk);
    if (item.locality) parts.push(item.locality);
    if (item.type === 'Rent') parts.push('for Rent');
    else if (item.type === 'Sale') parts.push('for Sale');
    return parts.join(' ') || 'Property Listing';
}

async function main() {
    const { data: existing } = await db
        .from('listings')
        .select('id, raw_text');
    const existingRawTexts = new Set((existing || []).map((r: any) => (r.raw_text || '').trim()));
    console.log(`Existing listings: ${existingRawTexts.size}`);

    let query = db
        .from('stream_items')
        .select('*')
        .order('created_at', { ascending: false });

    const { data: items, error } = await query;
    if (error) {
        console.error('Query failed:', error.message);
        process.exit(1);
    }

    if (!items || !items.length) {
        console.log('No stream_items found.');
        return;
    }

    const toInsert = (items as any[]).filter((item) => {
        const raw = (item.raw_text || '').trim();
        return raw && !existingRawTexts.has(raw);
    });

    console.log(`Found ${items.length} stream_items, ${toInsert.length} need backfill.`);

    if (!toInsert.length) {
        console.log('Nothing to backfill.');
        return;
    }

    const rows = toInsert.map((item: any) => {
        const structuredData: Record<string, unknown> = {
            bhk: item.bhk || null,
            locality: item.locality || null,
            city: item.city || null,
            type: (item.type || '').toLowerCase() || null,
            deal_type: item.deal_type || null,
            price_numeric: item.price_numeric || null,
            price: item.price_label || null,
            area_sqft: item.area_sqft || null,
            furnishing: item.furnishing || null,
            floor_number: item.floor_number || null,
            total_floors: item.total_floors || null,
            asset_class: item.asset_class || null,
            property_use: item.property_use || null,
            property_category: item.property_category || null,
            confidence: item.confidence_score || null,
            title: toTitle(item),
            building: null,
            micro_location: null,
        };

        return {
            tenant_id: item.tenant_id,
            source_group_id: item.source_group_id || null,
            structured_data: structuredData,
            raw_text: item.raw_text || '',
            status: 'Active',
            created_at: item.created_at,
        };
    });

    if (dryRun) {
        console.log(`Would insert ${rows.length} rows (dry-run).`);
        if (rows.length > 0) console.log('Sample:', JSON.stringify(rows[0], null, 2));
        return;
    }

    const BATCH = 100;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error: insertError } = await db.from('listings').insert(batch);
        if (insertError) {
            console.error(`Batch ${i / BATCH} failed:`, insertError.message);
        } else {
            inserted += batch.length;
            console.log(`Inserted ${inserted}/${rows.length}...`);
        }
    }

    console.log(`Done. Inserted ${inserted} rows into listings.`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
