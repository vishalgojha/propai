import React, { useEffect, useState, useCallback } from 'react';
import { cn } from '../lib/utils';
import {
    ArrowRightIcon, CheckCircleIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon,
    GroupsIcon, LoaderIcon, MapPinIcon, MessageCircleIcon, PlusIcon,
    SettingsIcon, ShieldCheckIcon, TrashIcon, UserIcon, XIcon,
} from '../lib/icons';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';

const STEPS = [
    { label: 'Profile', icon: SettingsIcon },
    { label: 'Location', icon: MapPinIcon },
    { label: 'Team', icon: GroupsIcon },
    { label: 'Groups', icon: MessageCircleIcon },
    { label: 'Realtors', icon: ShieldCheckIcon },
    { label: 'Review', icon: CheckCircleIcon },
];

type TeamMember = { name?: string; mobile?: string };
type GroupEntry = { id?: string; name?: string; excluded?: boolean };
type RealtorEntry = { name?: string; mobile?: string };

type OnboardingData = {
    full_name?: string;
    agency_name?: string;
    city?: string;
    localities?: string[];
    team_members?: TeamMember[];
    whatsapp_groups?: GroupEntry[];
    allowlisted_realtors?: RealtorEntry[];
    onboarding_step?: number;
    onboarding_completed?: boolean;
};

const emptyData: OnboardingData = {
    full_name: '',
    agency_name: '',
    city: '',
    localities: [],
    team_members: [],
    whatsapp_groups: [],
    allowlisted_realtors: [],
    onboarding_step: 0,
    onboarding_completed: false,
};

