import sqlite3 from 'better-sqlite3';
import { createClient } from '@supabase/supabase-js';

const GOLD_DB = '/home/vishal/walearn/listings.db';

const supabase = createClient(
    process.env.SUPABASE_URL || 'https://mnqkcctegpqxjvgdgakf.supabase.co',
    process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucWtjY3RlZ3BxeGp2Z2RnYWtmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg3MzgxMiwiZXhwIjoyMDkzNDQ5ODEyfQ.OrN3VjFNJj7CFxox1nhAlV0a7OzD_poxu5F6KzK4ue4',
);

const TENANT_ID = '796c59fb-5e34-43b9-a4b5-bf1f2c7f9ac0';

const CLUSTERS: Record<string, string[]> = {
    'Bandra-Santacruz': [
        'bandra', 'bandra east', 'bandra west', 'khar', 'khar west',
        'santacruz', 'santacruz west', 'santacruz east',
        'vile parle', 'vile parle west', 'pali hill', 'carter road',
    ],
    'Andheri-Lokhandwala': [
        'andheri', 'andheri west', 'andheri east', 'lokhandwala',
        'oshiwara', 'versova', 'jvpd scheme', 'juhu',
    ],
    'BKC': [
        'bkc', 'bandra kurla complex',
    ],
    'South Mumbai': [
        'lower parel', 'worli', 'mahalaxmi', 'prabhadevi', 'parel',
        'fort', 'marine lines', 'churchgate', 'colaba', 'nariman point',
        'tardeo', 'byculla', 'mahim', 'south mumbai',
    ],
    'Western Suburbs': [
        'goregaon west', 'goregaon east', 'malad west', 'malad east',
        'kandivali west', 'kandivali east', 'borivali west', 'borivali east',
        'dahisar', 'poisar',
    ],
    'Thane-Navi Mumbai': [
        'thane', 'navi mumbai', 'vashi', 'panvel', 'belapur',
        'airoli', 'ghansoli', 'kharghar', 'kalyan', 'dombivli',
    ],
    'Central Suburbs': [
        'dadar', 'matunga', 'sion', 'chembur', 'kurla',
        'ghatkopar', 'vikhroli', 'kanjurmarg', 'bhandup', 'mulund',
        'powai', 'nerul',
    ],
};

function normalizeLocality(loc: string): string {
    return loc.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findCluster(locality: string): string | null {
    const normalized = normalizeLocality(locality);
    for (const [cluster, keywords] of Object.entries(CLUSTERS)) {
        for (const keyword of keywords) {
            if (normalized === keyword || normalized.includes(keyword) || keyword.includes(normalized)) {
                return cluster;
            }
        }
    }
    return null;
}

interface BrokerEntry {
    phone: string;
    name: string;
    locality: string;
    cluster: string;
    msgCount: number;
}

async function main() {
    console.log('Opening gold database...');
    const db = sqlite3(GOLD_DB);
    
    const rows = db.prepare(`
        SELECT sender, phones_json, locality, all_localities_json, COUNT(*) as cnt
        FROM structured_listings
        WHERE sender IS NOT NULL AND sender != ''
          AND phones_json IS NOT NULL AND phones_json != '[]'
        GROUP BY sender
        ORDER BY cnt DESC
    `).all() as any[];

    const clusterMap = new Map<string, Map<string, BrokerEntry>>();

    for (const row of rows) {
        let phones: string[];
        try {
            phones = JSON.parse(row.phones_json);
            if (!Array.isArray(phones)) phones = [];
        } catch {
            continue;
        }

        const localities: string[] = [];
        if (row.locality) localities.push(row.locality);
        try {
            const allLocs = JSON.parse(row.all_localities_json || '[]');
            if (Array.isArray(allLocs)) {
                for (const loc of allLocs) {
                    if (!localities.includes(loc)) localities.push(loc);
                }
            }
        } catch {}

        const senderName = String(row.sender || '').trim();
        const name = senderName.includes('-') ? senderName.split('-')[1]?.trim() || senderName : senderName;

        for (const phone of phones) {
            const digits = String(phone).replace(/\D/g, '').slice(-10);
            if (digits.length < 10) continue;

            for (const loc of localities) {
                const cluster = findCluster(loc);
                if (!cluster) continue;

                if (!clusterMap.has(cluster)) {
                    clusterMap.set(cluster, new Map());
                }
                const phoneMap = clusterMap.get(cluster)!;
                const existing = phoneMap.get(digits);
                if (existing) {
                    existing.msgCount += row.cnt;
                } else {
                    phoneMap.set(digits, {
                        phone: digits,
                        name,
                        locality: loc,
                        cluster,
                        msgCount: row.cnt,
                    });
                }
            }
        }
    }

    db.close();

    console.log('\nCluster summary:');
    for (const [cluster, phones] of clusterMap) {
        console.log(`  ${cluster}: ${phones.size} unique phones`);
    }

    const totalPhones = new Set<string>();
    for (const phones of clusterMap.values()) {
        for (const p of phones.keys()) totalPhones.add(p);
    }
    console.log(`\nTotal unique phones across all clusters: ${totalPhones.size}`);

    console.log('\nUpserting into wabro_contacts...');
    let inserted = 0;
    let skipped = 0;

    for (const [cluster, phones] of clusterMap) {
        for (const [, entry] of phones) {
            const { error } = await supabase
                .from('wabro_contacts')
                .upsert({
                    tenant_id: TENANT_ID,
                    list_name: cluster,
                    phone: entry.phone,
                    name: entry.name,
                    locality: entry.locality,
                }, {
                    onConflict: 'tenant_id, list_name, phone',
                    ignoreDuplicates: false,
                });

            if (error) {
                console.error(`  Error upserting ${entry.phone} -> ${cluster}:`, error.message);
                skipped++;
            } else {
                inserted++;
            }
        }
    }

    console.log(`\nDone. Inserted/updated: ${inserted}, Skipped: ${skipped}`);

    console.log('\nContacts per list:');
    for (const [cluster] of clusterMap) {
        const { count, error } = await supabase
            .from('wabro_contacts')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', TENANT_ID)
            .eq('list_name', cluster);
        if (!error) {
            console.log(`  ${cluster}: ${count} contacts`);
        }
    }
}

main().catch(console.error);
