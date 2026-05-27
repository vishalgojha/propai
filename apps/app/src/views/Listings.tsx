import React from 'react';
import {
  ArrowUpFromLine,
  ChevronDown,
  Filter,
  Loader2,
  Search,
  Sparkles,
  X,
  Copy,
  Download,
  Phone,
  Activity,
  Signal,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { formatPriceNumeric } from '../lib/formatPrice';
import { getStreamPriceLabel } from '../lib/streamPrice';
import { useAuth } from '../context/AuthContext';
import {
  fetchChannels,
  markChannelRead,
  attachStreamItemToChannel,
  type PersonalChannel,
} from '../services/channelApi';
import { handleApiError, default as backendApi } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { fetchStreamItems, fetchStreamStats, fetchStreamSummary, correctStreamItem, type StreamItem, type StreamSummaryResponse } from '../services/streamAPI';
import { rebuildStreamFromSavedMessages } from '../services/streamService';
import { fetchWaClickStats, exportWaClickCsv, type WaClickStats } from '../services/waClickAPI';

const formatChannelTitle = (name: string) => `#${name}`;
const PAGE_SIZE = 20;
const STREAM_FETCH_LIMIT = 500;
const ALL_TYPES = ['Rent', 'Sale', 'Requirement', 'Pre-leased', 'Lease'] as const;
const ALL_BHK = ['1 BHK', '2 BHK', '3 BHK', '4+ BHK'] as const;
const ALL_PROPERTY_CATEGORIES = ['residential', 'commercial'] as const;
const BROKER_TAG_PATTERN = /\b(broker|broking|agnt|agent)\b/i;
const ACTIVE_SESSION_STORAGE_KEY = 'propai.active_whatsapp_session';
type StreamPresetId = 'fresh' | 'rental' | 'sale' | 'pre_leased' | 'requirements' | 'high_confidence';
const STREAM_PRESETS: Array<{ id: StreamPresetId; label: string }> = [
  { id: 'fresh', label: '🔴 Fresh' },
  { id: 'rental', label: '🏠 Rental' },
  { id: 'sale', label: '💰 Sale' },
  { id: 'pre_leased', label: '🏢 Pre-Leased' },
  { id: 'requirements', label: '📋 Requirements' },
  { id: 'high_confidence', label: '⭐ High Confidence' },
];

const stripSnippetNoise = (raw: string) => {
  const lines = raw
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const lowered = line.toLowerCase();
      if (lowered.startsWith('forwarded')) return false;
      if (lowered.startsWith('>')) return false;
      if (lowered.startsWith('sent from')) return false;
      if (lowered.startsWith('from:')) return false;
      if (/^(regards|thanks|thank you|cheers|warm regards|kind regards|best)\b/i.test(lowered)) return false;
      return /[\p{L}\p{N}]/u.test(line);
    });

  return lines
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–—]+\s*/g, ' ')
    .trim();
};

const stripPriceNoise = (raw: string) =>
  raw
    .replace(/budget\s*--?/gi, '')
    .replace(/monthly rent\s*:/gi, '')
    .replace(/rent\s*:/gi, '')
    .replace(/price\s*:/gi, '')
    .replace(/asking price\s*:/gi, '')
    .replace(/\bnegotiable\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizePriceDisplay = (item: StreamItem) => {
  const negotiable = /negotiable/i.test(item.price || '');

  return {
    label: getStreamPriceLabel({
      ...item,
      price: stripPriceNoise(String(item.price || '')).trim(),
    }),
    negotiable,
  };
};

const buildSnippet = (item: StreamItem) => {
  const cleaned = stripSnippetNoise(String(item.rawText || item.description || ''));
  if (cleaned.length < 20) {
    return { label: 'low signal', isLowSignal: true };
  }

  return {
    label: cleaned.length > 120 ? `${cleaned.slice(0, 117)}...` : cleaned,
    isLowSignal: false,
  };
};

const parseRecencyMinutes = (value?: string | null) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;

  const minutes = text.match(/(\d+(?:\.\d+)?)\s*m/);
  if (minutes) return Number(minutes[1]);

  const hours = text.match(/(\d+(?:\.\d+)?)\s*h/);
  if (hours) return Number(hours[1]) * 60;

  const days = text.match(/(\d+(?:\.\d+)?)\s*d/);
  if (days) return Number(days[1]) * 24 * 60;

  return null;
};

const getFreshnessMeta = (item: StreamItem) => {
  const createdAt = item.createdAt ? new Date(item.createdAt) : null;
  const createdAtValid = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null;
  const minutes = createdAtValid
    ? Math.max(0, Math.round((Date.now() - createdAtValid.getTime()) / 60000))
    : parseRecencyMinutes(item.posted);

  if (minutes == null) {
    return {
      tone: 'bg-[var(--text-secondary)]',
      label: item.posted,
    } as const;
  }

  if (minutes < 60) {
    return {
      tone: 'bg-[var(--accent)]',
      label: item.posted,
    } as const;
  }

  if (minutes <= 6 * 60) {
    return {
      tone: 'bg-[var(--amber)]',
      label: item.posted,
    } as const;
  }

  return {
    tone: 'bg-[var(--red)]',
    label: item.posted,
  } as const;
};

const formatLayoutValue = (value?: string | null) => {
  const trimmed = String(value || '').trim();
  if (!trimmed || /^n\/?a$/i.test(trimmed) || /^unknown$/i.test(trimmed)) {
    return '';
  }

  const normalized = trimmed
    .replace(/^(\d+)\s*bhk$/i, '$1 BHK')
    .replace(/^(\d+(?:\.\d+)?)\s*bedroom$/i, '$1 bedroom')
    .replace(/\bbhk\b/gi, 'BHK');

  return normalized;
};

const toggleSelection = <T,>(current: T[], value: T) => (
  current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
);

const normalizeSearchText = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isConfidenceInBand = (confidence: number, band: 'low' | 'medium' | 'high') => {
  if (band === 'high') return confidence >= 70;
  if (band === 'medium') return confidence >= 40 && confidence < 70;
  return confidence < 40;
};

