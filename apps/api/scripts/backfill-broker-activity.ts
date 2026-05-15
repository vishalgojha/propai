import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
    console.log('Fetching all stream_items with source_phone...');
    const { data: items, error } = await db
        .from('stream_items')
        .select('*')
        .not('source_phone', 'is', null)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Failed to fetch:', error.message);
        process.exit(1);
    }

    console.log(`Loaded ${items.length} items from ${new Set(items.map((i: any) => i.source_phone)).size} unique phones`);

    const byPhone: Record<string, any[]> = {};
    for (const item of items) {
        const phone = item.source_phone;
        if (!byPhone[phone]) byPhone[phone] = [];
        byPhone[phone].push(item);
    }

    let count = 0;
    for (const [phone, rows] of Object.entries(byPhone)) {
        const sorted = rows.sort((a: any, b: any) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        const localities: Record<string, { count: number; last_seen: string }> = {};
        const groups: Record<string, { group_name: string; group_id: string; count: number }> = {};
        const monthly: Record<string, number> = {};
        let listingCount = 0;
        let requirementCount = 0;
        let totalPriceListing = 0;
        let totalPriceRequirement = 0;
        let priceListingCount = 0;
        let priceRequirementCount = 0;
        let lastName: string | null = null;
        let firstSeen: string | null = null;
        let lastActive: string | null = null;

        for (const item of sorted) {
            const isReq = item.record_type === 'requirement';
            if (isReq) requirementCount++;
            else listingCount++;

            const payload = item.parsed_payload || {};
            const name = payload.contactName || payload.sourceLabel || null;
            if (name) lastName = name;

            if (item.locality) {
                if (!localities[item.locality]) {
                    localities[item.locality] = { count: 0, last_seen: item.created_at };
                }
                localities[item.locality].count++;
                if (item.created_at > (localities[item.locality].last_seen || '')) {
                    localities[item.locality].last_seen = item.created_at;
                }
            }

            const gid = item.source_group_id || '';
            const gname = item.source_group_name || '';
            const gkey = gid || gname;
            if (gkey) {
                if (!groups[gkey]) {
                    groups[gkey] = { group_name: gname, group_id: gid, count: 0 };
                }
                groups[gkey].count++;
            }

            if (item.price_numeric) {
                if (isReq) {
                    totalPriceRequirement += Number(item.price_numeric);
                    priceRequirementCount++;
                } else {
                    totalPriceListing += Number(item.price_numeric);
                    priceListingCount++;
                }
            }

            const monthKey = item.created_at ? item.created_at.slice(0, 7) : null;
            if (monthKey) monthly[monthKey] = (monthly[monthKey] || 0) + 1;

            if (!firstSeen || item.created_at < firstSeen) firstSeen = item.created_at;
            if (!lastActive || item.created_at > lastActive) lastActive = item.created_at;
        }

        const profile: any = {
            phone,
            name: lastName,
            localities: Object.entries(localities).map(([loc, data]) => ({
                locality: loc,
                count: data.count,
                last_seen: data.last_seen,
            })),
            listing_count: listingCount,
            requirement_count: requirementCount,
            avg_price_listing: priceListingCount > 0 ? totalPriceListing / priceListingCount : null,
            avg_price_requirement: priceRequirementCount > 0 ? totalPriceRequirement / priceRequirementCount : null,
            groups: Object.values(groups),
            total_messages: rows.length,
            monthly_activity: monthly,
            first_seen: firstSeen,
            last_active: lastActive,
            updated_at: new Date().toISOString(),
        };

        const { error: upsertError } = await db
            .from('broker_activity')
            .upsert(profile, { onConflict: 'phone' });

        if (upsertError) {
            console.error(`Failed to upsert ${phone}:`, upsertError.message);
        } else {
            count++;
        }
    }

    console.log(`\nDone. Created/updated ${count} broker profiles from ${items.length} messages.`);
}

main().catch(console.error);
