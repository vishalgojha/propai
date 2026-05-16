import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const normalizePhone = (value: unknown): string | null => {
    const digits = String(value || '').replace(/\D/g, '').slice(-10);
    return digits.length === 10 ? digits : null;
};

async function main() {
    const { data: identities, error } = await db
        .from('broker_identity')
        .select(`
            broker_id,
            full_name,
            agency_name,
            localities,
            mobile,
            profiles!broker_identity_broker_id_fkey (
                phone,
                full_name
            )
        `);

    if (error) {
        console.error('Failed to load broker identities:', error.message);
        process.exit(1);
    }

    let scanned = 0;
    let linked = 0;
    let skipped = 0;

    for (const identity of identities || []) {
        scanned += 1;
        const profile = Array.isArray((identity as any).profiles)
            ? (identity as any).profiles[0]
            : (identity as any).profiles;
        const phone = normalizePhone((identity as any).mobile || profile?.phone);
        if (!phone) {
            skipped += 1;
            continue;
        }

        const { data: existing, error: existingError } = await db
            .from('broker_activity')
            .select('phone, user_id, name, agency, localities, first_seen')
            .eq('phone', phone)
            .maybeSingle();

        if (existingError) {
            console.error(`Failed to load broker_activity for ${phone}:`, existingError.message);
            continue;
        }

        if (!existing) {
            skipped += 1;
            continue;
        }

        const mergedLocalities = new Map<string, { locality: string; count: number; last_seen: string }>();
        const now = new Date().toISOString();

        if (Array.isArray(existing.localities)) {
            for (const locality of existing.localities as any[]) {
                const name = String(locality?.locality || '').trim();
                if (!name) continue;
                mergedLocalities.set(name.toLowerCase(), {
                    locality: name,
                    count: typeof locality?.count === 'number' ? locality.count : 0,
                    last_seen: typeof locality?.last_seen === 'string' && locality.last_seen ? locality.last_seen : now,
                });
            }
        }

        if (Array.isArray((identity as any).localities)) {
            for (const locality of (identity as any).localities as string[]) {
                const name = String(locality || '').trim();
                if (!name || mergedLocalities.has(name.toLowerCase())) continue;
                mergedLocalities.set(name.toLowerCase(), {
                    locality: name,
                    count: 0,
                    last_seen: now,
                });
            }
        }

        const { error: updateError } = await db
            .from('broker_activity')
            .upsert({
                phone,
                user_id: (identity as any).broker_id,
                name: existing.name || (identity as any).full_name || profile?.full_name || null,
                agency: existing.agency || (identity as any).agency_name || null,
                localities: Array.from(mergedLocalities.values()),
                updated_at: now,
                first_seen: existing.first_seen || now,
            }, { onConflict: 'phone' });

        if (updateError) {
            console.error(`Failed to update broker_activity for ${phone}:`, updateError.message);
            continue;
        }

        linked += 1;
    }

    console.log(JSON.stringify({ scanned, linked, skipped }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
