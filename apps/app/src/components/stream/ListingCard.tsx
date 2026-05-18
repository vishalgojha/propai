import React from 'react';
import { MessageSquare, Clock, ExternalLink, ChevronUp, ChevronDown, Copy, Save, MapPin, Check } from 'lucide-react';
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

    const isRent = item.type === 'Rent';
    const isSale = item.type === 'Sale';

    if (isRent) {
        if (numeric >= 100000) {
            return `Rs ${(numeric / 100000).toFixed(1).replace(/\.0$/, '')}L/mo`;
        }
        return `Rs ${Math.round(numeric / 1000)}K/mo`;
    }

    if (isSale) {
        if (numeric >= 10000000) {
            return `Rs ${(numeric / 10000000).toFixed(2).replace(/\.00$/, '')}Cr`;
        }
        if (numeric >= 100000) {
            return `Rs ${(numeric / 100000).toFixed(1).replace(/\.0$/, '')}L`;
        }
        return `Rs ${Math.round(numeric / 1000)}K`;
    }

    return item.price || 'Unspecified';
}

function formatPricePerSqft(item: StreamItem): string | null {
    if (item.type !== 'Sale' || !item.priceNumeric || !item.areaSqft || item.areaSqft <= 0) {
        return null;
    }

    const rate = Math.round(item.priceNumeric / item.areaSqft);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return `Rs ${rate.toLocaleString('en-IN')}/sqft`;
}

function formatTimeAgo(createdAt: string): string {
    const diff = Date.now() - new Date(createdAt).getTime();
    const mins = Math.max(0, Math.round(diff / 60000));
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}

function getConfidenceColor(confidence: number) {
    if (confidence >= 70) return 'bg-[--propai-green]';
    if (confidence >= 40) return 'bg-amber-400';
    return 'bg-red-400';
}

