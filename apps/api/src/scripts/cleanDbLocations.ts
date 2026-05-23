import * as dotenv from 'dotenv';
import { supabaseAdmin } from '../config/supabase';
import { parseIndianLocation } from '../utils/locationParser';

// Load environment variables
dotenv.config();

async function cleanDatabaseLocations() {
    if (!supabaseAdmin) {
        console.error('❌ Supabase service role key is not configured.');
        process.exit(1);
    }

    console.log('🏁 Starting Database Locality Cleanup Background Helper...\n');

    // 1. Clean stream_items table
    console.log('--- Cleaning [stream_items] ---');
    try {
        const { data: items, error } = await supabaseAdmin
            .from('stream_items')
            .select('id, locality, raw_text')
            .not('locality', 'is', null);

        if (error) throw error;

        console.log(`Found ${(items || []).length} stream items with localities.`);
        let streamItemsCleaned = 0;
        let streamItemsCanonicalized = 0;

        for (const item of items || []) {
            const current = item.locality;
            const resolved = current ? parseIndianLocation(current) : null;
            const canonical = resolved ? resolved.locality : null;

            if (canonical !== current) {
                const { error: updateError } = await supabaseAdmin
                    .from('stream_items')
                    .update({ locality: canonical })
                    .eq('id', item.id);

                if (updateError) {
                    console.error(`  [StreamItem ERROR] Failed to update ID ${item.id}:`, updateError.message);
                } else {
                    if (canonical === null) {
                        console.log(`  🗑️  Cleared invalid stream item locality: "${current}"`);
                        streamItemsCleaned++;
                    } else {
                        console.log(`  🔄 Canonicalized stream item: "${current}" -> "${canonical}"`);
                        streamItemsCanonicalized++;
                    }
                }
            }
        }
        console.log(`📊 [stream_items] Summary: Cleaned: ${streamItemsCleaned}, Canonicalized: ${streamItemsCanonicalized}\n`);
    } catch (err: any) {
        console.error('❌ Error cleaning [stream_items]:', err.message);
    }

    // 2. Clean listings table
    console.log('--- Cleaning [listings] ---');
    try {
        const { data: listings, error } = await supabaseAdmin
            .from('listings')
            .select('id, locality, raw_text')
            .not('locality', 'is', null);

        if (error) throw error;

        console.log(`Found ${(listings || []).length} listings with localities.`);
        let listingsCleaned = 0;
        let listingsCanonicalized = 0;

        for (const listing of listings || []) {
            const current = listing.locality;
            const resolved = current ? parseIndianLocation(current) : null;
            const canonical = resolved ? resolved.locality : null;

            if (canonical !== current) {
                const { error: updateError } = await supabaseAdmin
                    .from('listings')
                    .update({ locality: canonical })
                    .eq('id', listing.id);

                if (updateError) {
                    console.error(`  [Listing ERROR] Failed to update ID ${listing.id}:`, updateError.message);
                } else {
                    if (canonical === null) {
                        console.log(`  🗑️  Cleared invalid listing locality: "${current}"`);
                        listingsCleaned++;
                    } else {
                        console.log(`  🔄 Canonicalized listing: "${current}" -> "${canonical}"`);
                        listingsCanonicalized++;
                    }
                }
            }
        }
        console.log(`📊 [listings] Summary: Cleaned: ${listingsCleaned}, Canonicalized: ${listingsCanonicalized}\n`);
    } catch (err: any) {
        console.error('❌ Error cleaning [listings]:', err.message);
    }

    // 3. Clean requirements table
    console.log('--- Cleaning [requirements] ---');
    try {
        const { data: requirements, error } = await supabaseAdmin
            .from('requirements')
            .select('id, preferred_localities, raw_text')
            .not('preferred_localities', 'is', null);

        if (error) throw error;

        console.log(`Found ${(requirements || []).length} requirements with preferred localities.`);
        let requirementsCleaned = 0;
        let requirementsCanonicalized = 0;

        for (const req of requirements || []) {
            const currentList = Array.isArray(req.preferred_localities) ? req.preferred_localities as string[] : [];
            const canonicalList = currentList
                .map((loc) => parseIndianLocation(loc)?.locality)
                .filter((loc): loc is string => !!loc);

            // Compare array elements
            const hasChanges = currentList.length !== canonicalList.length || 
                currentList.some((val, i) => val !== canonicalList[i]);

            if (hasChanges) {
                const { error: updateError } = await supabaseAdmin
                    .from('requirements')
                    .update({ preferred_localities: canonicalList })
                    .eq('id', req.id);

                if (updateError) {
                    console.error(`  [Requirement ERROR] Failed to update ID ${req.id}:`, updateError.message);
                } else {
                    const cleanedCount = currentList.length - canonicalList.length;
                    if (cleanedCount > 0) {
                        requirementsCleaned += cleanedCount;
                        console.log(`  🗑️  Removed ${cleanedCount} invalid preferred localities from requirement ID ${req.id}`);
                    }
                    
                    const canonicalizedCount = canonicalList.filter((val, i) => val !== currentList[i]).length;
                    if (canonicalizedCount > 0) {
                        requirementsCanonicalized += canonicalizedCount;
                        console.log(`  🔄 Canonicalized requirement preferred localities: [${currentList.join(', ')}] -> [${canonicalList.join(', ')}]`);
                    }
                }
            }
        }
        console.log(`📊 [requirements] Summary: Removed invalid: ${requirementsCleaned}, Canonicalized: ${requirementsCanonicalized}\n`);
    } catch (err: any) {
        console.error('❌ Error cleaning [requirements]:', err.message);
    }

    console.log('🎉 Locality Cleanup completed successfully!');
}

void cleanDatabaseLocations();
