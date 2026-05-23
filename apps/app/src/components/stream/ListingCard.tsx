import React from 'react';
import { MessageSquare, Clock, ExternalLink, ChevronUp, ChevronDown, Copy, Save, MapPin, Check, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { logWaClick, fetchWaClickListingLog, type WaClickListingLog } from '../../services/waClickAPI';
import { PROPAI_ASSISTANT_PHONE_DIGITS } from '../../lib/propai';
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

function buildWaMessage(listing: StreamItem): string {
    const parts: string[] = [];
    parts.push('Hi PropAI Assistant, I need help with:');
    if (listing.type) parts.push(`• Type: ${listing.type}`);
    if (listing.location) parts.push(`• Location: ${listing.location}`);
    if (listing.bhk) parts.push(`• ${listing.bhk}`);
    if (listing.areaSqft) parts.push(`• ${listing.areaSqft.toLocaleString('en-IN')} sqft`);
    if (listing.price) parts.push(`• Price: ${listing.price}`);
    if (listing.source) parts.push(`• Source: ${listing.source}`);
    parts.push('');
    parts.push('Can you assist me with this?');
    return parts.join('\n');
}

function formatCurrency(value?: number | null): string {
    if (value == null || !Number.isFinite(value)) {
        return 'N/A';
    }

    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1).replace(/\.0$/, '')} L`;
    return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function formatShortDate(value?: string | null): string {
    if (!value) return 'Unknown date';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
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
    const location = String(listing.location || '').trim();
    const cleanedBhk = String(listing.bhk || '').trim();
    const usableBhk = cleanedBhk && !/^n\/?a$/i.test(cleanedBhk) ? cleanedBhk : '';
    const category = listing.propertyCategory ? toTitleCase(String(listing.propertyCategory)) : '';
    const furnishing = inferFurnishing(listing.rawText || listing.description || '');
    const buildingName = String(listing.buildingName || '').trim();

    const purposeMap: Record<string, string> = {
        Rent: 'for Rent',
        Sale: 'for Sale',
        Requirement: 'Wanted',
        'Pre-leased': 'Pre-leased',
        Lease: 'for Lease',
    };
    const purpose = purposeMap[listing.type] || '';

    const skip = (v: string) => !v || /^n\/?a$/i.test(v);

    if (listing.type === 'Requirement') {
        const parts = [usableBhk, category, 'Wanted in', location].filter((v) => !skip(v));
        if (parts.length > 1) return parts.join(' ');
        const raw = listing.title || listing.location || '';
        if (raw) return raw.length > 80 ? raw.slice(0, 80) + '…' : raw;
        return 'Broker-sourced property';
    }

    const parts = [usableBhk, category, furnishing, purpose].filter((v) => !skip(v));

    const structuredParts = parts.filter((p) => p !== purpose);

    if (structuredParts.length === 0) {
        const raw = listing.title || listing.location || '';
        if (raw) return raw.length > 80 ? raw.slice(0, 80) + '…' : raw;
        return 'Broker-sourced property';
    }

    let title = parts.join(' ');

    const usableLocation = !skip(location) ? location : '';
    if (usableLocation) {
        title += ` — ${usableLocation}`;
    }

    if (!skip(buildingName) && usableLocation && buildingName.toLowerCase() !== usableLocation.toLowerCase()) {
        title += ` · ${buildingName}`;
    }

    return title.trim();
}

function buildDescription(listing: StreamItem): string {
    const parts: string[] = [];
    const dealType = listing.type === 'Requirement' ? 'Wanted' : listing.type === 'Rent' ? 'Available for rent' : 'Available for sale';
    parts.push(dealType);

    if (listing.bhk && !/^n\/?a$/i.test(String(listing.bhk))) parts.push(listing.bhk);
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
        listing.bhk && !/^n\/?a$/i.test(String(listing.bhk)) ? listing.bhk : null,
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
    const igrTransactions = Array.isArray(listing.igrTransactions) ? listing.igrTransactions.slice(0, 3) : [];

    const handleOpenWa = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isOpening) return;
        setIsOpening(true);
        setToast('Opening WhatsApp');

        const message = buildWaMessage(listing);
        const url = `https://wa.me/${PROPAI_ASSISTANT_PHONE_DIGITS}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank', 'noopener');

        setLocalClickCount((c) => c + 1);
        if (clickLog) {
            setClickLog({
                ...clickLog,
                total: clickLog.total + 1,
                events: [{ clicked_at: new Date().toISOString(), source: 'stream', device: 'web' }, ...clickLog.events],
            });
        }

        logWaClick(listing.id, 'stream', 'web').catch(() => {});

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

    const handleCardKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
        }
    }, [onToggle]);

    return (
        <div
            onClick={onToggle}
            onKeyDown={handleCardKeyDown}
            role="button"
            tabIndex={0}
            className={cn(
                'group relative rounded-[22px] bg-[var(--bg-surface)] p-4 transition-all duration-500 sm:rounded-[28px] sm:p-7 cursor-pointer',
                isExpanded
                    ? 'border border-[color:var(--accent-border)] shadow-[0_32px_64px_rgba(0,0,0,0.3)]'
                    : 'border border-white/[0.02] shadow-[0_8px_40px_rgba(0,0,0,0.15)] hover:-translate-y-2 hover:shadow-[0_32px_64px_rgba(0,0,0,0.3)] hover:bg-[var(--bg-hover)]'
            )}
        >
            {/* Background glow on hover */}
            <div className="absolute -top-32 -right-32 h-64 w-64 bg-[var(--accent)]/3 blur-[100px] rounded-full group-hover:bg-[var(--accent)]/8 transition-all duration-700 pointer-events-none" />

            <div className="relative z-10">
                {/* Top row: Type badge + time */}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
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
                        <h3 className="text-[17px] font-bold leading-[1.3] text-[var(--text-primary)] transition-colors duration-300 group-hover:text-[var(--accent)] sm:text-[20px]">
                            {displayTitle}
                        </h3>
                        <p className="mt-0.5 text-[12px] font-medium text-[var(--text-secondary)] sm:text-[13px]">
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
                        <p className="line-clamp-3 text-[13px] font-medium leading-relaxed text-[var(--text-secondary)] sm:text-[14px]">
                            {description}
                        </p>
                    </div>
                ) : null}

                {igrTransactions.length > 0 ? (
                    <div className="mb-4 rounded-[18px] border border-[rgba(255,255,255,0.04)] bg-[var(--bg-elevated)] p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">Recent registrations</p>
                                <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                                    Last {igrTransactions.length} IGR transaction{igrTransactions.length > 1 ? 's' : ''} for {listing.buildingName || listing.location}
                                </p>
                            </div>
                            <Zap className="h-4 w-4 text-[var(--accent)]" />
                        </div>

                        <div className="space-y-2">
                            {igrTransactions.map((transaction) => (
                                <div
                                    key={`${transaction.doc_number || 'txn'}-${transaction.reg_date || ''}`}
                                    className="rounded-[14px] border border-white/[0.03] bg-[var(--bg-surface)] px-3 py-3"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="text-[12px] font-semibold text-[var(--text-primary)]">
                                            {formatCurrency(transaction.consideration)}
                                        </div>
                                        <div className="text-[10px] text-[var(--text-secondary)]">
                                            {formatShortDate(transaction.reg_date)}
                                        </div>
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)]">
                                        <span>{transaction.price_per_sqft != null ? `₹${Math.round(transaction.price_per_sqft).toLocaleString('en-IN')}/sqft` : 'Rate N/A'}</span>
                                        <span>{transaction.area_sqft ? `${Math.round(transaction.area_sqft).toLocaleString('en-IN')} sqft` : 'Area N/A'}</span>
                                        {transaction.config ? <span>{transaction.config}</span> : null}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {/* Footer */}
                <div className="mt-6 flex flex-col gap-3 border-t border-white/[0.03] pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <div className="text-[22px] font-bold tracking-tight text-[var(--text-primary)] sm:text-[26px]">
                            {priceLabel || 'Price on request'}
                            {listing.type === 'Rent' && <span className="text-[14px] ml-1 text-[var(--text-muted)] font-medium">/mo</span>}
                        </div>
                        {rateLabel ? (
                            <div className="text-[11px] text-[var(--text-muted)]">{rateLabel}</div>
                        ) : localClickCount > 0 ? (
                            <div className="text-[11px] text-[var(--text-muted)]">{localClickCount} WA click{localClickCount !== 1 ? 's' : ''}</div>
                        ) : null}
                    </div>
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                        <button
                            onClick={handleOpenWa}
                            disabled={isOpening}
                            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-propai-green)] shadow-[0_12px_24px_rgba(62,232,138,0.2)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 sm:flex-none sm:px-5 sm:text-[12px] sm:tracking-[0.1em]"
                        >
                            <MessageSquare className="h-4 w-4" />
                            {isOpening ? 'Opening...' : 'Contact on WhatsApp'}
                        </button>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onToggle(); }}
                            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-all hover:text-white"
                        >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Expanded Section */}
            {isExpanded ? (
                <div className="mt-6 pt-5 border-t border-white/[0.03] relative z-10" onClick={(e) => e.stopPropagation()}>
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
                                        onClick={(e) => { e.stopPropagation(); setShowChannelPicker((v) => !v); }}
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
                                                            onClick={(e) => {
                                                                e.stopPropagation();
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
                                    onClick={(e) => {
                                        e.stopPropagation();
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
