import { createClient } from '@supabase/supabase-js';

const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RE_KEYWORDS = [
    'property', 'realty', 'real.estate', 'estate', 'flat', 'apartment', 'villa',
    'bungalow', 'plot', 'land', 'broker', 'builder', 'developer', 'consultant',
    'rent', 'sale', 'lease', 'deal', 'dealz', 'housing', 'home', 'house',
    'requirement', 'availability', 'inventory', 'listing', 'avail',
    'bandra', 'juhu', 'worli', 'colaba', 'thane', 'chembur', 'andheri',
    'prop', 'cp', 'bhk', 'sqft', 'realtor', 'pre.leased',
    'resale', 'brothers', 'estates', 'propertygram', 'pushpvatika',
    'luxanto', 'ahuja', 'dhanki', 'florentine', 'klassic', 'kozy',
    'maruiti', 'rudra', 'sanket', 'shobhna', 'showroom', 'store', 'shop',
    'thakur', 'vmax', 'vijay', 'yogesh', 'bajaj', 'chhabria', 'shubh',
    'chariot', 'ananta', 'barudgar', 'bigdeal', 'bhaktawar', 'ganesh',
    'bkc', 'worli', 'colaba', 'propai', 'propi', 'homepikr',
    'khar', 'scruz', 'sippy', 'smart', 'mnre',
    'broadcast', 'broadcasting',
    'reseller', 'ava/req', 'tps',
    'प्रॉपर्टी', 'प्रोपर्टी', 'प्रापर्टी',
];

const NON_RE_KEYWORDS = [
    'diabetics', 'ai training', 'socialise', 'socialize', 'family',
    'lunair', 'tree plantation', 'smarties', 'healing',
    'general', 'test', 'aashayein', 'money matters',
    'strive forward', 'sgf', 'sfg',
];

function hasKeyword(text: string, keywords: string[]): boolean {
    const lower = text.toLowerCase();
    return keywords.some(kw => lower.includes(kw));
}

async function classifyGroup(jid: string, name: string): Promise<boolean> {
    const label = name || jid;

    // First check name against explicit non-RE keywords
    if (hasKeyword(label, NON_RE_KEYWORDS)) return false;

    // Then check name for RE keywords
    if (hasKeyword(label, RE_KEYWORDS)) return true;

    // Check last 50 messages for RE keywords
    const { data: msgs } = await db
        .from('messages')
        .select('text')
        .eq('remote_jid', jid)
        .not('text', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(50);

    if (msgs && msgs.length > 0) {
        const allText = msgs.map(m => String(m.text || '')).join(' ');
        if (hasKeyword(allText, RE_KEYWORDS)) return true;
    }

    // Default: mark as non-real-estate if no RE signals found
    return false;
}

async function main() {
    const { data: groups } = await db
        .from('whatsapp_groups')
        .select('group_jid, group_name');

    if (!groups || groups.length === 0) {
        console.log('No groups found');
        return;
    }

    console.log(`Classifying ${groups.length} groups...`);

    let reCount = 0;
    let nonReCount = 0;

    for (const group of groups) {
        const isRe = await classifyGroup(group.group_jid, group.group_name || '');
        const dbCategory = isRe ? 'real_estate' : 'other';
        const { error: updErr } = await db
            .from('whatsapp_groups')
            .update({ is_parsing: isRe, category: dbCategory })
            .eq('group_jid', group.group_jid);

        if (updErr) {
            console.error(`  ERROR updating ${(group.group_name || group.group_jid).substring(0, 50)}: ${updErr.message}`);
            continue;
        }

        if (isRe) reCount++;
        else {
            nonReCount++;
            console.log(`  NON-RE: ${(group.group_name || group.group_jid).substring(0, 50)}`);
        }
    }

    console.log(`\nDone: ${reCount} real estate, ${nonReCount} non-real-estate`);
}

main().catch(console.error);
