import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
    // 1. Backfill whatsapp_groups from messages table
    console.log('Fetching distinct remote_jids from messages...');
    const { data: messages, error: msgErr } = await db
        .from('messages')
        .select('remote_jid, tenant_id, created_at, sender')
        .not('remote_jid', 'is', null);

    if (msgErr) { console.error('Failed to fetch messages:', msgErr.message); process.exit(1); }

    const groups = new Map<string, { jid: string; name: string; tenantId: string }>();
    for (const m of messages || []) {
        const jid = m.remote_jid;
        if (!jid || !jid.endsWith('@g.us')) continue;
        if (!groups.has(jid)) {
            groups.set(jid, { jid, name: jid, tenantId: m.tenant_id });
        }
    }
    console.log(`Found ${groups.size} WhatsApp groups from ${(messages || []).length} messages`);

    let gSynced = 0;
    for (const [, g] of groups) {
        const { error } = await db.from('whatsapp_groups').upsert({
            workspace_id: g.tenantId,
            tenant_id: g.tenantId,
            group_jid: g.jid,
            group_name: g.name,
            is_parsing: true,
            broadcast_enabled: true,
        }, { onConflict: 'workspace_id,group_jid', ignoreDuplicates: false });
        if (error) {
            // Fallback: try direct insert
            const { error: iErr } = await db.from('whatsapp_groups').insert({
                workspace_id: g.tenantId,
                tenant_id: g.tenantId,
                group_jid: g.jid,
                group_name: g.name,
                is_parsing: true,
                broadcast_enabled: true,
            });
            if (iErr) console.error('Failed to insert group', g.jid, iErr.message);
            else gSynced++;
        }
        else gSynced++;
    }
    console.log(`Synced ${gSynced} groups to whatsapp_groups`);

    // 2. Backfill whatsapp_message_mirror from messages
    const { count: existingMirror } = await db.from('whatsapp_message_mirror')
        .select('*', { count: 'exact', head: true });
    console.log(`Existing mirror rows: ${existingMirror}`);

    if (existingMirror === 0 && messages.length > 0) {
        console.log('Backfilling whatsapp_message_mirror...');
        const batchSize = 100;
        let inserted = 0;
        for (let i = 0; i < messages.length; i += batchSize) {
            const batch = messages.slice(i, i + batchSize).map((m: any) => ({
                tenant_id: m.tenant_id,
                remote_jid: m.remote_jid,
                chat_type: m.remote_jid?.endsWith('@g.us') ? 'group' : 'direct',
                sender_name: m.sender || null,
                text: m.text || '',
                timestamp: m.created_at,
                direction: 'inbound',
                created_at: m.created_at,
            }));
            const { error } = await db.from('whatsapp_message_mirror').insert(batch);
            if (error) console.error(`Batch ${i} failed:`, error.message);
            else inserted += batch.length;
        }
        console.log(`Backfilled ${inserted} mirror rows`);
    }

    // 3. Backfill broker_activity from messages (phone extraction from remote_jid)
    const { count: existingBrokers } = await db.from('broker_activity')
        .select('*', { count: 'exact', head: true });
    console.log(`Existing broker profiles: ${existingBrokers}`);

    if (existingBrokers === 0 && messages.length > 0) {
        console.log('Backfilling broker_activity from messages...');
        const byPhone = new Map<string, { count: number; lastSeen: string }>();
        for (const m of messages || []) {
            const jid = m.remote_jid || '';
            const digits = jid.split('@')[0].replace(/\D/g, '');
            const phone = digits.length >= 10 ? digits.slice(-10) : null;
            if (!phone || !jid.endsWith('@s.whatsapp.net')) continue;
            const e = byPhone.get(phone) || { count: 0, lastSeen: '' };
            e.count++;
            if (m.created_at > e.lastSeen) e.lastSeen = m.created_at;
            byPhone.set(phone, e);
        }
        let bInserted = 0;
        for (const [phone, data] of byPhone) {
            const { error } = await db.from('broker_activity').upsert({
                phone,
                name: null,
                total_messages: data.count,
                last_active: data.lastSeen || new Date().toISOString(),
                first_seen: data.lastSeen || new Date().toISOString(),
            }, { onConflict: 'phone', ignoreDuplicates: true });
            if (error) console.error('Failed to upsert broker', phone, error.message);
            else bInserted++;
        }
        console.log(`Backfilled ${bInserted} broker profiles`);
    }

    console.log('\nDone!');
}

main().catch(console.error);
