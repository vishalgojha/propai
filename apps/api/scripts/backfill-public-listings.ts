import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const args = process.argv.slice(2);
const hoursIdx = args.indexOf('--hours');
const hours = hoursIdx !== -1 ? parseInt(args[hoursIdx + 1], 10) : null;
const dryRun = args.includes('--dry-run');

function parseBhk(bhk: string | null | undefined): number | null {
    if (!bhk) return null;
    const m = String(bhk).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

function extractPhone(text: string): string | null {
    const m = text.match(/(?:\+?91)?[6-9]\d{9}/);
    return m ? m[0] : null;
}

async function main() {
    const { data: existing } = await db
        .from('public_listings')
        .select('source_message_id');
    const existingIds = new Set((existing || []).map((r: any) => r.source_message_id));
    console.log(`Existing public_listings: ${existingIds.size}`);

    let query = db.from('stream_items').select('*').order('created_at', { ascending: false });
    if (hours) {
        const since = new Date(Date.now() - hours * 3600_000).toISOString();
        query = query.gte('created_at', since);
    }

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
        const mid = item.source_message_id || item.message_id;
        return !existingIds.has(mid);
    });

    console.log(`Found ${items.length} stream_items, ${toInsert.length} need backfill.`);

    if (!toInsert.length) {
        console.log('Nothing to backfill.');
        return;
    }

    const rows = toInsert.map((item: any) => {
        const mid = item.source_message_id || item.message_id;
        const phone = item.source_phone || extractPhone(item.raw_text || '');
        const listingType = (() => {
            const t = (item.type || '').toLowerCase();
            if (t === 'rent') return 'listing_rent';
            if (t === 'sale') return 'listing_sale';
            if (t === 'pre-leased') return 'listing_rent';
            return 'requirement';
        })();
        const title = [item.bhk, item.locality, item.type === 'Rent' ? 'for Rent' : item.type === 'Sale' ? 'for Sale' : '']
            .filter(Boolean).join(' ') || 'Property Listing';
        return {
            source_message_id: mid,
            source_group_id: item.source_group_id || null,
            source_group_name: item.source_group_name || null,
            listing_type: listingType,
            area: item.locality || null,
            sub_area: null,
            location: item.locality || 'Unknown',
            price: item.price_numeric || null,
            price_type: item.type === 'Rent' ? 'monthly' : item.type === 'Sale' ? 'total' : null,
            size_sqft: item.area_sqft || null,
            furnishing: item.furnishing || null,
            bhk: parseBhk(item.bhk),
            property_type: null,
            title,
            description: item.raw_text || '',
            raw_message: item.raw_text || null,
            cleaned_message: null,
            sender_number: phone,
            primary_contact_name: item.source_label || item.source_group_name || null,
            primary_contact_number: phone,
            primary_contact_wa: phone ? `91${phone.replace(/^\+?91/, '')}` : null,
            contacts: [],
            confidence: item.confidence_score ?? 0.8,
            message_timestamp: item.created_at || new Date().toISOString(),
            search_text: [item.raw_text, item.locality, item.bhk, item.type].filter(Boolean).join(' '),
        };
    });

    if (dryRun) {
        console.log(`Would insert ${rows.length} rows (dry-run).`);
        if (rows.length > 0) console.log('Sample:', JSON.stringify(rows[0], null, 2));
        return;
    }

    console.log(`Inserting ${rows.length} rows into public_listings...`);
    const { error: insertError } = await db.from('public_listings').upsert(rows, {
        onConflict: 'source_message_id',
        ignoreDuplicates: true,
    });
    if (insertError) {
        console.error('Insert failed:', insertError.message);
        process.exit(1);
    }
    console.log(`Done. Inserted ${rows.length} rows.`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