const getConfidenceBand = (confidence: number): 'high' | 'medium' | 'low' => {
  if (confidence >= 70) return 'high';
  if (confidence >= 40) return 'medium';
  return 'low';
};
const formatLayoutLabel = (value: string) => {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+)(\+)?\s*bhk$/i);

  if (match) {
    const [, count, plus] = match;
    return `${count}${plus ? '+' : ''} bedroom`;
  }

  return trimmed
    .replace(/(\d)(bedroom)/gi, '$1 bedroom')
    .replace(/\bbhk\b/gi, 'bedroom');
};

const redactPhoneNumbers = (value?: string | null) =>
  String(value || '')
    .replace(/(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, '[hidden]')
    .trim();

const stripHiddenLines = (value: string) =>
  value
    .split('\n')
    .filter((line) => !line.includes('[hidden]'))
    .join('\n')
    .trim();

const formatPostedCell = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';

  const now = new Date();
  const isToday =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate();

  return isToday
    ? parsed.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    : parsed.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const formatAreaCell = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value).toLocaleString('en-IN')} sqft` : '—';

const formatFurnishingCell = (value?: string | null) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '—';
  if (text.includes('fully')) return 'Fully';
  if (text.includes('semi')) return 'Semi';
  if (text.includes('unfurnished')) return 'Unfurn';
  if (text.includes('furnished')) return 'Fully';
  return '—';
};

const formatFloorCell = (item: StreamItem) => {
  const floorNumber = String(item.floorNumber || '').trim();
  const totalFloors = String(item.totalFloors || '').trim();
  if (floorNumber && totalFloors) return `${floorNumber}/${totalFloors}`;
  if (floorNumber) return floorNumber;
  if (totalFloors) return `/${totalFloors}`;
  return '—';
};

const getRecordLabel = (item: StreamItem) =>
  item.type === 'Requirement' || String(item.recordType || '').trim().toLowerCase() === 'requirement'
    ? 'REQUIREMENT'
    : 'LISTING';

const getTypeLabel = (item: StreamItem) => {
  const direct = String(item.type || '').trim();
  if (direct && direct !== 'Requirement') return direct.toUpperCase();

  const dealType = String(item.dealType || '').trim().toLowerCase();
  if (dealType === 'rent') return 'RENT';
  if (dealType === 'sale') return 'SALE';
  if (dealType === 'pre-leased' || dealType === 'pre leased') return 'PRE-LEASED';
  if (dealType === 'lease') return 'LEASE';
  return '—';
};

const getDealBadgeClass = (label: string) => {
  if (label === 'RENT' || label === 'LEASE') {
    return 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]';
  }
  if (label === 'SALE') {
    return 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--amber)]';
  }
  if (label === 'PRE-LEASED') {
    return 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-sky-300';
  }
  return 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]';
};

const getRecordBadgeClass = (label: string) =>
  label === 'REQUIREMENT'
    ? 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-sky-300'
    : 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]';

const formatIgrCompact = (transaction: StreamItem['igrTransactions'][number]) => {
  const price = transaction?.consideration != null && Number.isFinite(transaction.consideration)
    ? formatPriceNumeric(transaction.consideration)
    : 'Price N/A';
  const date = transaction?.reg_date
    ? new Date(transaction.reg_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : 'Date N/A';
  const rate = transaction?.price_per_sqft != null && Number.isFinite(transaction.price_per_sqft)
    ? `₹${Math.round(transaction.price_per_sqft).toLocaleString('en-IN')}/sqft`
    : 'Rate N/A';
  return `${price} · ${date} · ${rate}`;
};

const buildCopyText = (item: StreamItem) => {
  const lines = [
    getRecordLabel(item),
    getTypeLabel(item),
    item.location || '—',
    item.bhk || '—',
    normalizePriceDisplay(item).label || 'Price on request',
    redactPhoneNumbers(item.rawText || item.description || ''),
  ].filter(Boolean);
  return lines.join('\n');
};

type StreamLocalityGroup = {
  locality: string;
  items: StreamItem[];
  listingCount: number;
  requirementCount: number;
  latestTimestamp: number;
};

const isBrokerTagged = (item: StreamItem) =>
  BROKER_TAG_PATTERN.test([item.source, item.description].filter(Boolean).join(' '));

type StreamCorrectionDraft = {
  type: string;
  location: string;
  city: string;
  price: string;
  bhk: string;
  source: string;
  recordType: string;
  dealType: string;
  assetClass: string;
  confidence: number;
  parseNotes: string;
};

const buildCorrectionDraft = (item: StreamItem): StreamCorrectionDraft => ({
  type: item.type,
  location: item.location,
  city: item.city || '',
  price: item.price,
  bhk: item.bhk,
  source: item.source,
  recordType: item.recordType || '',
  dealType: item.dealType || '',
  assetClass: item.assetClass || '',
  confidence: item.confidence,
  parseNotes: item.parseNotes || '',
});

const canViewStreamPlan = (plan?: string | null) => {
  const normalized = String(plan || '').trim().toLowerCase();
  return normalized === 'starter' || normalized === 'pro';
};

export const Listings: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const channelId = searchParams.get('channel');
  const [selectedSessionLabel, setSelectedSessionLabel] = React.useState<string | null>(() => {
    try {
      return window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [channels, setChannels] = React.useState<PersonalChannel[]>([]);
  const [search, setSearch] = React.useState('');
  const [expandedListingId, setExpandedListingId] = React.useState<string | null>(null);
  const [editingListingId, setEditingListingId] = React.useState<string | null>(null);
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const [streamItems, setStreamItems] = React.useState<StreamItem[]>([]);
  const [streamTotal, setStreamTotal] = React.useState(0);
  const [streamNetworkMode, setStreamNetworkMode] = React.useState(false);
  const [streamSummary, setStreamSummary] = React.useState<StreamSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [infoMessage, setInfoMessage] = React.useState<string | null>(null);
  const [showFilters, setShowFilters] = React.useState(false);
  const [filterBhk, setFilterBhk] = React.useState<string>('all');
  const [filterSource, setFilterSource] = React.useState<string>('all');
  const [brokerOnly, setBrokerOnly] = React.useState(false);
  const [quickTypes, setQuickTypes] = React.useState<Array<StreamItem['type']>>([]);
  const [quickConfidenceBands, setQuickConfidenceBands] = React.useState<Array<'low' | 'medium' | 'high'>>([]);
  const [quickFreshnessBands, setQuickFreshnessBands] = React.useState<Array<'1h' | '6h'>>([]);
  const [filterPropertyCategory, setFilterPropertyCategory] = React.useState<string>('all');
  const [openActionMenuId, setOpenActionMenuId] = React.useState<string | null>(null);
  const [savingChannelItemId, setSavingChannelItemId] = React.useState<string | null>(null);
  const [isSavingCorrection, setIsSavingCorrection] = React.useState(false);
  const [correctionDraft, setCorrectionDraft] = React.useState<StreamCorrectionDraft | null>(null);
  const [waClickStats, setWaClickStats] = React.useState<WaClickStats | null>(null);
  const [quickTimeBands, setQuickTimeBands] = React.useState<Array<'1h' | '4h' | '1d' | '7d'>>([]);
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  const attemptedBackfillScopesRef = React.useRef<Set<string>>(new Set());
  const [showScrollTop, setShowScrollTop] = React.useState(false);
  const [waStatus, setWaStatus] = React.useState<string>('loading');

  const serverFilters = React.useMemo(() => ({
    search: search.trim() || undefined,
    type: quickTypes,
    category: filterPropertyCategory === 'all' ? undefined : filterPropertyCategory as 'residential' | 'commercial',
    bhk: filterBhk === 'all' ? undefined : filterBhk,
    confidenceBand: quickConfidenceBands,
    timeBand: quickTimeBands,
    freshnessBand: quickFreshnessBands,
    source: filterSource,
    brokerOnly,
  }), [brokerOnly, filterBhk, filterPropertyCategory, filterSource, quickConfidenceBands, quickFreshnessBands, quickTimeBands, quickTypes, search]);
  const canViewStream = React.useMemo(
    () => canViewStreamPlan(user?.subscription?.plan),
    [user?.subscription?.plan],
  );

  const loadData = React.useCallback(async () => {
    if (!canViewStream) {
      setIsLoading(false);
      setError(null);
      setInfoMessage(null);
      setChannels([]);
      setStreamItems([]);
      setStreamNetworkMode(false);
      setStreamSummary(null);
      setStreamTotal(0);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const targetSessionLabel = selectedSessionLabel && selectedSessionLabel !== 'all' ? selectedSessionLabel : undefined;
      const [channelRecords, initialStreamResponse] = await Promise.all([
        fetchChannels(),
        fetchStreamItems({
          channelId: channelId || undefined,
          sessionLabel: targetSessionLabel,
          ...serverFilters,
          limit: STREAM_FETCH_LIMIT,
        }),
      ]);

      let streamResponse = initialStreamResponse;
      const backfillScopeKey = channelId ? null : (targetSessionLabel || 'all');
      if (backfillScopeKey && streamResponse.items.length === 0 && !attemptedBackfillScopesRef.current.has(backfillScopeKey)) {
        attemptedBackfillScopesRef.current.add(backfillScopeKey);
        setInfoMessage('Hydrating Stream from saved WhatsApp history for this number...');
        void rebuildStreamFromSavedMessages(targetSessionLabel ? 2000 : 500, targetSessionLabel || null)
          .then((backfillResult) => {
            if (!backfillResult?.scanned) {
              return;
            }
            setInfoMessage(`Stream hydration started. Scanned ${backfillResult.scanned} saved messages for this WhatsApp session.`);
            window.setTimeout(() => {
              void loadData();
            }, 2500);
          })
          .catch(() => {
            setInfoMessage(null);
          });
      }

      const items = streamResponse.items || [];
      setChannels(channelRecords);
      setStreamItems(items);
      setStreamNetworkMode(Boolean(streamResponse.network_mode));
      setStreamTotal(streamResponse.total || items.length);

      void Promise.allSettled([
        fetchStreamStats(),
        fetchStreamSummary({
          channelId: channelId || undefined,
          sessionLabel: targetSessionLabel,
        }),
      ])
        .then(([statsResult, summaryResult]) => {
          const stats = statsResult.status === 'fulfilled' ? statsResult.value : null;
          const summary = summaryResult.status === 'fulfilled' ? summaryResult.value : null;
          const nextTotal = summary?.allTime ?? stats?.total ?? streamResponse.total ?? items.length;
          setStreamTotal(nextTotal);
          setStreamSummary(summary);
          setStreamNetworkMode(Boolean(summary?.network_mode ?? streamResponse.network_mode));
        })
        .catch(() => {
          setStreamTotal(streamResponse.total || items.length);
          setStreamSummary(null);
        });

      if (channelId) {
        await markChannelRead(channelId);
        window.dispatchEvent(new Event('channels:refresh'));
      }
    } catch (err) {
      setError(handleApiError(err));
      setStreamItems([]);
      setStreamTotal(0);
      setStreamNetworkMode(false);
      setStreamSummary(null);
      setChannels([]);
    } finally {
      setIsLoading(false);
    }
  }, [canViewStream, channelId, selectedSessionLabel, serverFilters]);

  React.useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!mounted) return;
      await loadData();
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [loadData]);

  React.useEffect(() => {
     let active = true;
     let cleanup: (() => void) | undefined;

     if (!user?.token || channelId || !canViewStream) {
       return;
     }

     const setupRealtime = async () => {
       const { createSupabaseBrowserClient, isSupabaseBrowserConfigured } = await import('../services/supabaseBrowser');
       if (!active) {
         return;
       }

       if (!isSupabaseBrowserConfigured) {
         return;
       }

       const supabaseClient = createSupabaseBrowserClient(user.token);

       // Stream items: reload on new insertions
       const streamChannel = supabaseClient
         .channel(`global-stream:${selectedSessionLabel || 'all'}`)
         .on(
           'postgres_changes',
           {
             event: 'INSERT',
             schema: 'public',
             table: 'stream_items',
           },
           () => {
             void loadData();
           }
         )
         .subscribe();

       // Broker channels: reload when new channels are added or updated
       const channelsChannel = supabaseClient
         .channel(`broker-channels:${user?.id}`)
         .on(
           'postgres_changes',
           {
             event: 'INSERT',
             schema: 'public',
             table: 'broker_channels',
             filter: `tenant_id=eq.${user?.id}`,
           },
           () => {
             void loadData();
           }
         )
         .subscribe();

       // Channel items: reload when items are routed to channels
       const channelItemsChannel = supabaseClient
         .channel(`channel-items:${user?.id}`)
         .on(
           'postgres_changes',
           {
             event: 'INSERT',
             schema: 'public',
             table: 'channel_items',
             filter: `tenant_id=eq.${user?.id}`,
           },
           () => {
             void loadData();
           }
         )
         .subscribe();

       cleanup = () => {
         void supabaseClient.removeChannel(streamChannel);
         void supabaseClient.removeChannel(channelsChannel);
         void supabaseClient.removeChannel(channelItemsChannel);
       };
     };

     void setupRealtime();

     return () => {
       active = false;
       cleanup?.();
     };
   }, [canViewStream, channelId, loadData, selectedSessionLabel, user?.token]);

  React.useEffect(() => {
    const handleSelectedSession = (event: Event) => {
      const detail = (event as CustomEvent<{ label?: string | null }>).detail;
      setSelectedSessionLabel(detail?.label || null);
    };

    window.addEventListener('whatsapp:selected-session', handleSelectedSession as EventListener);
    return () => {
      window.removeEventListener('whatsapp:selected-session', handleSelectedSession as EventListener);
    };
  }, []);

  const handleRebuildStream = async () => {
    setInfoMessage(null);
    setError(null);
    try {
      const targetSessionLabel = selectedSessionLabel && selectedSessionLabel !== 'all' ? selectedSessionLabel : null;
      const result = await rebuildStreamFromSavedMessages(targetSessionLabel ? 2000 : 500, targetSessionLabel);
      setInfoMessage(`Rebuild complete. Scanned ${result.scanned} saved messages and mapped ${result.ingested} into Stream. Total stream items: ${result.totalStreamItems}.`);
      await loadData();
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  const handleAttachStreamItemToChannel = React.useCallback(
    async (channelIdToAttach: string, streamItemId: string) => {
      setSavingChannelItemId(streamItemId);
      setError(null);
      try {
        await attachStreamItemToChannel(channelIdToAttach, streamItemId);
        setInfoMessage('Listing saved to channel.');
        setOpenActionMenuId(null);
        await loadData();
      } catch (err) {
        setError(handleApiError(err));
      } finally {
        setSavingChannelItemId((current) => (current === streamItemId ? null : current));
      }
    },
    [loadData],
  );

  const activeChannel = React.useMemo(
    () => channels.find((channel) => channel.id === channelId) || null,
    [channels, channelId],
  );

  if (!canViewStream) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
        <div className="rounded-[16px] border border-[color:var(--amber)] bg-[linear-gradient(180deg,rgba(66,47,9,0.28),rgba(12,16,24,0.92))] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--amber)]">Stream locked</p>
          <h2 className="mt-2 text-[24px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">Upgrade to view the feed</h2>
          <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
            Free and trial accounts can use the workspace, but the live stream, summaries, and parsed inventory feed are restricted to Starter and Pro plans.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/pricing')}
              className="inline-flex items-center gap-2 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent)] px-5 py-3 text-[12px] font-bold uppercase tracking-[0.06em] text-[#020f07]"
            >
              Upgrade plan
            </button>
            <button
              type="button"
              onClick={() => navigate('/vault')}
              className="inline-flex items-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-5 py-3 text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--text-primary)]"
            >
              Open Vault
            </button>
          </div>
        </div>
      </div>
    );
  }

  const uniqueSources = React.useMemo(() => {
    const sources = new Set<string>();
    streamItems.forEach((item) => sources.add(item.source));
    return Array.from(sources).sort();
  }, [streamItems]);

  const visibleStream = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    let filtered = streamItems;

    if (query) {
      const queryTokens = normalizeSearchText(query).split(' ').filter(Boolean);
      filtered = filtered.filter((listing) => {
        const haystack = [
          listing.id,
          listing.type,
          listing.title,
          listing.location,
          listing.price,
          listing.bhk,
          listing.posted,
          listing.source,
          listing.brokerName || '',
          listing.brokerCompany || '',
          listing.description,
          listing.rawText || '',
        ].join(' ');
        const normalizedHaystack = normalizeSearchText(haystack);
        return queryTokens.every((token) => normalizedHaystack.includes(token));
      });
    }

    if (quickTypes.length > 0) {
      filtered = filtered.filter((item) => quickTypes.includes(item.type));
    }

    if (filterBhk !== 'all') {
      if (filterBhk === '4+ BHK') {
        filtered = filtered.filter((item) => /4\+?\s*bhk/i.test(item.bhk));
      } else {
        filtered = filtered.filter((item) => item.bhk.toLowerCase().includes(filterBhk.toLowerCase().replace(' bhk', '')));
      }
    }

    if (quickConfidenceBands.length > 0) {
      filtered = filtered.filter((item) => quickConfidenceBands.some((band) => isConfidenceInBand(item.confidence, band)));
    }

    if (quickFreshnessBands.length > 0) {
      filtered = filtered.filter((item) => {
        const minutes = parseRecencyMinutes(item.posted);
        const createdAt = item.createdAt ? new Date(item.createdAt) : null;
        const createdMinutes = createdAt && !Number.isNaN(createdAt.getTime())
          ? Math.max(0, Math.round((Date.now() - createdAt.getTime()) / 60000))
          : minutes;

        if (createdMinutes == null) {
          return false;
        }

        return quickFreshnessBands.some((band) => {
          if (band === '1h') return createdMinutes < 60;
          return createdMinutes >= 60 && createdMinutes <= 6 * 60;
        });
      });
    }

    if (quickTimeBands.length > 0) {
      filtered = filtered.filter((item) => {
        const createdAt = item.createdAt ? new Date(item.createdAt) : null;
        const minutes = createdAt && !Number.isNaN(createdAt.getTime())
          ? Math.max(0, Math.round((Date.now() - createdAt.getTime()) / 60000))
          : parseRecencyMinutes(item.posted);

        if (minutes == null) return false;
        return quickTimeBands.some((band) => {
          if (band === '1h') return minutes < 60;
          if (band === '4h') return minutes < 240;
          if (band === '1d') return minutes < 1440;
          return minutes < 10080;
        });
      });
    }

    if (filterSource !== 'all') {
      filtered = filtered.filter((item) => item.source === filterSource);
    }

if (brokerOnly) {
        filtered = filtered.filter(isBrokerTagged);
      }

      if (filterPropertyCategory !== 'all') {
        filtered = filtered.filter((item) => (item.propertyCategory || 'residential') === filterPropertyCategory);
      }

      return filtered;
    }, [streamItems, search, quickTypes, filterBhk, quickConfidenceBands, quickFreshnessBands, quickTimeBands, filterSource, brokerOnly, filterPropertyCategory]);

  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (quickTypes.length > 0) count++;
    if (quickTimeBands.length > 0) count++;
    if (filterBhk !== 'all') count++;
    if (quickConfidenceBands.length > 0) count++;
    if (quickFreshnessBands.length > 0) count++;
    if (filterSource !== 'all') count++;
    if (brokerOnly) count++;
    if (filterPropertyCategory !== 'all') count++;
    return count;
  }, [quickTypes, quickTimeBands, filterBhk, quickConfidenceBands, quickFreshnessBands, filterSource, brokerOnly, filterPropertyCategory]);

  const clearAllFilters = () => {
    setQuickTypes([]);
    setQuickTimeBands([]);
    setQuickConfidenceBands([]);
    setQuickFreshnessBands([]);
    setFilterBhk('all');
    setFilterSource('all');
    setBrokerOnly(false);
    setFilterPropertyCategory('all');
  };

  const applyPreset = (preset: StreamPresetId) => {
    if (preset === 'fresh') {
      setQuickTimeBands((current) => current.includes('1h') ? current.filter((band) => band !== '1h') : ['1h']);
      return;
    }

    if (preset === 'rental') {
      setQuickTypes((current) => toggleSelection(current, 'Rent'));
      return;
    }

    if (preset === 'sale') {
      setQuickTypes((current) => toggleSelection(current, 'Sale'));
      return;
    }

    if (preset === 'pre_leased') {
      setQuickTypes((current) => toggleSelection(current, 'Pre-leased'));
      setFilterPropertyCategory('commercial');
      return;
    }

    if (preset === 'requirements') {
      setQuickTypes((current) => toggleSelection(current, 'Requirement'));
      return;
    }

    setQuickConfidenceBands((current) => toggleSelection(current, 'high'));
  };

  const isPresetActive = (preset: StreamPresetId) => {
    if (preset === 'fresh') return quickTimeBands.includes('1h');
    if (preset === 'rental') return quickTypes.includes('Rent');
    if (preset === 'sale') return quickTypes.includes('Sale');
    if (preset === 'pre_leased') return quickTypes.includes('Pre-leased');
    if (preset === 'requirements') return quickTypes.includes('Requirement');
    return quickConfidenceBands.includes('high');
  };

  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeChannel?.id, search, quickTypes, filterBhk, quickConfidenceBands, quickFreshnessBands, quickTimeBands, filterSource, brokerOnly, filterPropertyCategory]);

  React.useEffect(() => {
    const fetch = async () => {
      const stats = await fetchWaClickStats();
      setWaClickStats(stats);
    };
    void fetch();
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    const fetch = async () => {
      try {
        const resp = await backendApi.get(ENDPOINTS.whatsapp.status);
        setWaStatus(resp.data?.status || 'disconnected');
      } catch {
        // Preserve the last known badge state if the status request fails briefly.
      }
    };
    void fetch();
    const interval = setInterval(fetch, 15000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const root = document.getElementById('main-scroll-container');
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleCount((current) => Math.min(current + PAGE_SIZE, visibleStream.length));
      },
      {
        root,
        rootMargin: '240px',
        threshold: 0,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleStream.length]);

  const renderedStream = React.useMemo(
    () => visibleStream.slice(0, visibleCount),
    [visibleStream, visibleCount],
  );
  const renderedGroups = React.useMemo<StreamLocalityGroup[]>(() => {
    const groups = new Map<string, StreamLocalityGroup>();

    for (const item of renderedStream) {
      const locality = String(item.location || '').trim();
      if (!locality) continue;

      const timestamp = item.createdAt ? new Date(item.createdAt).getTime() : 0;
      const existing = groups.get(locality);
      if (existing) {
        existing.items.push(item);
        existing.latestTimestamp = Math.max(existing.latestTimestamp, timestamp);
        if (getRecordLabel(item) === 'REQUIREMENT') {
          existing.requirementCount += 1;
        } else {
          existing.listingCount += 1;
        }
      } else {
        groups.set(locality, {
          locality,
          items: [item],
          listingCount: getRecordLabel(item) === 'REQUIREMENT' ? 0 : 1,
          requirementCount: getRecordLabel(item) === 'REQUIREMENT' ? 1 : 0,
          latestTimestamp: timestamp,
        });
      }
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: [...group.items].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
      }))
      .sort((left, right) => right.latestTimestamp - left.latestTimestamp);
  }, [renderedStream]);
  const hasMore = visibleCount < visibleStream.length;
  const computeMinutes = React.useCallback((item: StreamItem): number | null => {
    const createdAt = item.createdAt ? new Date(item.createdAt) : null;
    if (createdAt && !Number.isNaN(createdAt.getTime())) {
      return Math.max(0, Math.round((Date.now() - createdAt.getTime()) / 60000));
    }
    return parseRecencyMinutes(item.posted);
  }, []);

  const summaryCards = React.useMemo(() => {
    const server = streamSummary;
    const summary = {
      oneHour: server?.oneHour ?? visibleStream.filter((item) => {
        const minutes = computeMinutes(item);
        return minutes != null && minutes < 60;
      }).length,
      fourHours: server?.fourHours ?? visibleStream.filter((item) => {
        const minutes = computeMinutes(item);
        return minutes != null && minutes < 240;
      }).length,
      oneDay: server?.oneDay ?? visibleStream.filter((item) => {
        const minutes = computeMinutes(item);
        return minutes != null && minutes < 1440;
      }).length,
      sevenDays: server?.sevenDays ?? visibleStream.filter((item) => {
        const minutes = computeMinutes(item);
        return minutes != null && minutes < 10080;
      }).length,
      allTime: server?.allTime ?? visibleStream.length,
      network_mode: streamNetworkMode,
    };
    const scopeLabel = activeChannel
      ? `${formatChannelTitle(activeChannel.name)} parsed feed`
      : streamNetworkMode
        ? 'Shared parsed feed'
        : 'Workspace parsed feed';

    return [
      { label: 'Parsed last 1 hour', value: summary.oneHour, hint: scopeLabel },
      { label: 'Parsed last 4 hours', value: summary.fourHours, hint: scopeLabel },
      { label: 'Parsed last 1 day', value: summary.oneDay, hint: scopeLabel },
      { label: 'Parsed last 7 days', value: summary.sevenDays, hint: scopeLabel },
      { label: 'Parsed all time', value: summary.allTime, hint: scopeLabel },
    ];
  }, [activeChannel, streamNetworkMode, visibleStream, computeMinutes, streamSummary]);

  return (
    <>
      <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Inventory workspace</p>
            <h2 className="mt-1 text-[20px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">
              Shared feed for listings, requirements, and follow-up signals
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
              This view is the shared working surface for parsed inventory and buyer demand. Review fresh items,
              filter by quality and type, route the right records into channels, and act on high-signal entries first.
            </p>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
              Freshness: green under 1 hour, amber under 6 hours, red older. Handle green first.
            </p>

            {activeChannel ? (
              <div className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-full border-[0.5px] border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-2 text-[11px] font-medium text-[var(--text-primary)]">
                <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>{formatChannelTitle(activeChannel.name)}</span>
                <span className="text-[var(--text-secondary)]">
                  / {visibleStream.length} routed item{visibleStream.length === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => navigate('/stream')}
                  className="rounded-full border border-[color:var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-[10px] text-[var(--text-secondary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
                >
                  Show full stream
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-action="rebuild-stream"
              onClick={() => void handleRebuildStream()}
              className="rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)] transition-colors hover:brightness-110"
            >
              Rebuild Stream
            </button>
            <div className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]">
              {activeChannel ? formatChannelTitle(activeChannel.name) : 'All inventory'}
            </div>
              <div className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                {visibleStream.length} items
              </div>
            </div>
          </div>
        </div>

      <div className="flex items-center gap-3 rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 text-[11px]">
        <Signal className={cn(
          'h-3.5 w-3.5',
          waStatus === 'connected' ? 'text-[var(--accent)]' : waStatus === 'connecting' ? 'text-[var(--amber)]' : waStatus === 'loading' ? 'text-[var(--text-secondary)]' : 'text-[var(--red)]',
        )} />
        <span className={cn(
          'font-medium',
          waStatus === 'connected' ? 'text-[var(--accent)]' : waStatus === 'connecting' ? 'text-[var(--amber)]' : 'text-[var(--text-secondary)]',
        )}>
          {waStatus === 'connected' ? 'WhatsApp connected — stream is live'
            : waStatus === 'connecting' ? 'WhatsApp connecting...'
            : waStatus === 'loading' ? 'Checking connection...'
            : 'WhatsApp disconnected'}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">{card.label}</p>
            <p className="mt-2 text-[24px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">{card.value}</p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{card.hint}</p>
          </div>
        ))}
      </div>

      {infoMessage ? (
        <div className="rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-3 text-[12px] text-[var(--text-primary)]">
          {infoMessage}
        </div>
      ) : null}

      <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2 text-neutral-400">
            <Activity className="h-3.5 w-3.5 text-[--propai-green]" />
            <span className="font-medium text-white">WhatsApp opens today</span>
          </div>
          <span className="text-white font-bold">{waClickStats?.total_clicks ?? 0}</span>
          <span className="text-neutral-600">|</span>
          <span className="text-neutral-400">Unique tapped</span>
          <span className="text-white font-bold">{waClickStats?.unique_listings ?? 0}</span>
          <span className="text-neutral-600">|</span>
          <span className="text-neutral-400">Last</span>
          <span className="text-white text-[10px]">
            {waClickStats?.last_click_at
              ? new Date(waClickStats.last_click_at).toLocaleTimeString()
              : '—'}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void exportWaClickCsv()}
            className="flex items-center gap-1 rounded-lg border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[10px] text-[var(--text-secondary)] hover:text-white"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex flex-col items-stretch justify-between gap-4 rounded-2xl border border-[color:var(--border)] bg-[var(--bg-surface)]/30 p-4 md:flex-row md:items-center">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)] transition-colors group-focus-within:text-primary" />
          <input
            id="stream-search"
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={activeChannel ? `Search ${activeChannel.name}...` : 'Search inventory and requirements...'}
            className="w-full rounded-xl border border-[color:var(--border-strong)] bg-[var(--bg-elevated)] py-2 pl-12 pr-4 text-sm text-[var(--text-primary)] transition-all focus:border-primary focus:outline-none"
          />
        </div>

        <div className="flex w-full flex-wrap items-center gap-3 md:w-auto md:flex-nowrap">
          <button
            type="button"
            data-action="stream-filters"
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all md:flex-none',
              showFilters || activeFilterCount > 0
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-neutral-800 bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-white',
            )}
          >
            <Filter className="h-3 w-3" />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-black text-black">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={cn('h-3 w-3 transition-transform', showFilters && 'rotate-180')} />
          </button>
          <div className="hidden h-6 w-px bg-[var(--bg-elevated)] md:block" />
          <p className="px-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
            {activeChannel ? visibleStream.length : visibleStream.length} feed items
          </p>
        </div>
      </div>

      <div className="block">
        <div className="rounded-2xl border border-[color:var(--border-strong)] bg-[var(--bg-base)] p-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Presets</p>
              {STREAM_PRESETS.map((preset) => {
                const active = isPresetActive(preset.id);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
                      active
                        ? 'border-[color:var(--accent-border)] bg-[var(--accent)] text-[#020f07]'
                        : 'border-neutral-700 bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-white',
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Time</p>
              <button
                type="button"
                onClick={() => setQuickTimeBands([])}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
                  quickTimeBands.length === 0
                    ? 'border-[color:var(--accent-border)] bg-[var(--accent)] text-[#020f07]'
                    : 'border-neutral-700 bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-white',
                )}
              >
                All
              </button>
              {(['1h', '4h', '1d', '7d'] as const).map((band) => (
                <button
                  key={band}
                  type="button"
                  onClick={() => setQuickTimeBands((current) => toggleSelection(current, band))}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
                    quickTimeBands.includes(band)
                      ? 'border-[color:var(--accent-border)] bg-[var(--accent)] text-[#020f07]'
                      : 'border-neutral-700 bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-white',
                  )}
                >
                  {band === '1h' ? '<1hr' : band === '4h' ? '<4hr' : band === '1d' ? '<1d' : '<7d'}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Type</p>
              <button
                type="button"
                onClick={() => { setQuickTypes([]); setFilterPropertyCategory('all'); }}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
                  quickTypes.length === 0 && filterPropertyCategory === 'all'
                    ? 'border-[color:var(--accent-border)] bg-[var(--accent)] text-[#020f07]'
                    : 'border-neutral-700 bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-white',
                )}
              >
                All
              </button>
              {ALL_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setQuickTypes((current) => toggleSelection(current, type))}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
                    quickTypes.includes(type)
                      ? 'border-[color:var(--accent-border)] bg-[var(--accent)] text-[#020f07]'
                      : 'border-neutral-700 bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-white',
                  )}
                >
                  {type}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setFilterPropertyCategory((current) => current === 'commercial' ? 'all' : 'commercial')}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
                  filterPropertyCategory === 'commercial'
                    ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                    : 'border-neutral-700 bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-white',
                )}
              >
                COMMERCIAL
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Confidence</p>
              {([
                ['high', 'High (>70%)'],
                ['medium', 'Medium'],
                ['low', 'Low'],
              ] as const).map(([band, label]) => (
                <button
                  key={band}
                  type="button"
                  onClick={() => setQuickConfidenceBands((current) => toggleSelection(current, band))}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
                    quickConfidenceBands.includes(band)
                      ? 'border-[color:var(--accent-border)] bg-[var(--accent)] text-[#020f07]'
                      : 'border-neutral-700 bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-white',
                  )}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setQuickConfidenceBands([])}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
                  quickConfidenceBands.length === 0
                    ? 'border-[color:var(--accent-border)] bg-[var(--accent)] text-[#020f07]'
                    : 'border-neutral-700 bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-white',
                )}
              >
                All
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Freshness</p>
              {([
                ['1h', 'Last 1hr'],
                ['6h', 'Last 6hr'],
              ] as const).map(([band, label]) => (
                <button
                  key={band}
                  type="button"
                  onClick={() => setQuickFreshnessBands((current) => toggleSelection(current, band))}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
                    quickFreshnessBands.includes(band)
                      ? 'border-[color:var(--accent-border)] bg-[var(--accent)] text-[#020f07]'
                      : 'border-neutral-700 bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-white',
                  )}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setQuickFreshnessBands([])}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
                  quickFreshnessBands.length === 0
                    ? 'border-[color:var(--accent-border)] bg-[var(--accent)] text-[#020f07]'
                    : 'border-neutral-700 bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-white',
                )}
              >
                All
              </button>
            </div>
          </div>
        </div>
      </div>

      {showFilters ? (
        <div className="overflow-hidden">
          <div className="rounded-2xl border border-[color:var(--border-strong)] bg-[var(--bg-surface)] p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]">Filters</h3>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="flex items-center gap-1 text-[10px] font-bold text-[var(--text-secondary)] transition-colors hover:text-white"
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">Category</label>
                  <select
                    value={filterPropertyCategory}
                    onChange={(e) => setFilterPropertyCategory(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-white focus:border-primary focus:outline-none"
                  >
                    <option value="all">All</option>
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial</option>
                  </select>
                </div>

                {filterPropertyCategory !== 'commercial' && (
                  <div>
                    <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">BHK</label>
                    <select
                      value={filterBhk}
                      onChange={(e) => setFilterBhk(e.target.value)}
                      className="w-full rounded-lg border border-[color:var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-white focus:border-primary focus:outline-none"
                    >
                      <option value="all">All</option>
                      {ALL_BHK.map((b) => (
                        <option key={b} value={b}>{formatLayoutLabel(b)}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">Source</label>
                  <select
                    value={filterSource}
                    onChange={(e) => setFilterSource(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-white focus:border-primary focus:outline-none"
                  >
                    <option value="all">All</option>
                    {uniqueSources.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-[color:var(--border-strong)] bg-[var(--bg-base)]/35 p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={brokerOnly}
                    onChange={(e) => setBrokerOnly(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[color:var(--border-strong)] bg-[var(--bg-surface)] text-primary focus:ring-primary"
                  />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white">Broker-tagged only</p>
                    <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
                      Show only items where the parsed source or message text contains terms like <span className="text-neutral-200">broker</span>, <span className="text-neutral-200">broking</span>, <span className="text-neutral-200">agnt</span>, or <span className="text-neutral-200">agent</span>.
                    </p>
                  </div>
                </label>
              </div>
            </div>
        </div>
      ) : null}

      <div className="glass-panel overflow-hidden rounded-2xl border-[color:var(--border)]">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center gap-3 px-5 py-12 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading inventory feed...
            </div>
          ) : error ? (
            <div className="px-5 py-12 text-center text-sm text-red-400">
              {error}
            </div>
          ) : renderedStream.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-[var(--text-secondary)]">
              No parsed inventory or buyer records are available yet.
            </div>
          ) : (
            <table className="min-w-[1080px] w-full border-separate border-spacing-0 text-left">
              <thead>
                <tr className="border-b border-[color:var(--accent-border)] bg-[color:var(--propai-green-dim)]">
                  {['Record', 'Type', 'BHK', 'Area', 'Price', 'Furnishing', 'Floor', 'Posted', 'WA'].map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--propai-green)]"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              {renderedGroups.map((group) => (
                <tbody key={group.locality}>
                  <tr className="sticky top-0 z-10">
                    <td
                      colSpan={9}
                      className="border-y border-[color:var(--border)] bg-[var(--bg-base)] px-4 py-3 text-[12px] font-semibold text-[var(--text-primary)] backdrop-blur"
                    >
                      {group.locality} · {group.listingCount} listing{group.listingCount === 1 ? '' : 's'} · {group.requirementCount} requirement{group.requirementCount === 1 ? '' : 's'}
                    </td>
                  </tr>
                  {group.items.map((listing) => {
                    const isExpanded = expandedListingId === listing.id;
                    const recordLabel = getRecordLabel(listing);
                    const typeLabel = getTypeLabel(listing);
                    const rawNote = redactPhoneNumbers(listing.rawText || listing.description || '');
                    const cleanNote = stripHiddenLines(rawNote);
                    const igrTransactions = Array.isArray(listing.igrTransactions) ? listing.igrTransactions.slice(0, 3) : [];

                    return (
                      <React.Fragment key={listing.id}>
                        <tr
                          data-action="stream-item"
                          onClick={() => {
                            setExpandedListingId(isExpanded ? null : listing.id);
                            if (!isExpanded && editingListingId && editingListingId !== listing.id) {
                              setEditingListingId(null);
                              setCorrectionDraft(null);
                            }
                          }}
                          className={cn(
                            'cursor-pointer border-b border-[color:var(--border)] transition-colors',
                            isExpanded ? 'bg-[var(--bg-surface)]' : 'hover:bg-[var(--bg-elevated)]/60',
                          )}
                        >
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]', getRecordBadgeClass(recordLabel))}>
                              {recordLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]', getDealBadgeClass(typeLabel))}>
                              {typeLabel}
                            </span>
                            {(listing.propertyCategory === 'commercial' || listing.assetClass === 'commercial') && (
                              <span className="ml-1.5 inline-flex rounded-full border border-purple-500/40 bg-purple-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-purple-300">
                                COMMERCIAL
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[13px] text-[var(--text-primary)]">{listing.bhk || '—'}</td>
                          <td className="px-4 py-3 text-[13px] text-[var(--text-primary)]">{formatAreaCell(listing.areaSqft)}</td>
                          <td className="px-4 py-3 text-[13px] font-semibold text-[var(--text-primary)]">{normalizePriceDisplay(listing).label || 'Price on request'}</td>
                          <td className="px-4 py-3 text-[13px] text-[var(--text-primary)]">{formatFurnishingCell(listing.furnishing)}</td>
                          <td className="px-4 py-3 text-[13px] text-[var(--text-primary)]">{formatFloorCell(listing)}</td>
                          <td className="px-4 py-3 text-[13px] text-[var(--text-secondary)]">{formatPostedCell(listing.createdAt)}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                const waLink = listing.brokerWaMeLinks?.[0] || listing.waLink;
                                if (!waLink) return;
                                window.open(waLink, '_blank', 'noopener,noreferrer');
                              }}
                              disabled={!listing.brokerWaMeLinks?.[0] && !listing.waLink}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] text-[16px] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label="Open WhatsApp"
                            >
                              📲
                            </button>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="border-b border-[color:var(--border)] bg-[var(--bg-surface)]">
                            <td colSpan={9} className="px-4 pb-5 pt-1">
                              <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-base)] p-4">
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="space-y-3">
                                    {listing.microLocation ? (
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Micro Location</p>
                                        <p className="mt-1 text-[13px] text-[var(--text-primary)]">{listing.microLocation}</p>
                                      </div>
                                    ) : null}
                                    {listing.propertyUse ? (
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Property Use</p>
                                        <p className="mt-1 text-[13px] text-[var(--text-primary)]">{listing.propertyUse}</p>
                                      </div>
                                    ) : null}
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Broker Note</p>
                                      <pre className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-6 text-[var(--text-primary)]">{cleanNote || '—'}</pre>
                                    </div>
                                    {listing.parseNotes ? (
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Parse Notes</p>
                                        <p className="mt-1 text-[12px] leading-6 text-[var(--text-secondary)]">{listing.parseNotes}</p>
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="space-y-3">
                                    {igrTransactions.length > 0 ? (
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">IGR Transactions</p>
                                        <div className="mt-2 space-y-2">
                                          {igrTransactions.map((transaction) => (
                                            <div
                                              key={`${transaction.doc_number || 'txn'}-${transaction.reg_date || ''}`}
                                              className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] text-[var(--text-primary)]"
                                            >
                                              {formatIgrCompact(transaction)}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}

                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Actions</p>
                                      <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            const waLink = listing.brokerWaMeLinks?.[0] || listing.waLink;
                                            if (!waLink) return;
                                            window.open(waLink, '_blank', 'noopener,noreferrer');
                                          }}
                                          disabled={!listing.brokerWaMeLinks?.[0] && !listing.waLink}
                                          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          <Phone className="h-3.5 w-3.5" />
                                          Contact on WhatsApp
                                        </button>
                                        <button
                                          type="button"
                                          data-action="save-to-channel"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setOpenActionMenuId((current) => current === listing.id ? null : listing.id);
                                          }}
                                          className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]"
                                        >
                                          Save to Channel
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void navigator.clipboard.writeText(buildCopyText(listing));
                                            setInfoMessage('Copied listing note.');
                                          }}
                                          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]"
                                        >
                                          <Copy className="h-3.5 w-3.5" />
                                          Copy
                                        </button>
                                      </div>
                                      {openActionMenuId === listing.id ? (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                          {channels.length === 0 ? (
                                            <div className="text-[12px] text-[var(--text-secondary)]">No channels available.</div>
                                          ) : (
                                            channels.map((channel) => (
                                              <button
                                                key={channel.id}
                                                type="button"
                                                data-action="save-to-channel"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  void handleAttachStreamItemToChannel(channel.id, listing.id);
                                                }}
                                                disabled={savingChannelItemId === listing.id}
                                                className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[11px] text-[var(--text-primary)] disabled:opacity-60"
                                              >
                                                {savingChannelItemId === listing.id ? 'Saving...' : formatChannelTitle(channel.name)}
                                              </button>
                                            ))
                                          )}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              ))}
            </table>
          )}
        </div>

        <div ref={sentinelRef} className="px-6 py-4 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
          {hasMore ? `${renderedStream.length} of ${visibleStream.length} loaded. More items appear as you scroll.` : 'End of feed'}
        </div>
      </div>
      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] shadow-lg transition-all hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
        >
          <ArrowUpFromLine className="h-4 w-4" />
        </button>
      )}
    </>
  );
};
