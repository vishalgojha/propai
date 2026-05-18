import React, { useEffect, useState } from 'react';
import {
    CheckCircleIcon, GroupsIcon, LoaderIcon, MessageCircleIcon,
    PlusIcon, RefreshIcon, SaveIcon, ShieldCheckIcon, TrashIcon, XIcon,
} from '../lib/icons';
import { cn } from '../lib/utils';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';

type IdentityData = {
    full_name?: string;
    agency_name?: string;
    city?: string;
    localities?: string[];
    team_members?: Array<{ name?: string; mobile?: string }>;
    whatsapp_groups?: Array<{ id?: string; name?: string; excluded?: boolean }>;
    allowlisted_realtors?: Array<{ name?: string; mobile?: string }>;
    onboarding_step?: number;
    onboarding_completed?: boolean;
};

export const SetupGroups: React.FC = () => {
    const [data, setData] = useState<IdentityData>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [groupInput, setGroupInput] = useState('');
    const [realtorName, setRealtorName] = useState('');
    const [realtorPhone, setRealtorPhone] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const resp = await backendApi.get(ENDPOINTS.identity.onboarding);
                setData(resp.data?.data || {});
            } catch { }
            setLoading(false);
        })();
    }, []);

    const groups = data.whatsapp_groups || [];
    const realtors = data.allowlisted_realtors || [];

    const update = (patch: Partial<IdentityData>) => setData((prev) => ({ ...prev, ...patch }));
    const activeGroups = groups.filter((g) => !g.excluded);
    const excludedGroups = groups.filter((g) => g.excluded);

    const addGroup = () => {
        const val = groupInput.trim();
        if (!val || groups.some((g) => g.name === val)) return;
        update({ whatsapp_groups: [...groups, { name: val, excluded: false }] });
        setGroupInput('');
    };

    const toggleExcluded = (idx: number) => {
        const arr = [...groups];
        arr[idx] = { ...arr[idx], excluded: !arr[idx].excluded };
        update({ whatsapp_groups: arr });
    };

    const removeGroup = (idx: number) => {
        const arr = [...groups];
        arr.splice(idx, 1);
        update({ whatsapp_groups: arr });
    };

    const addRealtor = () => {
        if (!realtorName.trim() && !realtorPhone.trim()) return;
        update({ allowlisted_realtors: [...realtors, { name: realtorName.trim() || undefined, mobile: realtorPhone.trim() || undefined }] });
        setRealtorName('');
        setRealtorPhone('');
    };

    const removeRealtor = (idx: number) => {
        const arr = [...realtors];
        arr.splice(idx, 1);
        update({ allowlisted_realtors: arr });
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccess(false);
        try {
            await backendApi.post(ENDPOINTS.identity.onboarding, data);
            setSuccess(true);
            setTimeout(() => setSuccess(false), 2500);
        } catch (err) {
            setError(handleApiError(err));
        }
        setSaving(false);
    };

    const inputClass = 'w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]';

    if (loading) {
        return (
            <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center">
                <LoaderIcon className="h-8 w-8 animate-spin text-[var(--accent)]" />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-2xl py-10">
            <div className="mb-8 text-center">
                <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">Group & Realtor Setup</h1>
                <p className="text-[15px] text-[var(--text-secondary)]">Manage which groups Pulse monitors and who it recognises</p>
            </div>

            {error && (
                <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
                    {error}
                </div>
            )}

            <div className="space-y-6">
                <section className="rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
                    <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--border)] bg-[var(--bg-elevated)]">
                            <MessageCircleIcon className="h-5 w-5 text-[var(--accent)]" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">WhatsApp Groups</p>
                            <p className="mt-1 text-[14px] font-semibold text-[var(--text-primary)]">
                                {activeGroups.length} monitored · {excludedGroups.length} personal
                            </p>
                        </div>
                    </div>

                    <p className="mb-4 text-[13px] text-[var(--text-secondary)]">Add your work groups. Mark personal groups as excluded so Pulse ignores them.</p>

                    <div className="flex gap-2">
                        <input className={inputClass} placeholder="Group name" value={groupInput}
                            onChange={(e) => setGroupInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addGroup())}
                        />
                        <button onClick={addGroup} disabled={!groupInput.trim()}
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)] text-black transition hover:opacity-90 disabled:opacity-40"
                        >
                            <PlusIcon className="h-5 w-5" />
                        </button>
                    </div>

                    {groups.length > 0 && (
                        <div className="mt-4 space-y-2">
                            {groups.map((g, i) => (
                                <div key={i} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => toggleExcluded(i)} className={cn(
                                            'flex h-5 w-5 items-center justify-center rounded border transition',
                                            g.excluded ? 'border-red-500/50 bg-red-500/20 text-red-400' : 'border-[var(--border)] bg-[var(--bg-surface)] text-transparent',
                                        )}>
                                            {g.excluded && <XIcon className="h-3 w-3" />}
                                        </button>
                                        <span className={cn('text-[14px]', g.excluded ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]')}>
                                            {g.name}
                                        </span>
                                        {g.excluded && <span className="rounded bg-red-500/10 px-2 py-0.5 text-[11px] text-red-400">Personal</span>}
                                        {!g.excluded && <span className="rounded bg-[var(--accent)]/10 px-2 py-0.5 text-[11px] text-[var(--accent)]">Monitored</span>}
                                    </div>
                                    <button onClick={() => removeGroup(i)} className="text-[var(--text-muted)] hover:text-red-400">
                                        <TrashIcon className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {groups.length === 0 && (
                        <p className="mt-4 text-center text-[13px] text-[var(--text-muted)]">No groups added yet</p>
                    )}
                </section>

                <section className="rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
                    <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--border)] bg-[var(--bg-elevated)]">
                            <ShieldCheckIcon className="h-5 w-5 text-[var(--accent)]" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Allowlisted Realtors</p>
                            <p className="mt-1 text-[14px] font-semibold text-[var(--text-primary)]">
                                {realtors.length} realtor{realtors.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>

                    <p className="mb-4 text-[13px] text-[var(--text-secondary)]">Realtors you collaborate with. Pulse will recognise them in group conversations.</p>

                    <div className="flex gap-2">
                        <input className={inputClass} placeholder="Name" value={realtorName} onChange={(e) => setRealtorName(e.target.value)} />
                        <input className={inputClass} placeholder="Phone" value={realtorPhone} onChange={(e) => setRealtorPhone(e.target.value)} />
                        <button onClick={addRealtor} disabled={!realtorName.trim() && !realtorPhone.trim()}
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)] text-black transition hover:opacity-90 disabled:opacity-40"
                        >
                            <PlusIcon className="h-5 w-5" />
                        </button>
                    </div>

                    {realtors.length > 0 && (
                        <div className="mt-4 space-y-2">
                            {realtors.map((r, i) => (
                                <div key={i} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
                                    <div className="text-[14px] text-[var(--text-primary)]">
                                        <span className="font-medium">{r.name || 'Unnamed'}</span>
                                        {r.mobile && <span className="ml-2 text-[var(--text-muted)]">{r.mobile}</span>}
                                    </div>
                                    <button onClick={() => removeRealtor(i)} className="text-[var(--text-muted)] hover:text-red-400">
                                        <TrashIcon className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {realtors.length === 0 && (
                        <p className="mt-4 text-center text-[13px] text-[var(--text-muted)]">No realtors added yet</p>
                    )}
                </section>

                <div className="flex items-center justify-center gap-3">
                    <button onClick={handleSave} disabled={saving}
                        className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3 text-[14px] font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
                    >
                        {saving ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <SaveIcon className="h-4 w-4" />}
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    {success && (
                        <span className="flex items-center gap-1.5 text-[13px] text-[var(--accent)]">
                            <CheckCircleIcon className="h-4 w-4" /> Saved
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
