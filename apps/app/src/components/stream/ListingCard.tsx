import React from 'react';
import { MessageSquare, Clock, ExternalLink, ChevronUp, ChevronDown, Copy, Save, MapPin, Check, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { logWaClick, fetchWaClickListingLog, type WaClickListingLog } from '../../services/waClickAPI';
import type { StreamItem } from '../../services/streamAPI';
import type { PersonalChannel } from '../../services/channelApi';

type ListingCardProps = {
    listing: StreamItem;
    networkMode?: boolean;
    isExpanded: boolean;
    onToggle: () => void;
    waClickCount?: number;
    channels?: PersonalChannel[];
    onSaveToChannel?: (channelId: string, streamItemId: string) => void;
};

function formatPriceDisplay(item: StreamItem): string {
    const numeric = item.priceNumeric;
    if (numeric == null || !Number.isFinite(numeric)) {
        return item.price || 'Unspecified';
    }

    if (item.type === 'Rent') {
        if (numeric >= 100000) return `₹${(numeric / 100000).toFixed(1).replace(/\.0$/, '')}L/mo`;
        if (numeric >= 1000) return `₹${Math.round(numeric / 1000)}K/mo`;
        return `₹${Math.round(numeric)}/mo`;
    }

    if (numeric >= 10000000) return `₹${(numeric / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
    if (numeric >= 100000) return `₹${(numeric / 100000).toFixed(1).replace(/\.0$/, '')} L`;
    if (numeric >= 1000) return `₹${Math.round(numeric / 1000)}K`;
    return `₹${Math.round(numeric).toLocaleString('en-IN')}`;
}

function formatPricePerSqft(item: StreamItem): string | null {
    if (item.type !== 'Sale' || !item.priceNumeric || !item.areaSqft || item.areaSqft <= 0) return null;
    const rate = Math.round(item.priceNumeric / item.areaSqft);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return `₹${rate.toLocaleString('en-IN')}/sqft`;
}

function formatTimeAgo(createdAt: string): string {
    const diff = Date.now() - new Date(createdAt).getTime();
    const mins = Math.max(0, Math.round(diff / 60000));
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}

function getTypeBadgeClass(type: string) {
    if (type === 'Rent') return 'bg-[var(--propai-green)]/10 text-[var(--propai-green)] border-[rgba(62,232,138,0.30)]';
    if (type === 'Sale') return 'bg-amber-500/10 text-amber-500 border-amber-400/30';
    if (type === 'Requirement') return 'bg-blue-500/10 text-blue-400 border-blue-400/30';
    return 'bg-blue-500/10 text-blue-400 border-blue-400/30';
}

function sanitizeVisibleText(text?: string | null): string {
    return String(text || '')
        .replace(/(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, '[WhatsApp hidden]')
        .replace(/\s+/g, ' ')
        .trim();
}

function toTitleCase(value: string): string {
    return value
        .split(/[\s_]+/)
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function inferFurnishing(text: string): string | null {
    const lower = text.toLowerCase();
    if (lower.includes('fully furnished')) return 'Fully furnished';
    if (lower.includes('semi furnished') || lower.includes('semi-furnished')) return 'Semi furnished';
    if (lower.includes('furnished')) return 'Furnished';
    if (lower.includes('unfurnished')) return 'Unfurnished';
    return null;
}

function inferFeatureChips(text: string): string[] {
    const lower = text.toLowerCase();
    const chips: string[] = [];
    if (lower.includes('balcony')) chips.push('Balcony');
    if (lower.includes('terrace')) chips.push('Terrace');
    if (lower.includes('brand new')) chips.push('Brand new');
    if (lower.includes('direct')) chips.push('Direct');
    if (lower.includes('parking')) chips.push('Parking');
    if (lower.includes('amenities')) chips.push('Amenities');
    if (lower.includes('pet') && lower.includes('not allowed')) chips.push('No pets');
    if (lower.includes('family only')) chips.push('Family only');
    return chips;
}

function buildDisplayTitle(listing: StreamItem): string {
    const explicit = String(listing.title || '').trim();
    if (explicit) return explicit;
    const parts = [
        listing.bhk || null,
        listing.propertyCategory ? toTitleCase(String(listing.propertyCategory)) : null,
        listing.location ? `in ${listing.location}` : null,
    ].filter(Boolean);
    return parts.join(' ') || listing.location || 'Broker-sourced property';
}

function buildDescription(listing: StreamItem): string {
    const parts: string[] = [];
    const dealType = listing.type === 'Requirement' ? 'Wanted' : listing.type === 'Rent' ? 'Available for rent' : 'Available for sale';
    parts.push(dealType);

    if (listing.bhk) parts.push(listing.bhk);
    if (listing.propertyCategory) parts.push(toTitleCase(String(listing.propertyCategory)));
    if (listing.location) parts.push(`in ${listing.location}`);

    const furnishing = inferFurnishing(listing.rawText || listing.description || '');
    if (furnishing) parts.push(`(${furnishing})`);

    if (listing.areaSqft) parts.push(`${listing.areaSqft.toLocaleString('en-IN')} sqft`);

    return parts.join(' ') || 'Property listing from broker broadcast';
}

function buildChips(listing: StreamItem): string[] {
    const raw = sanitizeVisibleText(listing.rawText || listing.description || '');
    const chips = [
        listing.bhk || null,
        listing.areaSqft ? `${listing.areaSqft.toLocaleString('en-IN')} sqft` : null,
        listing.propertyCategory ? toTitleCase(String(listing.propertyCategory)) : null,
        inferFurnishing(raw),
        ...inferFeatureChips(raw),
    ].filter(Boolean) as string[];
    return Array.from(new Set(chips)).slice(0, 6);
}

export const ListingCard: React.FC<ListingCardProps> = ({
    listing,
    networkMode = false,
    isExpanded,
    onToggle,
    waClickCount = 0,
    channels = [],
    onSaveToChannel,
}) => {
    const [clickLog, setClickLog] = React.useState<WaClickListingLog | null>(null);
    const [localClickCount, setLocalClickCount] = React.useState(waClickCount);
    const [isOpening, setIsOpening] = React.useState(false);
    const [toast, setToast] = React.useState<string | null>(null);
    const [showChannelPicker, setShowChannelPicker] = React.useState(false);
    const [savingChannelId, setSavingChannelId] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);

    const timeAgo = formatTimeAgo(listing.createdAt);
    const priceLabel = formatPriceDisplay(listing);
    const rateLabel = formatPricePerSqft(listing);
    const displayTitle = buildDisplayTitle(listing);
    const chips = buildChips(listing);
    const description = buildDescription(listing);
    const sourceLabel = networkMode && listing.isNetworkItem ? 'Shared network feed' : 'Private workspace feed';

    const handleOpenWa = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isOpening) return;
        setIsOpening(true);
        const result = await logWaClick(listing.id, 'stream', 'web');
        if (!result) {
            setToast('Failed to open WhatsApp');
            setIsOpening(false);
            return;
        }
        setLocalClickCount((c) => c + 1);
        setToast('Opening WhatsApp');
        if (clickLog) {
            setClickLog({
                ...clickLog,
                total: clickLog.total + 1,
                events: [{ clicked_at: new Date().toISOString(), source: 'stream', device: 'web' }, ...clickLog.events],
            });
        }
        window.open(result.redirect_url, '_blank', 'noopener');
        setIsOpening(false);
        window.setTimeout(() => setToast(null), 1800);
    };

    const loadClickLog = React.useCallback(async () => {
        const log = await fetchWaClickListingLog(listing.id);
        setClickLog(log);
        if (log.total > 0 && localClickCount === 0) {
            setLocalClickCount(log.total);
        }
    }, [listing.id, localClickCount]);

    React.useEffect(() => {
        if (isExpanded && !clickLog) {
            loadClickLog();
        }
    }, [isExpanded, clickLog, loadClickLog]);

    return (
        <div className={cn(
            'group rounded-[28px] bg-[var(--bg-surface)] p-7 transition-all duration-500',
            isExpanded
                ? 'border border-[color:var(--accent-border)] shadow-[0_32px_64px_rgba(0,0,0,0.3)]'
                : 'border border-white/[0.02] shadow-[0_8px_40px_rgba(0,0,0,0.15)] hover:-translate-y-2 hover:shadow-[0_32px_64px_rgba(0,0,0,0.3)] hover:bg-[var(--bg-hover)]'
        )}>
            {/* Background glow on hover */}
            <div className="absolute -top-32 -right-32 h-64 w-64 bg-[var(--accent)]/3 blur-[100px] rounded-full group-hover:bg-[var(--accent)]/8 transition-all duration-700 pointer-events-none" />

            <div className="relative z-10">
                {/* Top row: Type badge + time */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <span className={cn(
                            'inline-flex rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.1em] backdrop-blur-md',
                            getTypeBadgeClass(listing.type)
                        )}>
                            {listing.type}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                            <Clock className="h-3 w-3" />
                            {timeAgo}
                        </span>
                    </div>
                    {listing.confidence >= 0 ? (
                        <span className="text-[10px] font-mono text-[var(--text-muted)]">
                            {Math.round(listing.confidence)}% match
                        </span>
                    ) : null}
                </div>

                {/* Title + Location */}
                <div className="flex items-start gap-2 mb-3">
                    <MapPin className="mt-1 h-4 w-4 shrink-0 text-[var(--accent)]" />
                    <div className="min-w-0">
                        <h3 className="text-[20px] font-bold text-[var(--text-primary)] leading-[1.3] group-hover:text-[var(--accent)] transition-colors duration-300">
                            {displayTitle}
                        </h3>
                        <p className="text-[13px] text-[var(--text-secondary)] font-medium mt-0.5">
                            {listing.location || 'Mumbai market'} · {sourceLabel}
                        </p>
                    </div>
                </div>

                {/* Chips */}
                {chips.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mb-4">
                        {chips.map((chip) => (
                            <span key={chip} className="px-3 py-1.5 rounded-xl bg-[var(--bg-elevated)] text-[11px] font-bold text-[var(--text-secondary)] transition-colors group-hover:bg-[var(--bg-base)]">
                                {chip}
                            </span>
                        ))}
                    </div>
                ) : null}

                {/* Short Description */}
                {description ? (
                    <div className="mb-4">
                        <p className="text-[14px] leading-relaxed text-[var(--text-secondary)] line-clamp-3 font-medium">
                            {description}
                        </p>
                    </div>
                ) : null}

                {/* Footer */}
                <div className="mt-6 pt-5 border-t border-white/[0.03] flex items-center justify-between">
                    <div className="space-y-1">
                        <div className="text-[26px] font-bold text-[var(--text-primary)] tracking-tight">
                            {priceLabel}
                            {listing.type === 'Rent' && <span className="text-[14px] ml-1 text-[var(--text-muted)] font-medium">/mo</span>}
                        </div>
                        {rateLabel ? (
                            <div className="text-[11px] text-[var(--text-muted)]">{rateLabel}</div>
                        ) : localClickCount > 0 ? (
                            <div className="text-[11px] text-[var(--text-muted)]">{localClickCount} WA click{localClickCount !== 1 ? 's' : ''}</div>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleOpenWa}
                            disabled={isOpening}
                            className="flex items-center gap-2 h-11 px-5 rounded-2xl bg-[var(--accent)] text-[var(--on-propai-green)] text-[12px] font-bold uppercase tracking-[0.1em] hover:scale-[1.05] active:scale-[0.98] transition-all shadow-[0_12px_24px_rgba(62,232,138,0.2)] disabled:opacity-60"
                        >
                            <MessageSquare className="h-4 w-4" />
                            {isOpening ? 'Opening...' : 'Contact on WhatsApp'}
                        </button>
                        <button
                            type="button"
                            onClick={onToggle}
                            className="flex items-center justify-center h-11 w-11 rounded-2xl border border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-white transition-all"
                        >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Expanded Section */}
            {isExpanded ? (
                <div className="mt-6 pt-5 border-t border-white/[0.03] relative z-10">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                {[
                                    { label: 'Deal', value: listing.type },
                                    { label: 'Area', value: listing.areaSqft ? `${listing.areaSqft.toLocaleString('en-IN')} sqft` : 'Not parsed' },
                                    { label: 'Category', value: listing.propertyCategory ? toTitleCase(String(listing.propertyCategory)) : 'Not parsed' },
                                    { label: 'Source', value: sourceLabel },
                                ].map((item) => (
                                    <div key={item.label} className="rounded-[18px] bg-[var(--bg-elevated)] p-4 border border-white/[0.02]">
                                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-1">{item.label}</div>
                                        <div className="text-[14px] font-semibold text-[var(--text-primary)]">{item.value}</div>
                                    </div>
                                ))}
                            </div>

                        </div>

                        <div className="space-y-3">
                            <div className="rounded-[18px] bg-[var(--bg-elevated)] p-4 border border-white/[0.02]">
                                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-3">Post analytics</div>
                                <div className="text-[24px] font-bold text-[var(--text-primary)]">{localClickCount}</div>
                                <div className="text-[11px] text-[var(--text-secondary)]">WhatsApp opens</div>
                            </div>

                            <div className="rounded-[18px] bg-[var(--bg-elevated)] p-4 border border-white/[0.02]">
                                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-3">Recent click log</div>
                                <div className="max-h-28 space-y-1 overflow-y-auto">
                                    {clickLog === null ? (
                                        <div className="text-[11px] text-[var(--text-secondary)]">Loading...</div>
                                    ) : clickLog.events.length === 0 ? (
                                        <div className="text-[11px] text-[var(--text-secondary)]">No WhatsApp clicks yet</div>
                                    ) : (
                                        clickLog.events.map((ev, index) => (
                                            <div key={`${ev.clicked_at}-${index}`} className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
                                                <span>{new Date(ev.clicked_at).toLocaleString('en-IN')}</span>
                                                <span className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[10px]">{ev.source}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={handleOpenWa}
                                    disabled={isOpening}
                                    className="flex items-center gap-1.5 rounded-xl bg-[--propai-green] px-4 py-2 text-[11px] font-semibold text-[#0D1A12] hover:brightness-110 disabled:opacity-60"
                                >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    {isOpening ? 'Opening...' : 'Open WhatsApp'}
                                </button>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setShowChannelPicker((v) => !v)}
                                        className="flex items-center gap-1.5 rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-[11px] text-[var(--text-secondary)] hover:text-white"
                                    >
                                        <Save className="h-3.5 w-3.5" />
                                        Save to Channel
                                    </button>
                                    {showChannelPicker ? (
                                        <div className="absolute bottom-full left-0 z-50 mb-2 min-w-[200px] rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] p-2 shadow-2xl">
                                            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Pick a channel</p>
                                            {channels.length === 0 ? (
                                                <p className="px-2 py-2 text-[11px] text-[var(--text-secondary)]">No channels yet. Create one from the sidebar.</p>
                                            ) : (
                                                <div className="mt-1 max-h-48 space-y-1 overflow-y-auto">
                                                    {channels.map((channel) => (
                                                        <button
                                                            key={channel.id}
                                                            type="button"
                                                            disabled={savingChannelId === channel.id}
                                                            onClick={() => {
                                                                setSavingChannelId(channel.id);
                                                                onSaveToChannel?.(channel.id, listing.id);
                                                                setShowChannelPicker(false);
                                                            }}
                                                            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-white disabled:opacity-50"
                                                        >
                                                            <span className="truncate">{channel.name}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard.writeText(description).then(() => {
                                            setCopied(true);
                                            window.setTimeout(() => setCopied(false), 1600);
                                        }).catch(() => {});
                                    }}
                                    className="flex items-center gap-1.5 rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-[11px] text-[var(--text-secondary)] hover:text-white"
                                >
                                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                    {copied ? 'Copied' : 'Copy clean text'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {toast ? (
                <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-xs text-[var(--text-primary)] shadow-2xl">
                    {toast}
                </div>
            ) : null}
        </div>
    );
};
