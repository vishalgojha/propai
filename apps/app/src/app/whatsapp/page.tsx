'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Filter, Loader2, MessageSquare, RefreshCw, Search, ShieldCheck, Smartphone, Users } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabase';

type StatusResponse = {
    status?: 'connected' | 'connecting' | 'disconnected';
};

type GroupCategory = 'real_estate' | 'family' | 'work' | 'other';

type ParseGroup = {
    id: string;
    name: string;
    participantsCount?: number;
    parseEnabled: boolean;
    lastActiveAt?: string | null;
    category: GroupCategory;
};

type ParseDm = {
    remoteJid: string;
    displayName: string;
    normalizedPhone?: string | null;
    parseEnabled: boolean;
    lastMessageAt?: string | null;
};

type ParseTargets = {
    groups: ParseGroup[];
    dms: ParseDm[];
};

const emptyTargets: ParseTargets = { groups: [], dms: [] };
type PrivacyTab = 'groups' | 'dms';

const categoryLabels: Record<GroupCategory, string> = {
    real_estate: 'Real estate',
    family: 'Family',
    work: 'Work',
    other: 'Other',
};

function formatSeen(value?: string | null) {
    if (!value) return 'No recent activity';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No recent activity';
    return date.toLocaleString();
}

export default function WhatsAppPage() {
    const router = useRouter();
    const [userId, setUserId] = useState<string | null>(null);
    const [status, setStatus] = useState<StatusResponse['status']>('disconnected');
    const [targets, setTargets] = useState<ParseTargets>(emptyTargets);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pendingKey, setPendingKey] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<'all' | GroupCategory>('all');
    const [enabledOnly, setEnabledOnly] = useState(false);
    const [activeTab, setActiveTab] = useState<PrivacyTab>('groups');
    const [error, setError] = useState('');

    useEffect(() => {
        const supabase = getSupabaseClient();
        if (!supabase) {
            router.push('/login');
            return;
        }

        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) {
                router.push('/login');
                return;
            }
            setUserId(data.user.id);
        });
    }, [router]);

    const load = useCallback(async (syncGroups = false) => {
        if (!userId) return;

        setError('');
        setRefreshing(true);
        try {
            if (syncGroups) {
                await apiFetch(`/api/whatsapp/groups?tenantId=${userId}`).catch(() => null);
            }

            const [statusRes, targetsRes] = await Promise.all([
                apiFetch('/api/whatsapp/status'),
                apiFetch('/api/whatsapp/parse-targets'),
            ]);

            const statusData = await statusRes.json().catch(() => ({}));
            setStatus(statusData?.status || 'disconnected');

            if (!targetsRes.ok) {
                const data = await targetsRes.json().catch(() => ({}));
                throw new Error(data?.error || 'Could not load privacy controls');
            }

            const data = await targetsRes.json();
            setTargets({
                groups: Array.isArray(data?.groups) ? data.groups : [],
                dms: Array.isArray(data?.dms) ? data.dms : [],
            });
        } catch (err: any) {
            setError(err?.message || 'Could not refresh WhatsApp controls');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [userId]);

    useEffect(() => {
        void load(true);
    }, [load]);

    const toggleTarget = async (targetType: 'group' | 'dm', remoteJid: string, nextValue: boolean) => {
        const key = `${targetType}:${remoteJid}`;
        setPendingKey(key);
        setError('');

        setTargets((current) => ({
            groups: current.groups.map((group) => group.id === remoteJid ? { ...group, parseEnabled: nextValue } : group),
            dms: current.dms.map((dm) => dm.remoteJid === remoteJid ? { ...dm, parseEnabled: nextValue } : dm),
        }));

        try {
            const res = await apiFetch('/api/whatsapp/parse-consent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetType, remoteJid, parseEnabled: nextValue }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || 'Could not update privacy control');
            }
        } catch (err: any) {
            setTargets((current) => ({
                groups: current.groups.map((group) => group.id === remoteJid ? { ...group, parseEnabled: !nextValue } : group),
                dms: current.dms.map((dm) => dm.remoteJid === remoteJid ? { ...dm, parseEnabled: !nextValue } : dm),
            }));
            setError(err?.message || 'Could not update privacy control');
        } finally {
            setPendingKey(null);
        }
    };

    const batchUpdate = async (targetType: 'group' | 'dm', remoteJids: string[], parseEnabled: boolean, pendingLabel: string) => {
        const ids = Array.from(new Set(remoteJids.filter(Boolean)));
        if (ids.length === 0) return;

        setPendingKey(pendingLabel);
        setError('');

        setTargets((current) => ({
            groups: targetType === 'group'
                ? current.groups.map((group) => ids.includes(group.id) ? { ...group, parseEnabled } : group)
                : current.groups,
            dms: targetType === 'dm'
                ? current.dms.map((dm) => ids.includes(dm.remoteJid) ? { ...dm, parseEnabled } : dm)
                : current.dms,
        }));

        try {
            const res = await apiFetch('/api/whatsapp/parse-consent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetType, remoteJids: ids, parseEnabled }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || 'Could not update privacy controls');
            }
        } catch (err: any) {
            setTargets((current) => ({
                groups: targetType === 'group'
                    ? current.groups.map((group) => ids.includes(group.id) ? { ...group, parseEnabled: !parseEnabled } : group)
                    : current.groups,
                dms: targetType === 'dm'
                    ? current.dms.map((dm) => ids.includes(dm.remoteJid) ? { ...dm, parseEnabled: !parseEnabled } : dm)
                    : current.dms,
            }));
            setError(err?.message || 'Could not update privacy controls');
        } finally {
            setPendingKey(null);
        }
    };

    const query = search.trim().toLowerCase();
    const filteredGroups = useMemo(() => targets.groups.filter((group) => {
        if (selectedCategory !== 'all' && group.category !== selectedCategory) return false;
        if (enabledOnly && !group.parseEnabled) return false;
        if (!query) return true;
        return group.name.toLowerCase().includes(query);
    }), [enabledOnly, query, selectedCategory, targets.groups]);

    const watchedGroups = useMemo(() => targets.groups.filter((group) => group.parseEnabled).length, [targets.groups]);
    const watchedDms = useMemo(() => targets.dms.filter((dm) => dm.parseEnabled).length, [targets.dms]);
    const isConnected = status === 'connected';
    const dmMasterEnabled = watchedDms > 0;
    const visibleGroupIds = filteredGroups.map((group) => group.id);
    const allGroupIds = targets.groups.map((group) => group.id);
    const allDmIds = targets.dms.map((dm) => dm.remoteJid);
    const shouldShowDmThreads = dmMasterEnabled || targets.dms.some((dm) => dm.parseEnabled);

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,#173127_0%,#0b1115_42%,#070a0d_100%)] px-4 py-6 text-white md:px-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">WhatsApp privacy</p>
                        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Choose what PropAI may read</h1>
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                            PropAI only reads the groups and chats you enable here. Everything else stays private and ignored by default.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${isConnected ? 'border-emerald-400/40 bg-emerald-400/12 text-emerald-200' : 'border-amber-400/40 bg-amber-400/12 text-amber-200'}`}>
                            <Smartphone className="h-4 w-4" />
                            {status || 'disconnected'}
                        </span>
                        <button
                            type="button"
                            onClick={() => void load(true)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                            aria-label="Refresh WhatsApp controls"
                        >
                            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </header>

                <section className="rounded-[28px] border border-emerald-400/25 bg-[linear-gradient(135deg,rgba(18,88,61,0.95),rgba(10,39,29,0.95))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-3xl">
                            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-50">
                                <ShieldCheck className="h-4 w-4" />
                                Privacy-first control
                            </div>
                            <h2 className="mt-4 text-2xl font-semibold text-white">AI only reads what you enable</h2>
                            <p className="mt-2 text-sm leading-6 text-emerald-50/85">
                                Start with groups that matter for listings, inventory, and client demand. DMs remain off unless you explicitly opt in.
                            </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <StatCard label="Enabled groups" value={String(watchedGroups)} hint={`${targets.groups.length} discovered`} icon={<Users className="h-4 w-4" />} />
                            <StatCard label="Enabled DMs" value={String(watchedDms)} hint={`${targets.dms.length} discovered`} icon={<MessageSquare className="h-4 w-4" />} />
                            <StatCard label="Default mode" value="Private" hint="New chats stay off" icon={<CheckCircle2 className="h-4 w-4" />} />
                        </div>
                    </div>
                </section>

                {error ? (
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {error}
                    </div>
                ) : null}

                {loading ? (
                    <div className="flex min-h-[320px] items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.04] text-slate-300">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading WhatsApp controls
                    </div>
                ) : (
                    <section className="rounded-[28px] border border-white/10 bg-white/[0.04] shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
                        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
                            <div>
                                <p className="text-sm font-semibold text-white">Parsing controls</p>
                                <p className="mt-1 text-xs text-slate-500">Choose exactly which WhatsApp sources PropAI is allowed to read.</p>
                            </div>
                            <div className="inline-flex rounded-2xl border border-white/10 bg-[#0a1014] p-1">
                                <TabButton active={activeTab === 'groups'} onClick={() => setActiveTab('groups')}>
                                    Groups
                                </TabButton>
                                <TabButton active={activeTab === 'dms'} onClick={() => setActiveTab('dms')}>
                                    Direct messages
                                </TabButton>
                            </div>
                        </div>

                        {activeTab === 'groups' ? (
                            <div className="p-5">
                                <div className="flex flex-col gap-4 border-b border-white/10 pb-5">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Groups</p>
                                            <h2 className="mt-2 text-xl font-semibold">Enable only the groups PropAI should parse</h2>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void batchUpdate('group', visibleGroupIds, true, 'groups:bulk-enable')}
                                                disabled={visibleGroupIds.length === 0 || pendingKey === 'groups:bulk-enable'}
                                                className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {pendingKey === 'groups:bulk-enable' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                                Enable visible
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void batchUpdate('group', allGroupIds, false, 'groups:disable-all')}
                                                disabled={allGroupIds.length === 0 || pendingKey === 'groups:disable-all'}
                                                className="inline-flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {pendingKey === 'groups:disable-all' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                                Disable all
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                                        <label className="relative block flex-1">
                                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                                            <input
                                                value={search}
                                                onChange={(event) => setSearch(event.target.value)}
                                                placeholder="Search groups by name"
                                                className="h-11 w-full rounded-xl border border-white/10 bg-[#0a1014] pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/40"
                                            />
                                        </label>
                                        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0a1014] px-3 py-2 text-xs text-slate-400">
                                            <Filter className="h-4 w-4" />
                                            {filteredGroups.length} shown
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <FilterChip active={selectedCategory === 'all'} onClick={() => setSelectedCategory('all')}>
                                            All groups
                                        </FilterChip>
                                        {(['real_estate', 'work', 'family', 'other'] as GroupCategory[]).map((category) => (
                                            <FilterChip key={category} active={selectedCategory === category} onClick={() => setSelectedCategory(category)}>
                                                {categoryLabels[category]}
                                            </FilterChip>
                                        ))}
                                        <FilterChip active={enabledOnly} onClick={() => setEnabledOnly((value) => !value)}>
                                            Enabled only
                                        </FilterChip>
                                    </div>
                                </div>

                                <div className="mt-5 space-y-3">
                                    {filteredGroups.length === 0 ? (
                                        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-slate-400">
                                            No groups match this filter yet. Refresh after WhatsApp sync if you expected more.
                                        </p>
                                    ) : (
                                        filteredGroups.map((group) => (
                                            <TargetRow
                                                key={group.id}
                                                title={group.name || group.id}
                                                subtitle={`${group.participantsCount || 0} members`}
                                                meta={`${categoryLabels[group.category]} · ${formatSeen(group.lastActiveAt)}`}
                                                enabled={group.parseEnabled}
                                                pending={pendingKey === `group:${group.id}`}
                                                badge={group.category}
                                                onToggle={() => void toggleTarget('group', group.id, !group.parseEnabled)}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="border-b border-emerald-300/15 bg-[linear-gradient(180deg,rgba(41,87,38,0.28),rgba(24,41,31,0.18))] px-5 py-4">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 rounded-full bg-emerald-400/20 p-2 text-emerald-200">
                                            <ShieldCheck className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-emerald-100">PropAI only reads the DMs you enable</p>
                                            <p className="mt-1 max-w-3xl text-xs leading-5 text-emerald-50/80">
                                                Personal chats, OTPs, bank alerts, and every unselected thread stay private by default. Nothing is parsed unless you opt in.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-b border-white/10 px-5 py-5">
                                    <div className="mb-4 flex items-center justify-between gap-4">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Direct messages</p>
                                            <p className="mt-2 text-lg font-semibold text-white">Allow DM parsing</p>
                                            <p className="mt-1 text-sm text-slate-400">Off by default. Only enable threads you want PropAI to read.</p>
                                        </div>
                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${dmMasterEnabled ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-400/15 text-amber-200'}`}>
                                            {watchedDms} of {targets.dms.length} enabled
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0a1014] px-4 py-4">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-white">Master DM opt-in</p>
                                            <p className="mt-1 text-xs text-slate-500">Turn this on before selecting individual threads. Turn it off to disable every DM at once.</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => void batchUpdate('dm', allDmIds, !dmMasterEnabled, 'dms:master')}
                                            disabled={allDmIds.length === 0 || pendingKey === 'dms:master'}
                                            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${dmMasterEnabled ? 'bg-emerald-400' : 'bg-slate-700'}`}
                                            aria-pressed={dmMasterEnabled}
                                        >
                                            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${dmMasterEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                            {pendingKey === 'dms:master' ? <Loader2 className="absolute left-4 top-1.5 h-4 w-4 animate-spin text-slate-950" /> : null}
                                        </button>
                                    </div>
                                </div>

                                <div className="px-5 py-5">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-white">Individual threads</p>
                                            <p className="mt-1 text-xs text-slate-500">Select the specific conversations that PropAI may read.</p>
                                        </div>
                                        <span className="rounded-full border border-white/10 bg-[#0a1014] px-3 py-1 text-xs text-slate-400">
                                            {targets.dms.length} found
                                        </span>
                                    </div>

                                    {!shouldShowDmThreads ? (
                                        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-400">
                                            Enable the DM master switch to choose individual threads.
                                        </div>
                                    ) : targets.dms.length === 0 ? (
                                        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-400">
                                            No DM threads discovered yet.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {targets.dms.map((dm) => (
                                                <TargetRow
                                                    key={dm.remoteJid}
                                                    title={dm.displayName || dm.normalizedPhone || dm.remoteJid}
                                                    subtitle={dm.normalizedPhone || 'WhatsApp contact'}
                                                    meta={formatSeen(dm.lastMessageAt)}
                                                    enabled={dm.parseEnabled}
                                                    pending={pendingKey === `dm:${dm.remoteJid}`}
                                                    badge={dm.parseEnabled ? 'enabled' : 'private'}
                                                    onToggle={() => void toggleTarget('dm', dm.remoteJid, !dm.parseEnabled)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>
                )}
            </div>
        </main>
    );
}

function StatCard({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: ReactNode }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-black/12 px-4 py-4 text-white">
            <div className="flex items-center gap-2 text-emerald-100">
                {icon}
                <span className="text-xs font-semibold uppercase tracking-[0.14em]">{label}</span>
            </div>
            <p className="mt-3 text-3xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-emerald-50/75">{hint}</p>
        </div>
    );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-full border px-3 py-2 text-sm font-medium transition ${active ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}
        >
            {children}
        </button>
    );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${active ? 'bg-emerald-400 text-slate-950' : 'text-slate-300 hover:bg-white/8'}`}
        >
            {children}
        </button>
    );
}

function TargetRow({
    title,
    subtitle,
    meta,
    enabled,
    pending,
    badge,
    onToggle,
}: {
    title: string;
    subtitle: string;
    meta: string;
    enabled: boolean;
    pending: boolean;
    badge: string;
    onToggle: () => void;
}) {
    return (
        <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0a1014] px-4 py-4">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white">{title}</p>
                    <span className="rounded-full bg-white/6 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-300">
                        {badge.replace('_', ' ')}
                    </span>
                </div>
                <p className="mt-1 truncate text-sm text-slate-400">{subtitle}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{meta}</p>
            </div>
            <button
                type="button"
                onClick={onToggle}
                disabled={pending}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${enabled ? 'bg-emerald-400' : 'bg-slate-700'} disabled:opacity-60`}
                aria-pressed={enabled}
            >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                {pending ? <Loader2 className="absolute left-4 top-1.5 h-4 w-4 animate-spin text-slate-950" /> : null}
            </button>
        </label>
    );
}
