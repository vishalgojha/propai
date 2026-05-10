import React, { useEffect, useState, useCallback } from 'react';
import { cn } from '../lib/utils';
import {
    ArrowRightIcon, CheckCircleIcon, CheckIcon, LoaderIcon, XIcon,
} from '../lib/icons';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';

const STEPS = ['Name', 'Agency', 'City', 'Localities', 'Team', 'Done'];

type TeamMember = { name?: string; mobile?: string };
type OnboardingData = {
    full_name?: string;
    agency_name?: string;
    city?: string;
    localities?: string[];
    team_members?: TeamMember[];
    onboarding_step?: number;
    onboarding_completed?: boolean;
};

const emptyData: OnboardingData = {
    full_name: '', agency_name: '', city: '',
    localities: [], team_members: [],
    onboarding_step: 0, onboarding_completed: false,
};

export const Onboarding: React.FC = () => {
    const [step, setStep] = useState(0);
    const [data, setData] = useState<OnboardingData>(emptyData);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [fieldValue, setFieldValue] = useState('');
    const [localityInput, setLocalityInput] = useState('');
    const [teamName, setTeamName] = useState('');
    const [teamPhone, setTeamPhone] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const resp = await backendApi.get(ENDPOINTS.identity.onboarding);
                const existing = resp.data?.data;
                if (existing) {
                    setData({ ...emptyData, ...existing });
                    const s = Math.min(existing.onboarding_step || 0, 5);
                    setStep(s);
                    if (s === 0) setFieldValue(existing.full_name || '');
                    else if (s === 1) setFieldValue(existing.agency_name || '');
                    else if (s === 2) setFieldValue(existing.city || '');
                }
            } catch { }
            setLoading(false);
        })();
    }, []);

    const updateData = useCallback((patch: Partial<OnboardingData>) => {
        setData((prev) => ({ ...prev, ...patch }));
    }, []);

    const saveStep = useCallback(async (patch: Partial<OnboardingData>) => {
        setSaving(true);
        setError(null);
        try {
            const nextStep = Math.min(step + 1, 5);
            await backendApi.post(ENDPOINTS.identity.onboarding, {
                ...data, ...patch, onboarding_step: nextStep,
            });
            setData((prev) => ({ ...prev, ...patch, onboarding_step: nextStep }));
            setStep(nextStep);
            if (nextStep < 5) setFieldValue('');
        } catch (err) {
            setError(handleApiError(err));
        }
        setSaving(false);
    }, [data, step]);

    const handleNext = async () => {
        if (step === 0) {
            if (!fieldValue.trim()) { setError('Enter your full name'); return; }
            await saveStep({ full_name: fieldValue.trim() });
        } else if (step === 1) {
            await saveStep({ agency_name: fieldValue.trim() || null });
        } else if (step === 2) {
            if (!fieldValue.trim()) { setError('Enter your city'); return; }
            await saveStep({ city: fieldValue.trim() });
        } else if (step === 3) {
            await saveStep({ localities: data.localities });
        } else if (step === 4) {
            await saveStep({ team_members: data.team_members });
        } else if (step === 5) {
            setSaving(true);
            setError(null);
            try {
                await backendApi.post(ENDPOINTS.identity.onboarding, {
                    ...data, onboarding_step: 6, onboarding_completed: true,
                });
                setSuccess(true);
            } catch (err) {
                setError(handleApiError(err));
            }
            setSaving(false);
        }
    };

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

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-black">
                <LoaderIcon className="h-8 w-8 animate-spin text-[var(--accent)]" />
            </div>
        );
    }

    if (success) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-center">
                <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent)]/10">
                    <CheckCircleIcon className="h-10 w-10 text-[var(--accent)]" />
                </div>
                <h2 className="mb-2 text-3xl font-bold text-white">You're all set!</h2>
                <p className="mb-10 text-[17px] text-gray-400">Your profile is ready. Let's find you some deals.</p>
                <a href="/dashboard" className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-8 py-4 text-[16px] font-semibold text-black transition hover:opacity-90">
                    Go to Dashboard <ArrowRightIcon className="h-5 w-5" />
                </a>
            </div>
        );
    }

    const progressLabel = `${step + 1} / ${STEPS.length}`;

    return (
        <div className="flex min-h-screen flex-col bg-black">
            <div className="flex items-center justify-between px-6 py-5">
                <span className="text-[13px] font-medium text-gray-500">{progressLabel}</span>
                <div className="flex gap-1.5">
                    {STEPS.map((_, i) => (
                        <div key={i} className={cn(
                            'h-1.5 w-6 rounded-full transition',
                            i <= step ? 'bg-[var(--accent)]' : 'bg-gray-800',
                        )} />
                    ))}
                </div>
            </div>

            <div className="flex flex-1 flex-col justify-center px-6 pb-32">
                <div className="mx-auto w-full max-w-lg">
                    {error && (
                        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-3.5 text-[15px] text-red-400">
                            {error}
                        </div>
                    )}

                    {step === 0 && (
                        <div>
                            <p className="mb-2 text-[13px] font-medium uppercase tracking-[0.1em] text-gray-500">Step 1</p>
                            <h2 className="mb-8 text-[28px] font-bold leading-tight text-white">What's your full name?</h2>
                            <input
                                value={fieldValue}
                                onChange={(e) => setFieldValue(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleNext())}
                                placeholder="Type your name"
                                className="w-full border-0 border-b-2 border-gray-700 bg-transparent pb-3 text-[28px] font-semibold text-white outline-none transition placeholder:text-gray-600 focus:border-[var(--accent)]"
                                autoFocus
                            />
                        </div>
                    )}

                    {step === 1 && (
                        <div>
                            <p className="mb-2 text-[13px] font-medium uppercase tracking-[0.1em] text-gray-500">Step 2</p>
                            <h2 className="mb-8 text-[28px] font-bold leading-tight text-white">Your agency name?</h2>
                            <input
                                value={fieldValue}
                                onChange={(e) => setFieldValue(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleNext())}
                                placeholder="e.g. Shah Realty (optional)"
                                className="w-full border-0 border-b-2 border-gray-700 bg-transparent pb-3 text-[28px] font-semibold text-white outline-none transition placeholder:text-gray-600 focus:border-[var(--accent)]"
                                autoFocus
                            />
                        </div>
                    )}

                    {step === 2 && (
                        <div>
                            <p className="mb-2 text-[13px] font-medium uppercase tracking-[0.1em] text-gray-500">Step 3</p>
                            <h2 className="mb-8 text-[28px] font-bold leading-tight text-white">Which city do you operate in?</h2>
                            <input
                                value={fieldValue}
                                onChange={(e) => setFieldValue(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleNext())}
                                placeholder="e.g. Mumbai"
                                className="w-full border-0 border-b-2 border-gray-700 bg-transparent pb-3 text-[28px] font-semibold text-white outline-none transition placeholder:text-gray-600 focus:border-[var(--accent)]"
                                autoFocus
                            />
                        </div>
                    )}

                    {step === 3 && (
                        <div>
                            <p className="mb-2 text-[13px] font-medium uppercase tracking-[0.1em] text-gray-500">Step 4</p>
                            <h2 className="mb-8 text-[28px] font-bold leading-tight text-white">Which localities do you serve?</h2>
                            <div className="flex gap-2">
                                <input
                                    value={localityInput}
                                    onChange={(e) => setLocalityInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLocality())}
                                    placeholder="Type a locality and press Enter"
                                    className="flex-1 border-0 border-b-2 border-gray-700 bg-transparent pb-3 text-[22px] font-semibold text-white outline-none transition placeholder:text-gray-600 focus:border-[var(--accent)]"
                                    autoFocus
                                />
                            </div>
                            {(data.localities || []).length > 0 && (
                                <div className="mt-6 flex flex-wrap gap-2">
                                    {(data.localities || []).map((loc, i) => (
                                        <span key={i} className="inline-flex items-center gap-2 rounded-full border border-gray-700 bg-gray-900 px-4 py-2 text-[15px] text-white">
                                            {loc}
                                            <button onClick={() => removeLocality(i)} className="text-gray-500 hover:text-red-400">
                                                <XIcon className="h-4 w-4" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 4 && (
                        <div>
                            <p className="mb-2 text-[13px] font-medium uppercase tracking-[0.1em] text-gray-500">Step 5</p>
                            <h2 className="mb-8 text-[28px] font-bold leading-tight text-white">Add team members</h2>
                            <div className="flex gap-2">
                                <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Name"
                                    className="flex-1 border-0 border-b-2 border-gray-700 bg-transparent pb-3 text-[18px] text-white outline-none transition placeholder:text-gray-600 focus:border-[var(--accent)]" />
                                <input value={teamPhone} onChange={(e) => setTeamPhone(e.target.value)} placeholder="Phone"
                                    className="flex-1 border-0 border-b-2 border-gray-700 bg-transparent pb-3 text-[18px] text-white outline-none transition placeholder:text-gray-600 focus:border-[var(--accent)]" />
                                <button onClick={addTeamMember} disabled={!teamName.trim() && !teamPhone.trim()}
                                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-black text-2xl font-bold transition hover:opacity-90 disabled:opacity-30">
                                    +
                                </button>
                            </div>
                            {(data.team_members || []).length > 0 && (
                                <div className="mt-6 space-y-2">
                                    {(data.team_members || []).map((m, i) => (
                                        <div key={i} className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-5 py-3">
                                            <span className="text-[16px] text-white">
                                                {m.name || 'Unnamed'} {m.mobile && <span className="ml-2 text-gray-500">{m.mobile}</span>}
                                            </span>
                                            <button onClick={() => removeTeamMember(i)} className="text-gray-600 hover:text-red-400">
                                                <XIcon className="h-5 w-5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 5 && (
                        <div className="text-center">
                            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)]/10">
                                <CheckCircleIcon className="h-8 w-8 text-[var(--accent)]" />
                            </div>
                            <h2 className="mb-2 text-[28px] font-bold text-white">Ready to go</h2>
                            <p className="mb-2 text-[16px] text-gray-400">
                                {data.full_name}{data.agency_name ? ` · ${data.agency_name}` : ''}{data.city ? ` · ${data.city}` : ''}
                            </p>
                            <p className="text-[14px] text-gray-500">
                                {(data.localities || []).length} localities · {(data.team_members || []).length} team members
                            </p>
                        </div>
                    )}

                    <div className="mt-12 flex justify-between">
                        <button onClick={() => setStep((s) => Math.max(s - 1, 0))} disabled={step === 0}
                            className="rounded-xl px-6 py-3 text-[15px] font-semibold text-gray-500 transition hover:text-white disabled:opacity-30">
                            Back
                        </button>
                        <button onClick={handleNext} disabled={saving}
                            className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-8 py-3 text-[15px] font-semibold text-black transition hover:opacity-90 disabled:opacity-50">
                            {saving ? <LoaderIcon className="h-5 w-5 animate-spin" /> : null}
                            {step === 5 ? 'Finish' : 'Next'}
                            {!saving && <ArrowRightIcon className="h-5 w-5" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