function getTypeBadgeClass(type: string) {
    if (type === 'Rent') return 'bg-[rgba(62,232,138,0.10)] text-[--propai-green] border-[rgba(62,232,138,0.30)]';
    if (type === 'Sale') return 'bg-amber-500/10 text-amber-400 border-amber-400/30';
    if (type === 'Requirement') return 'bg-blue-500/10 text-blue-300 border-blue-400/30';
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
    if (lower.includes('all amenities') || lower.includes('amenities')) chips.push('Amenities');
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
    const shortId = listing.id.replace(/-/g, '').slice(-8);

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

    const confidenceColor = getConfidenceColor(listing.confidence);
    const timeAgo = formatTimeAgo(listing.createdAt);
    const priceLabel = formatPriceDisplay(listing);
    const rateLabel = formatPricePerSqft(listing);
    const displayTitle = buildDisplayTitle(listing);
    const chips = buildChips(listing);
    const visibleRaw = sanitizeVisibleText(listing.rawText || listing.description || '');
    const excerpt = visibleRaw.length > 180 ? `${visibleRaw.slice(0, 177)}...` : visibleRaw;
    const sourceLabel = networkMode && listing.isNetworkItem ? 'Shared network feed' : 'Private workspace feed';

    return (
        <div className={cn(
            'rounded-[16px] border transition-colors',
            isExpanded
                ? 'border-[color:var(--accent-border)] bg-[var(--bg-surface)]'
                : 'border-[color:var(--border)] bg-[var(--bg-surface)]'
        )}>
            <button type="button" onClick={onToggle} className="w-full p-4 text-left">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]', getTypeBadgeClass(listing.type))}>
                                {listing.type}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                                <Clock className="h-3 w-3" />
                                {timeAgo}
                            </span>
                            {localClickCount > 0 ? (
                                <span className="rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                                    {localClickCount} WA clicks
                                </span>
                            ) : null}
                            <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
                                {shortId}
                            </span>
                        </div>

                        <div className="mt-2 flex items-start gap-2">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                            <div className="min-w-0">
                                <div className="text-[17px] font-semibold leading-snug text-[var(--text-primary)]">{displayTitle}</div>
                                <div className="mt-1 text-[12px] text-[var(--text-secondary)]">{listing.location || 'Mumbai market'} · {sourceLabel}</div>
                            </div>
                        </div>

                        {chips.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {chips.map((chip) => (
                                    <span key={chip} className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
                                        {chip}
                                    </span>
                                ))}
                            </div>
                        ) : null}

                        {excerpt ? (
                            <div className="mt-3 line-clamp-2 text-[12px] leading-5 text-[var(--text-secondary)]">
                                {excerpt}
                            </div>
                        ) : null}
                    </div>

                    <div className="shrink-0 text-right">
                        <div className="text-[20px] font-bold leading-none text-[var(--text-primary)]">{priceLabel}</div>
                        <div className="mt-2 text-[11px] text-[var(--text-secondary)]">{rateLabel || `${Math.round(listing.confidence)}% confidence`}</div>
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={handleOpenWa}
                                disabled={isOpening}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-[--propai-green] px-3 py-2 text-[11px] font-semibold text-[#0D1A12] hover:brightness-110 disabled:opacity-60"
                            >
                                <MessageSquare className="h-3.5 w-3.5" />
                                {isOpening ? 'Opening...' : 'Contact on WhatsApp'}
                            </button>
                            <button type="button" onClick={onToggle} className="rounded-xl border border-[color:var(--border)] bg-[var(--bg-elevated)] p-2 text-[var(--text-secondary)] hover:text-white">
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                </div>
            </button>

            {isExpanded ? (
                <div className="border-t border-[color:var(--border)] px-4 pb-4 pt-3">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                {[
                                    { label: 'Deal', value: listing.type },
                                    { label: 'Area', value: listing.areaSqft ? `${listing.areaSqft.toLocaleString('en-IN')} sqft` : 'Not parsed' },
                                    { label: 'Category', value: listing.propertyCategory ? toTitleCase(String(listing.propertyCategory)) : 'Not parsed' },
                                    { label: 'Source', value: sourceLabel },
                                ].map((item) => (
                                    <div key={item.label} className="rounded-xl border border-[color:var(--border)] bg-[var(--bg-elevated)] p-3">
                                        <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">{item.label}</div>
                                        <div className="mt-1 text-[13px] text-[var(--text-primary)]">{item.value}</div>
                                    </div>
                                ))}
                            </div>

                            {visibleRaw ? (
                                <div>
                                    <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">Source message</div>
                                    <div className="rounded-xl border border-[color:var(--border)] bg-[var(--bg-elevated)] p-3 text-[12px] leading-6 text-[var(--text-primary)]">
                                        {visibleRaw}
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <div className="space-y-3">
                            <div className="rounded-xl border border-[color:var(--border)] bg-[var(--bg-elevated)] p-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">Post analytics</div>
                                        <div className="mt-1 text-[18px] font-semibold text-[var(--text-primary)]">{localClickCount}</div>
                                        <div className="text-[11px] text-[var(--text-secondary)]">WhatsApp opens recorded</div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="h-[4px] w-14 overflow-hidden rounded-full bg-[var(--bg-base)]">
                                            <div className={cn('h-full rounded-full transition-all', confidenceColor)} style={{ width: `${Math.round(listing.confidence)}%` }} />
                                        </div>
                                        <span className={cn('text-[11px] font-medium', listing.confidence >= 70 ? 'text-[--propai-green]' : listing.confidence >= 40 ? 'text-amber-400' : 'text-red-400')}>
                                            {Math.round(listing.confidence)}%
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-[color:var(--border)] bg-[var(--bg-elevated)] p-3">
                                <div className="mb-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">Recent click log</div>
                                <div className="max-h-28 space-y-1 overflow-y-auto">
                                    {clickLog === null ? (
                                        <div className="text-[11px] text-[var(--text-secondary)]">Loading...</div>
                                    ) : clickLog.events.length === 0 ? (
                                        <div className="text-[11px] text-[var(--text-secondary)]">No WhatsApp clicks yet</div>
                                    ) : (
                                        clickLog.events.map((ev, index) => (
                                            <div key={`${ev.clicked_at}-${index}`} className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
                                                <span>{new Date(ev.clicked_at).toLocaleString('en-IN')}</span>
                                                <span className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{ev.source}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleOpenWa}
                                    disabled={isOpening}
                                    className="flex items-center gap-1.5 rounded-lg bg-[--propai-green] px-3 py-1.5 text-xs font-semibold text-[#0D1A12] hover:brightness-110 disabled:opacity-60"
                                >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    {isOpening ? 'Opening...' : 'Open WhatsApp'}
                                </button>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setShowChannelPicker((v) => !v)}
                                        className="flex items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-white"
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
                                        const text = sanitizeVisibleText(listing.rawText || listing.description || displayTitle);
                                        navigator.clipboard.writeText(text).then(() => {
                                            setCopied(true);
                                            window.setTimeout(() => setCopied(false), 1600);
                                        }).catch(() => {});
                                    }}
                                    className="flex items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-white"
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
