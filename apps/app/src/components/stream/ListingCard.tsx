import React from 'react';
import { MessageSquare, MapPin, Clock, ExternalLink, ChevronDown, ChevronUp, Copy, Save } from 'lucide-react';
import { cn } from '../../lib/utils';
import { logWaClick, fetchWaClickListingLog, type WaClickListingLog } from '../../services/waClickAPI';
import type { StreamItem } from '../../services/streamAPI';

type ListingCardProps = {
    listing: StreamItem;
    isExpanded: boolean;
    onToggle: () => void;
    waClickCount?: number;
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
            return `₹${(numeric / 100000).toFixed(1).replace(/\.0$/, '')}L/mo`;
        }
        return `₹${Math.round(numeric / 1000)}K/mo`;
    }

    if (isSale) {
        if (numeric >= 10000000) {
            return `₹${(numeric / 10000000).toFixed(2).replace(/\.00$/, '')}Cr`;
        }
        if (numeric >= 100000) {
            return `₹${(numeric / 100000).toFixed(1).replace(/\.0$/, '')}L`;
        }
        return `₹${Math.round(numeric / 1000)}K`;
    }

    return item.price || 'Unspecified';
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
    return 'bg-blue-500/10 text-blue-400 border-blue-400/30';
}

export const ListingCard: React.FC<ListingCardProps> = ({ listing, isExpanded, onToggle, waClickCount = 0 }) => {
    const [clickLog, setClickLog] = React.useState<WaClickListingLog | null>(null);
    const [localClickCount, setLocalClickCount] = React.useState(waClickCount);
    const [isOpening, setIsOpening] = React.useState(false);
    const [toast, setToast] = React.useState<string | null>(null);
    const shortId = listing.id.replace(/-/g, '').slice(-8);

    const handleOpenWa = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isOpening) return;
        setIsOpening(true);

        const result = await logWaClick(listing.id, 'stream', 'web');
        if (!result) {
            setToast('Failed to open — try again');
            setIsOpening(false);
            return;
        }

        setLocalClickCount((c) => c + 1);
        setToast('Opening WhatsApp — click logged');

        if (clickLog) {
            setClickLog({
                ...clickLog,
                total: clickLog.total + 1,
                events: [{ clicked_at: new Date().toISOString(), source: 'stream', device: 'web' }, ...clickLog.events],
            });
        }

        window.open(result.redirect_url, '_blank', 'noopener');
        setIsOpening(false);
        setTimeout(() => setToast(null), 2000);
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

    const attributes = [listing.bhk, listing.areaSqft ? `${listing.areaSqft} sqft` : null, listing.description?.match(/furnish/i) ? 'Furnished' : null].filter(Boolean) as string[];

    const confidenceColor = getConfidenceColor(listing.confidence);
    const timeAgo = formatTimeAgo(listing.createdAt);
    const priceLabel = formatPriceDisplay(listing);

    return (
        <div className={cn('border border-white/[0.07] rounded-[10px] transition-colors', isExpanded ? 'border-[rgba(62,232,138,0.30)] bg-[#1C2620]' : 'bg-[#161D18]')}>
            <button type="button" onClick={onToggle} className="w-full p-4 text-left">
                <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1.5 shrink-0">
                        <span className={cn('inline-flex rounded px-2 py-0.5 text-[9px] font-semibold uppercase border', getTypeBadgeClass(listing.type))}>
                            {listing.type === 'Rent' ? 'RENT' : listing.type === 'Sale' ? 'SALE' : listing.type}
                        </span>
                        <span className="text-[9px] font-mono text-neutral-600">{shortId}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white text-sm leading-snug">{listing.location}</div>
                        {attributes.length > 0 && (
                            <div className="mt-0.5 text-[11px] text-neutral-400">{attributes.join(' · ')}</div>
                        )}
                        {listing.description && (
                            <div className="mt-1 text-[11px] text-neutral-500 line-clamp-1">{listing.description}</div>
                        )}
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="text-sm font-bold text-white">{priceLabel}</div>
                        {listing.bhk && <div className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-300">{listing.bhk}</div>}
                    </div>
                </div>

                <div className="mt-3 flex items-center gap-2 text-[10px] text-neutral-500">
                    <span className="text-neutral-400 font-medium">{listing.source}</span>
                    <span>·</span>
                    <Clock className="h-3 w-3" />
                    <span>{timeAgo}</span>
                    <div className="flex-1" />
                    <div className="flex items-center gap-1.5">
                        <div className="w-12 h-[3px] rounded-full bg-neutral-800 overflow-hidden">
                            <div className={cn('h-full rounded-full transition-all', confidenceColor)} style={{ width: `${Math.round(listing.confidence)}%` }} />
                        </div>
                        <span className={cn('text-[10px] font-medium', listing.confidence >= 70 ? 'text-[--propai-green]' : listing.confidence >= 40 ? 'text-amber-400' : 'text-red-400')}>
                            {Math.round(listing.confidence)}%
                        </span>
                    </div>
                    {localClickCount > 0 && (
                        <span className="rounded-full bg-[rgba(62,232,138,0.10)] text-[--propai-green] border border-[rgba(62,232,138,0.30)] px-1.5 py-0.5 text-[9px] font-medium">
                            {localClickCount}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={handleOpenWa}
                        disabled={isOpening}
                        className="rounded-lg bg-[--propai-green] px-2.5 py-1 text-[10px] font-semibold text-[#0D1A12] hover:brightness-110 disabled:opacity-60"
                    >
                        Open WA
                    </button>
                </div>
            </button>

            {isExpanded && (
                <div className="border-t border-white/[0.07] px-4 pb-4 pt-3 space-y-4">
                    <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                            <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Contact</div>
                            <div className="mt-0.5 text-white">{listing.brokerPhoneMasked || '••••• •••••'}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Added</div>
                            <div className="mt-0.5 text-white">{timeAgo}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Source</div>
                            <div className="mt-0.5 text-white truncate">{listing.source}</div>
                        </div>
                    </div>

                    {listing.description && (
                        <div>
                            <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Raw Message</div>
                            <div className="bg-[#0D1A12]/40 rounded-lg p-3 text-xs text-neutral-400 font-mono leading-relaxed whitespace-pre-wrap">
                                {listing.description}
                            </div>
                        </div>
                    )}

                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="text-[10px] text-neutral-500 uppercase tracking-wider">WA click log</div>
                            {clickLog && <span className="text-[10px] text-neutral-500">({clickLog.total})</span>}
                        </div>
                        <div className="max-h-24 overflow-y-auto space-y-1">
                            {clickLog === null ? (
                                <div className="text-[11px] text-neutral-600">Loading...</div>
                            ) : clickLog.events.length === 0 ? (
                                <div className="text-[11px] text-neutral-600">No clicks yet</div>
                            ) : (
                                clickLog.events.map((ev, i) => (
                                    <div key={i} className="flex items-center gap-2 text-[11px] text-neutral-400">
                                        <span>{new Date(ev.clicked_at).toLocaleTimeString()}</span>
                                        <span className="text-neutral-600">·</span>
                                        <span>{ev.device}</span>
                                        <span className="rounded bg-neutral-800 px-1 py-0.5 text-[9px] text-neutral-500">wa.me</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleOpenWa}
                            disabled={isOpening}
                            className="flex items-center gap-1.5 rounded-lg bg-[--propai-green] px-3 py-1.5 text-xs font-semibold text-[#0D1A12] hover:brightness-110 disabled:opacity-60"
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {isOpening ? 'Opening...' : 'Open WhatsApp'}
                        </button>
                        <button type="button" className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:text-white">
                            <Save className="h-3.5 w-3.5" />
                            Save to Channel
                        </button>
                        <button type="button" className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:text-white">
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                        </button>
                        <div className="flex-1" />
                        <button type="button" onClick={onToggle} className="text-neutral-500 hover:text-white">
                            <ChevronUp className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            {toast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-2 text-xs text-white shadow-2xl">
                    {toast}
                </div>
            )}
        </div>
    );
};
