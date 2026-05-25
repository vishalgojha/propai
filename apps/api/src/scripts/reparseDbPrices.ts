import * as dotenv from 'dotenv';
import { supabaseAdmin } from '../config/supabase';
import { extractPriceInfo } from '../services/channelService';

// Load environment variables
dotenv.config();

async function reparseDatabasePrices() {
    if (!supabaseAdmin) {
        console.error('❌ Supabase service role key is not configured.');
        process.exit(1);
    }

    console.log('🏁 Starting Database Historical Price Reparser...\n');
    const reparseAll = process.argv.includes('--all');

    // 1. Reparse stream_items
    console.log('--- Processing [stream_items] ---');
    try {
        let streamQuery = supabaseAdmin
            .from('stream_items')
            .select('id, raw_text, type, deal_type, price_label, price_numeric');
        if (!reparseAll) {
            streamQuery = streamQuery.or('price_numeric.is.null,price_label.eq.Unspecified,price_label.is.null,price_label.ilike.%â¼%');
        }
        const { data: items, error } = await streamQuery;

        if (error) throw error;

        console.log(`Found ${(items || []).length} stream items needing price reparsing.`);
        let streamItemsUpdated = 0;

        for (const item of items || []) {
            const rawText = String(item.raw_text || '').trim();
            if (!rawText) continue;

            const dealTypeHint = String(item.deal_type || item.type || '').toLowerCase();
            const priceInfo = extractPriceInfo(rawText, dealTypeHint);

            if (priceInfo && priceInfo.numeric != null && priceInfo.label !== 'Unspecified') {
                const { error: updateError } = await supabaseAdmin
                    .from('stream_items')
                    .update({
                        price_numeric: priceInfo.numeric,
                        price_label: priceInfo.label
                    })
                    .eq('id', item.id);

                if (updateError) {
                    console.error(`  [StreamItem ERROR] Failed to update ID ${item.id}:`, updateError.message);
                } else {
                    console.log(`  ✅ Updated stream item ${item.id}: "${item.price_label}" -> "${priceInfo.label}" (${priceInfo.numeric})`);
                    streamItemsUpdated++;
                }
            }
        }
        console.log(`📊 [stream_items] Reparsed: ${streamItemsUpdated} items successfully.\n`);
    } catch (err: any) {
        console.error('❌ Error reparsing [stream_items]:', err.message);
    }

    // 2. Reparse listings
    console.log('--- Processing [listings] ---');
    try {
        let listingsQuery = supabaseAdmin
            .from('listings')
            .select('id, raw_text, listing_type, price_cr, rent_monthly');
        if (!reparseAll) {
            listingsQuery = listingsQuery.or('price_cr.is.null,rent_monthly.is.null');
        }
        const { data: listings, error } = await listingsQuery;

        if (error) throw error;

        console.log(`Found ${(listings || []).length} listings needing price reparsing.`);
        let listingsUpdated = 0;

        for (const listing of listings || []) {
            const rawText = String(listing.raw_text || '').trim();
            if (!rawText) continue;

            const dealTypeHint = String(listing.listing_type || '').toLowerCase();
            const priceInfo = extractPriceInfo(rawText, dealTypeHint);

            if (priceInfo && priceInfo.numeric != null && priceInfo.label !== 'Unspecified') {
                const isRent = dealTypeHint === 'rent' || dealTypeHint === 'lease' || priceInfo.label.includes('/mo');
                const rentVal = isRent ? priceInfo.numeric : null;
                const crVal = !isRent ? priceInfo.numeric / 10000000 : null;

                const { error: updateError } = await supabaseAdmin
                    .from('listings')
                    .update({
                        price_cr: crVal,
                        rent_monthly: rentVal
                    })
                    .eq('id', listing.id);

                if (updateError) {
                    console.error(`  [Listing ERROR] Failed to update ID ${listing.id}:`, updateError.message);
                } else {
                    console.log(`  ✅ Updated listing ${listing.id}: rent: ${rentVal}, cr: ${crVal}`);
                    listingsUpdated++;
                }
            }
        }
        console.log(`📊 [listings] Reparsed: ${listingsUpdated} listings successfully.\n`);
    } catch (err: any) {
        console.error('❌ Error reparsing [listings]:', err.message);
    }

    console.log('🎉 Database Price Reparsing completed successfully!');
}

void reparseDatabasePrices();