export const Onboarding: React.FC = () => {
    const [step, setStep] = useState(0);
    const [data, setData] = useState<OnboardingData>(emptyData);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [localityInput, setLocalityInput] = useState('');
    const [teamName, setTeamName] = useState('');
    const [teamPhone, setTeamPhone] = useState('');
    const [groupInput, setGroupInput] = useState('');
    const [realtorName, setRealtorName] = useState('');
    const [realtorPhone, setRealtorPhone] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const resp = await backendApi.get(ENDPOINTS.identity.onboarding);
                const existing = resp.data?.data;
                if (existing) {
                    setData({ ...emptyData, ...existing });
                    setStep(Math.min(existing.onboarding_step || 0, 5));
                }
            } catch { }
            setLoading(false);
        })();
    }, []);

    const updateData = useCallback((patch: Partial<OnboardingData>) => {
        setData((prev) => ({ ...prev, ...patch }));
    }, []);

    const saveStep = useCallback(async (stepData: Partial<OnboardingData>) => {
        setSaving(true);
        setError(null);
        try {
            const nextStep = Math.min(step + 1, 5);
            await backendApi.post(ENDPOINTS.identity.onboarding, {
                ...data,
                ...stepData,
                onboarding_step: nextStep,
            });
            setData((prev) => ({ ...prev, ...stepData, onboarding_step: nextStep }));
        } catch (err) {
            setError(handleApiError(err));
        }
        setSaving(false);
    }, [data, step]);

    const handleNext = async () => {
        if (step === 0) {
            if (!data.full_name?.trim()) { setError('Full name is required'); return; }
            await saveStep({ full_name: data.full_name, agency_name: data.agency_name });
        } else if (step === 1) {
            if (!data.city?.trim()) { setError('City is required'); return; }
            await saveStep({ city: data.city, localities: data.localities });
        } else if (step === 2) {
            await saveStep({ team_members: data.team_members });
        } else if (step === 3) {
            await saveStep({ whatsapp_groups: data.whatsapp_groups });
        } else if (step === 4) {
            await saveStep({ allowlisted_realtors: data.allowlisted_realtors });
        } else if (step === 5) {
            setSaving(true);
            setError(null);
            try {
                await backendApi.post(ENDPOINTS.identity.onboarding, {
                    ...data,
                    onboarding_step: 6,
                    onboarding_completed: true,
                });
                setSuccess(true);
            } catch (err) {
                setError(handleApiError(err));
            }
            setSaving(false);
            return;
        }
        if (!error) setStep((s) => Math.min(s + 1, 5));
    };

    const handleBack = () => setStep((s) => Math.max(s - 1, 0));

    const addLocality = () => {
        const val = localityInput.trim();
        if (val && !(data.localities || []).includes(val)) {
            updateData({ localities: [...(data.localities || []), val] });
        }
        setLocalityInput('');
    };

    const removeLocality = (idx: number) => {
        const arr = [...(data.localities || [])];
        arr.splice(idx, 1);
        updateData({ localities: arr });
    };

    const addTeamMember = () => {
        if (!teamName.trim() && !teamPhone.trim()) return;
        updateData({ team_members: [...(data.team_members || []), { name: teamName.trim() || undefined, mobile: teamPhone.trim() || undefined }] });
        setTeamName('');
        setTeamPhone('');
    };

    const removeTeamMember = (idx: number) => {
        const arr = [...(data.team_members || [])];
        arr.splice(idx, 1);
        updateData({ team_members: arr });
    };

    const addGroup = () => {
        const val = groupInput.trim();
        if (!val) return;
        updateData({ whatsapp_groups: [...(data.whatsapp_groups || []), { name: val, excluded: false }] });
        setGroupInput('');
    };

    const toggleGroupExcluded = (idx: number) => {
        const arr = [...(data.whatsapp_groups || [])];
        arr[idx] = { ...arr[idx], excluded: !arr[idx].excluded };
        updateData({ whatsapp_groups: arr });
    };

    const removeGroup = (idx: number) => {
        const arr = [...(data.whatsapp_groups || [])];
        arr.splice(idx, 1);
        updateData({ whatsapp_groups: arr });
    };

    const addRealtor = () => {
        if (!realtorName.trim() && !realtorPhone.trim()) return;
        updateData({ allowlisted_realtors: [...(data.allowlisted_realtors || []), { name: realtorName.trim() || undefined, mobile: realtorPhone.trim() || undefined }] });
        setRealtorName('');
        setRealtorPhone('');
    };

    const removeRealtor = (idx: number) => {
        const arr = [...(data.allowlisted_realtors || [])];
        arr.splice(idx, 1);
        updateData({ allowlisted_realtors: arr });
    };

    const inputClass = 'w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50';
    const labelClass = 'mb-2 block text-[13px] font-semibold text-[var(--text-secondary)]';
    const chipClass = 'inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 text-[13px] text-[var(--text-primary)]';
    const btnClass = 'flex items-center gap-2 rounded-xl px-6 py-3 text-[14px] font-semibold transition disabled:opacity-50';

    if (loading) {
        return (
            <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center">
                <LoaderIcon className="h-8 w-8 animate-spin text-[var(--accent)]" />
            </div>
        );
    }

    if (success) {
        return (
            <div className="mx-auto max-w-2xl py-20 text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent)]/10">
                    <CheckCircleIcon className="h-10 w-10 text-[var(--accent)]" />
                </div>
                <h2 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">You're all set!</h2>
                <p className="mb-8 text-[15px] text-[var(--text-secondary)]">Your profile is complete. PropAI Pulse is ready to help you grow.</p>
                <a href="/dashboard" className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3 text-[14px] font-semibold text-black transition hover:opacity-90">
                    Go to Dashboard <ArrowRightIcon className="h-4 w-4" />
                </a>
            </div>
        );
    }

    const StepIcon = STEPS[step].icon;

    return (
        <div className="mx-auto max-w-2xl py-10">
            <div className="mb-10 text-center">
                <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">Set up your profile</h1>
                <p className="text-[15px] text-[var(--text-secondary)]">Help us personalise your PropAI Pulse experience</p>
            </div>

            <div className="mb-10 flex items-center justify-center gap-2">
                {STEPS.map((s, i) => {
                    const isActive = i === step;
                    const isDone = i < step;
                    return (
                        <div key={i} className="flex items-center gap-2">
                            <div className={cn(
                                'flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold transition',
                                isActive && 'bg-[var(--accent)] text-black',
                                isDone && 'bg-[var(--accent)]/20 text-[var(--accent)]',
                                !isActive && !isDone && 'border border-[var(--border)] text-[var(--text-muted)]',
                            )}>
                                {isDone ? <CheckIcon className="h-4 w-4" /> : i + 1}
                            </div>
                            <span className={cn('hidden text-[13px] font-medium sm:inline', isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]')}>{s.label}</span>
                            {i < STEPS.length - 1 && <div className={cn('mx-1 h-px w-6', i < step ? 'bg-[var(--accent)]' : 'bg-[var(--border)]')} />}
                        </div>
                    );
                })}
            </div>

            <div className="rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface)] p-8 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
                <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--border)] bg-[var(--bg-elevated)]">
                        <StepIcon className="h-5 w-5 text-[var(--accent)]" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Step {step + 1} of 6</p>
                        <h3 className="mt-1 text-[16px] font-semibold text-[var(--text-primary)]">{STEPS[step].label}</h3>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
                        {error}
                    </div>
                )}

                {step === 0 && (
                    <div className="space-y-4">
                        <div>
                            <label className={labelClass}>Full Name *</label>
                            <input className={inputClass} placeholder="Your full name" value={data.full_name || ''} onChange={(e) => updateData({ full_name: e.target.value })} />
                        </div>
                        <div>
                            <label className={labelClass}>Agency Name</label>
                            <input className={inputClass} placeholder="Your agency (optional)" value={data.agency_name || ''} onChange={(e) => updateData({ agency_name: e.target.value })} />
                        </div>
                    </div>
                )}

                {step === 1 && (
                    <div className="space-y-4">
                        <div>
                            <label className={labelClass}>City *</label>
                            <input className={inputClass} placeholder="e.g. Mumbai" value={data.city || ''} onChange={(e) => updateData({ city: e.target.value })} />
                        </div>
                        <div>
                            <label className={labelClass}>Localities you operate in</label>
                            <div className="flex gap-2">
                                <input className={inputClass} placeholder="Type a locality and press Add" value={localityInput} onChange={(e) => setLocalityInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLocality())} />
                                <button onClick={addLocality} disabled={!localityInput.trim()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)] text-black transition hover:opacity-90 disabled:opacity-40">
                                    <PlusIcon className="h-5 w-5" />
                                </button>
                            </div>
                            {(data.localities || []).length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {(data.localities || []).map((loc, i) => (
                                        <span key={i} className={chipClass}>
                                            {loc}
                                            <button onClick={() => removeLocality(i)} className="text-[var(--text-muted)] hover:text-red-400"><XIcon className="h-3.5 w-3.5" /></button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4">
                        <p className="text-[13px] text-[var(--text-secondary)]">Add people on your team so they can access Pulse too.</p>
                        <div className="flex gap-2">
                            <input className={inputClass} placeholder="Name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
                            <input className={inputClass} placeholder="Phone" value={teamPhone} onChange={(e) => setTeamPhone(e.target.value)} />
                            <button onClick={addTeamMember} disabled={!teamName.trim() && !teamPhone.trim()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)] text-black transition hover:opacity-90 disabled:opacity-40">
                                <PlusIcon className="h-5 w-5" />
                            </button>
                        </div>
                        {(data.team_members || []).length > 0 && (
                            <div className="space-y-2">
                                {(data.team_members || []).map((m, i) => (
                                    <div key={i} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
                                        <div className="text-[14px] text-[var(--text-primary)]">
                                            <span className="font-medium">{m.name || 'Unnamed'}</span>
                                            {m.mobile && <span className="ml-2 text-[var(--text-muted)]">{m.mobile}</span>}
                                        </div>
                                        <button onClick={() => removeTeamMember(i)} className="text-[var(--text-muted)] hover:text-red-400"><TrashIcon className="h-4 w-4" /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-4">
                        <p className="text-[13px] text-[var(--text-secondary)]">Add your WhatsApp groups. Mark personal groups as excluded so Pulse only monitors work groups.</p>
                        <div className="flex gap-2">
                            <input className={inputClass} placeholder="Group name" value={groupInput} onChange={(e) => setGroupInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addGroup())} />
                            <button onClick={addGroup} disabled={!groupInput.trim()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)] text-black transition hover:opacity-90 disabled:opacity-40">
                                <PlusIcon className="h-5 w-5" />
                            </button>
                        </div>
                        {(data.whatsapp_groups || []).length > 0 && (
                            <div className="space-y-2">
                                {(data.whatsapp_groups || []).map((g, i) => (
                                    <div key={i} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => toggleGroupExcluded(i)} className={cn(
                                                'flex h-5 w-5 items-center justify-center rounded border transition',
                                                g.excluded ? 'border-red-500/50 bg-red-500/20 text-red-400' : 'border-[var(--border)] bg-[var(--bg-surface)] text-transparent',
                                            )}>
                                                {g.excluded && <XIcon className="h-3 w-3" />}
                                            </button>
                                            <span className={cn('text-[14px]', g.excluded ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]')}>{g.name}</span>
                                            {g.excluded && <span className="rounded bg-red-500/10 px-2 py-0.5 text-[11px] text-red-400">Personal</span>}
                                        </div>
                                        <button onClick={() => removeGroup(i)} className="text-[var(--text-muted)] hover:text-red-400"><TrashIcon className="h-4 w-4" /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {step === 4 && (
                    <div className="space-y-4">
                        <p className="text-[13px] text-[var(--text-secondary)]">Allowlist other realtors or brokers you collaborate with. Pulse will recognise them in group conversations.</p>
                        <div className="flex gap-2">
                            <input className={inputClass} placeholder="Name" value={realtorName} onChange={(e) => setRealtorName(e.target.value)} />
                            <input className={inputClass} placeholder="Phone" value={realtorPhone} onChange={(e) => setRealtorPhone(e.target.value)} />
                            <button onClick={addRealtor} disabled={!realtorName.trim() && !realtorPhone.trim()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)] text-black transition hover:opacity-90 disabled:opacity-40">
                                <PlusIcon className="h-5 w-5" />
                            </button>
                        </div>
                        {(data.allowlisted_realtors || []).length > 0 && (
                            <div className="space-y-2">
                                {(data.allowlisted_realtors || []).map((r, i) => (
                                    <div key={i} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
                                        <div className="text-[14px] text-[var(--text-primary)]">
                                            <span className="font-medium">{r.name || 'Unnamed'}</span>
                                            {r.mobile && <span className="ml-2 text-[var(--text-muted)]">{r.mobile}</span>}
                                        </div>
                                        <button onClick={() => removeRealtor(i)} className="text-[var(--text-muted)] hover:text-red-400"><TrashIcon className="h-4 w-4" /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {step === 5 && (
                    <div className="space-y-3">
                        <p className="text-[13px] text-[var(--text-secondary)]">Review your information before we finish.</p>
                        {[
                            { label: 'Full Name', value: data.full_name },
                            { label: 'Agency', value: data.agency_name },
                            { label: 'City', value: data.city },
                            { label: 'Localities', value: (data.localities || []).join(', ') },
                            { label: 'Team Members', value: (data.team_members || []).length ? `${data.team_members?.length} member(s)` : 'None' },
                            { label: 'WhatsApp Groups', value: (data.whatsapp_groups || []).length ? `${data.whatsapp_groups?.length} group(s)` : 'None' },
                            { label: 'Allowlisted Realtors', value: (data.allowlisted_realtors || []).length ? `${data.allowlisted_realtors?.length} realtor(s)` : 'None' },
                        ].map((row, i) => (
                            <div key={i} className="flex justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[14px]">
                                <span className="text-[var(--text-secondary)]">{row.label}</span>
                                <span className="font-medium text-[var(--text-primary)]">{row.value || '—'}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-8 flex items-center justify-between border-t border-[var(--border)] pt-6">
                    <button onClick={handleBack} disabled={step === 0} className={cn(btnClass, 'border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]')}>
                        <ChevronLeftIcon className="h-4 w-4" /> Back
                    </button>
                    <button onClick={handleNext} disabled={saving} className={cn(btnClass, 'bg-[var(--accent)] text-black hover:opacity-90')}>
                        {saving ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null}
                        {step === 5 ? 'Complete' : 'Next'} {!saving && <ChevronRightIcon className="h-4 w-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
};
