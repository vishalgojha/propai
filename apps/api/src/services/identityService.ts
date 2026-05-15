import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin ?? supabase;

type BrokerIdentity = {
    full_name: string | null;
    agency_name: string | null;
    city: string | null;
    localities: string[] | null;
    mobile: string | null;
    plan: string | null;
    connected_devices: number;
    max_devices: number;
    team_members: Array<{ name?: string; mobile?: string }>;
    whatsapp_groups: Array<{ id?: string; name?: string; excluded?: boolean }>;
    allowlisted_realtors: Array<{ name?: string; mobile?: string }>;
    onboarding_completed: boolean;
    onboarding_step: number;
    recent_actions: Array<{ action?: string; timestamp?: string }>;
};

function formatList(items: string[], fallback = 'none'): string {
    return items.length > 0 ? items.join(', ') : fallback;
}

function formatTeam(members: Array<{ name?: string; mobile?: string }>): string {
    if (!members.length) return 'None';
    return members.map((m) => `  - ${m.name || 'Unnamed'} (${m.mobile || '—'})`).join('\n');
}

function formatGroups(groups: Array<{ id?: string; name?: string; excluded?: boolean }>): string {
    const active = groups.filter((g) => !g.excluded);
    const excluded = groups.filter((g) => g.excluded);
    return `Active: ${active.length}\nExcluded (Personal): ${excluded.length}`;
}

function formatRealtors(realtors: Array<{ name?: string; mobile?: string }>): string {
    return String(realtors.length);
}

function formatRecentActions(actions: unknown): string {
    const arr = Array.isArray(actions) ? actions : [];
    const recent = arr.slice(-5);
    if (!recent.length) return 'No recent activity.';
    return recent
        .map((a: any) => {
            const time = a?.timestamp ? new Date(a.timestamp).toLocaleString('en-IN') : '—';
            return `  - ${a?.action || 'Unknown'} (${time})`;
        })
        .join('\n');
}

export async function generateIdentityMd(brokerId: string): Promise<string> {
    const { data, error } = await db
        .from('broker_identity')
        .select('*')
        .eq('broker_id', brokerId)
        .maybeSingle();

    if (error || !data) {
        return '';
    }

    const identity = data as unknown as BrokerIdentity;
    const onboardingStatus = identity.onboarding_completed
        ? 'Completed'
        : `Step ${identity.onboarding_step} of 6`;

    const lines = [
        '# Broker Identity',
        '',
        `Name: ${identity.full_name || '—'}`,
        `Agency: ${identity.agency_name || '—'}`,
        `City: ${identity.city || '—'}`,
        `Localities: ${formatList(identity.localities || [])}`,
        `Mobile: ${identity.mobile || '—'}`,
        `Plan: ${identity.plan || 'free'} (${identity.connected_devices}/${identity.max_devices} devices)`,
        '',
        'Team:',
        formatTeam(identity.team_members || []),
        '',
        'WhatsApp Groups:',
        formatGroups(identity.whatsapp_groups || []),
        '',
        `Allowlisted Realtors: ${formatRealtors(identity.allowlisted_realtors || [])}`,
        '',
        'Recent Activity:',
        formatRecentActions(identity.recent_actions || []),
        '',
        `Onboarding: ${onboardingStatus}`,
    ];

    return lines.join('\n');
}

type ActionEntry = {
    action: string;
    timestamp: string;
};

export async function pushRecentAction(brokerId: string, action: string): Promise<void> {
    const entry: ActionEntry = { action, timestamp: new Date().toISOString() };

    const result = await db
        .from('broker_identity')
        .select('recent_actions')
        .eq('broker_id', brokerId)
        .maybeSingle();

    const data = result?.data as { recent_actions?: unknown } | null | undefined;
    const raw = data?.recent_actions;
    const actions: ActionEntry[] = Array.isArray(raw) ? raw : [];
    actions.push(entry);
    const trimmed = actions.slice(-20);

    await db
        .from('broker_identity')
        .update({ recent_actions: JSON.stringify(trimmed), updated_at: new Date().toISOString() })
        .eq('broker_id', brokerId);
}
