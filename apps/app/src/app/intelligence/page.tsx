'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Building2, Loader2, MapPinned, RefreshCw, Search, Waves } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';

type StreamItem = {
    source_message_id: string;
    source_group_name?: string | null;
    listing_type?: string | null;
    title?: string | null;
    description?: string | null;
    location?: string | null;
    area?: string | null;
    sub_area?: string | null;
    price?: number | null;
    price_type?: string | null;
    size_sqft?: number | null;
    bhk?: number | null;
    property_type?: string | null;
    primary_contact_wa?: string | null;
    message_timestamp?: string | null;
    created_at?: string | null;
};

type BuildingResponse = {
    success?: boolean;
    data?: Record<string, unknown> | null;
    error?: string;
};

type LocalityResponse = {
    success?: boolean;
    data?: {
        locality?: string | null;
        transaction_count?: number | null;
        avg_price_per_sqft?: number | null;
        avg_consideration?: number | null;
        min_price_per_sqft?: number | null;
        max_price_per_sqft?: number | null;
    } | null;
    error?: string;
};

function formatCurrency(value?: number | null) {
    if (value == null || !Number.isFinite(value)) return 'N/A';
    return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function formatDate(value?: string | null) {
    if (!value) return 'Unknown time';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown time';
    return date.toLocaleString();
}

export default function IntelligencePage() {
    const router = useRouter();
    const [userReady, setUserReady] = useState(false);
    const [streamItems, setStreamItems] = useState<StreamItem[]>([]);
    const [streamLoading, setStreamLoading] = useState(true);
    const [streamError, setStreamError] = useState('');
    const [buildingName, setBuildingName] = useState('');
    const [buildingLoading, setBuildingLoading] = useState(false);
    const [buildingResult, setBuildingResult] = useState<Record<string, unknown> | null>(null);
    const [buildingError, setBuildingError] = useState('');
    const [localityName, setLocalityName] = useState('');
    const [localityLoading, setLocalityLoading] = useState(false);
    const [localityResult, setLocalityResult] = useState<LocalityResponse['data'] | null>(null);
    const [localityError, setLocalityError] = useState('');

    useEffect(() => {
        const init = async () => {
            const supabase = getSupabaseClient();
            if (!supabase) {
                router.replace('/login');
                return;
            }

            const { data } = await supabase.auth.getUser();
            if (!data.user) {
                router.replace('/login');
                return;
            }

            setUserReady(true);
        };

        void init();
    }, [router]);

    const loadStream = async () => {
        setStreamLoading(true);
        setStreamError('');

        try {
            const res = await apiFetch('/api/intelligence/stream?hours=24&limit=24');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to load intelligence stream');
            }
            setStreamItems(Array.isArray(data?.items) ? data.items : []);
        } catch (error: any) {
            setStreamError(error?.message || 'Failed to load intelligence stream');
        } finally {
            setStreamLoading(false);
        }
    };

    useEffect(() => {
        if (!userReady) return;
        void loadStream();
    }, [userReady]);

    const searchBuilding = async () => {
        const query = buildingName.trim();
        if (!query) return;

        setBuildingLoading(true);
        setBuildingError('');
        setBuildingResult(null);

        try {
            const res = await apiFetch(`/api/intelligence/igr/building?name=${encodeURIComponent(query)}`);
            const data: BuildingResponse = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to load building intelligence');
            }
            setBuildingResult(data.data || null);
        } catch (error: any) {
            setBuildingError(error?.message || 'Failed to load building intelligence');
        } finally {
            setBuildingLoading(false);
        }
    };

    const searchLocality = async () => {
        const query = localityName.trim();
        if (!query) return;

        setLocalityLoading(true);
        setLocalityError('');
        setLocalityResult(null);

        try {
            const res = await apiFetch(`/api/intelligence/igr/locality?name=${encodeURIComponent(query)}&months=6`);
            const data: LocalityResponse = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to load locality intelligence');
            }
            setLocalityResult(data.data || null);
        } catch (error: any) {
            setLocalityError(error?.message || 'Failed to load locality intelligence');
        } finally {
            setLocalityLoading(false);
        }
    };

    const streamSummary = useMemo(() => ({
        total: streamItems.length,
        sale: streamItems.filter((item) => item.price_type !== 'monthly').length,
        rental: streamItems.filter((item) => item.price_type === 'monthly').length,
    }), [streamItems]);

    return (
        <main className="min-h-screen bg-black px-4 py-6 text-white md:px-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <button
                            type="button"
                            onClick={() => router.push('/dashboard')}
                            className="rounded-full border border-white/10 bg-white/5 p-3 text-gray-300 transition hover:bg-white/10 hover:text-white"
                            aria-label="Back to dashboard"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Intelligence</p>
                            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Market signal and parsed lead stream</h1>
                            <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
                                This route is now backed by real broker-app data: watched WhatsApp stream on the left, IGR intelligence on the right.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadStream()}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10"
                    >
                        <RefreshCw className={`h-4 w-4 ${streamLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </header>

                <section className="grid gap-4 md:grid-cols-3">
                    <MetricCard label="Fresh items" value={String(streamSummary.total)} hint="Last 24 hours" icon={<Waves className="h-4 w-4" />} />
                    <MetricCard label="Sale signals" value={String(streamSummary.sale)} hint="Parsed for sale" icon={<Building2 className="h-4 w-4" />} />
                    <MetricCard label="Rental signals" value={String(streamSummary.rental)} hint="Monthly pricing" icon={<BarChart3 className="h-4 w-4" />} />
                </section>

                <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
                    <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
                        <div className="mb-5 flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Fresh Stream</p>
                                <h2 className="mt-2 text-xl font-semibold">Watched WhatsApp listings and requirements</h2>
                            </div>
                            <Badge variant="processing">{streamItems.length} items</Badge>
                        </div>

                        {streamError ? (
                            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{streamError}</div>
                        ) : null}

                        {streamLoading ? (
                            <div className="flex min-h-[280px] items-center justify-center text-gray-400">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Loading intelligence stream
                            </div>
                        ) : streamItems.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-gray-500">
                                No parsed items yet. Enable WhatsApp groups in privacy controls and let the stream ingest fresh messages.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {streamItems.map((item) => (
                                    <div key={item.source_message_id} className="rounded-2xl border border-white/10 bg-[#0a1014] p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Badge variant={item.price_type === 'monthly' ? 'cheap' : 'connected'}>
                                                        {item.listing_type || 'listing'}
                                                    </Badge>
                                                    {item.property_type ? <Badge variant="local">{item.property_type}</Badge> : null}
                                                </div>
                                                <h3 className="mt-3 text-base font-semibold text-white">{item.title || item.location || 'Untitled property'}</h3>
                                            </div>
                                            <span className="text-xs text-gray-500">{item.source_group_name || 'WhatsApp'}</span>
                                        </div>

                                        <p className="mt-3 text-sm leading-6 text-gray-300">{item.description || 'No description available.'}</p>

                                        <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-400">
                                            {item.location ? <span className="rounded-full bg-white/5 px-3 py-1">{item.location}</span> : null}
                                            {item.bhk != null ? <span className="rounded-full bg-white/5 px-3 py-1">{item.bhk} BHK</span> : null}
                                            {item.size_sqft != null ? <span className="rounded-full bg-white/5 px-3 py-1">{Math.round(item.size_sqft)} sqft</span> : null}
                                            {item.price != null ? <span className="rounded-full bg-white/5 px-3 py-1">{formatCurrency(item.price)}</span> : null}
                                        </div>

                                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                                            <span>{formatDate(item.message_timestamp || item.created_at)}</span>
                                            {item.primary_contact_wa ? (
                                                <a
                                                    href={item.primary_contact_wa}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-cyan-300 transition hover:text-cyan-200"
                                                >
                                                    Open contact
                                                </a>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="space-y-6">
                        <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
                            <div className="mb-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">IGR by building</p>
                                <h2 className="mt-2 text-xl font-semibold">Check a building transaction signal</h2>
                            </div>
                            <div className="flex gap-2">
                                <label className="relative flex-1">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                                    <input
                                        value={buildingName}
                                        onChange={(event) => setBuildingName(event.target.value)}
                                        onKeyDown={(event) => event.key === 'Enter' && void searchBuilding()}
                                        placeholder="DLH Signature"
                                        className="h-11 w-full rounded-xl border border-white/10 bg-[#0a1014] pl-10 pr-4 text-sm text-white outline-none placeholder:text-gray-500 focus:border-emerald-400/40"
                                    />
                                </label>
                                <button
                                    type="button"
                                    onClick={() => void searchBuilding()}
                                    disabled={buildingLoading || !buildingName.trim()}
                                    className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
                                >
                                    {buildingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                                </button>
                            </div>
                            {buildingError ? <p className="mt-3 text-sm text-red-300">{buildingError}</p> : null}
                            {buildingResult ? (
                                <div className="mt-4 rounded-2xl border border-white/10 bg-[#0a1014] p-4 text-sm text-gray-300">
                                    <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-gray-300">
                                        {JSON.stringify(buildingResult, null, 2)}
                                    </pre>
                                </div>
                            ) : null}
                        </div>

                        <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
                            <div className="mb-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">IGR by locality</p>
                                <h2 className="mt-2 text-xl font-semibold">Check six-month locality trend</h2>
                            </div>
                            <div className="flex gap-2">
                                <label className="relative flex-1">
                                    <MapPinned className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                                    <input
                                        value={localityName}
                                        onChange={(event) => setLocalityName(event.target.value)}
                                        onKeyDown={(event) => event.key === 'Enter' && void searchLocality()}
                                        placeholder="Bandra West"
                                        className="h-11 w-full rounded-xl border border-white/10 bg-[#0a1014] pl-10 pr-4 text-sm text-white outline-none placeholder:text-gray-500 focus:border-amber-400/40"
                                    />
                                </label>
                                <button
                                    type="button"
                                    onClick={() => void searchLocality()}
                                    disabled={localityLoading || !localityName.trim()}
                                    className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:opacity-60"
                                >
                                    {localityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                                </button>
                            </div>
                            {localityError ? <p className="mt-3 text-sm text-red-300">{localityError}</p> : null}
                            {localityResult ? (
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <InsightCard label="Locality" value={localityResult.locality || 'N/A'} />
                                    <InsightCard label="Transactions" value={String(localityResult.transaction_count || 0)} />
                                    <InsightCard label="Avg ₹/sqft" value={formatCurrency(localityResult.avg_price_per_sqft)} />
                                    <InsightCard label="Avg consideration" value={formatCurrency(localityResult.avg_consideration)} />
                                    <InsightCard label="Min ₹/sqft" value={formatCurrency(localityResult.min_price_per_sqft)} />
                                    <InsightCard label="Max ₹/sqft" value={formatCurrency(localityResult.max_price_per_sqft)} />
                                </div>
                            ) : null}
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}

function MetricCard({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: React.ReactNode }) {
    return (
        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
            <div className="flex items-center gap-2 text-cyan-300">
                {icon}
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{label}</span>
            </div>
            <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
            <p className="mt-1 text-xs text-gray-500">{hint}</p>
        </div>
    );
}

function InsightCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-[#0a1014] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</p>
            <p className="mt-2 text-sm font-medium text-white">{value}</p>
        </div>
    );
}
