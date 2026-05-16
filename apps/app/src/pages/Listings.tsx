import React from 'react';
import {
  ChevronDown,
  Filter,
  IndianRupee,
  Layers,
  Loader2,
  MapPin,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  Download,
  Phone,
  Activity,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import {
  fetchChannels,
  markChannelRead,
  attachStreamItemToChannel,
  type PersonalChannel,
} from '../services/channelApi';
import { handleApiError } from '../services/api';
import { fetchStreamItems, fetchStreamStats, correctStreamItem, type StreamItem } from '../services/streamAPI';
import { rebuildStreamFromSavedMessages } from '../services/streamService';
import { ListingCard } from '../components/stream/ListingCard';
import { fetchWaClickStats, getWaClickExportUrl, type WaClickStats } from '../services/waClickAPI';

const formatChannelTitle = (name: string) => `#${name}`;
const PAGE_SIZE = 20;
const ALL_TYPES = ['Rent', 'Sale', 'Requirement', 'Pre-leased', 'Lease'] as const;
const ALL_BHK = ['1 BHK', '2 BHK', '3 BHK', '4+ BHK'] as const;
const ALL_PROPERTY_CATEGORIES = ['residential', 'commercial'] as const;
const BROKER_TAG_PATTERN = /\b(broker|broking|agnt|agent)\b/i;
const OWNER_SUPER_ADMIN_EMAILS = new Set([
  'vishal@chaoscraftlabs.com',
  'vishal@chaoscraftslabs.com',
]);
const ACTIVE_SESSION_STORAGE_KEY = 'propai.active_whatsapp_session';

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

const formatCompactNumber = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
};

const parsePriceTokens = (text: string) => {
  const tokens = Array.from(text.matchAll(/(\d+(?:\.\d+)?)(?:\s*(cr|crore|l|lac|lakh|k|thousand|m|mn|million))?/gi));
  return tokens.map((match) => ({
    value: Number(match[1]),
    unit: (match[2] || '').toLowerCase(),
  })).filter((entry) => Number.isFinite(entry.value));
};

const convertToCr = (value: number, unit: string) => {
  switch (unit) {
    case 'cr':
    case 'crore':
      return value;
    case 'l':
    case 'lac':
    case 'lakh':
      return value / 100;
    case 'k':
    case 'thousand':
      return value / 10000;
    case 'm':
    case 'mn':
    case 'million':
      return value / 10;
    default:
      return value;
  }
};

const convertToK = (value: number, unit: string) => {
  switch (unit) {
    case 'cr':
    case 'crore':
      return value * 10000;
    case 'l':
    case 'lac':
    case 'lakh':
      return value * 100;
    case 'm':
    case 'mn':
    case 'million':
      return value * 1000;
    default:
      return value;
  }
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

const formatPriceValue = (value: number, unit: 'cr' | 'k') => {
  const formatted = formatCompactNumber(value);
  return unit === 'cr' ? `₹${formatted} Cr` : `₹${formatted}K/mo`;
};

const normalizePriceDisplay = (item: StreamItem) => {
  const raw = stripPriceNoise(String(item.price || '')).trim();
  const tokens = parsePriceTokens(raw);
  const negotiable = /negotiable/i.test(item.price || '');
  const fallbackNumeric = typeof item.priceNumeric === 'number' && Number.isFinite(item.priceNumeric) ? item.priceNumeric : null;

  let label = raw || 'Unspecified';

  if (item.type === 'Requirement') {
    if (tokens.length >= 2) {
      const first = convertToCr(tokens[0].value, tokens[0].unit);
      const second = convertToCr(tokens[1].value, tokens[1].unit || tokens[0].unit);
      label = first === second
        ? `Budget: ₹${formatCompactNumber(first)} Cr`
        : `Budget: ₹${formatCompactNumber(Math.min(first, second))} – ${formatCompactNumber(Math.max(first, second))} Cr`;
    } else if (tokens.length === 1) {
      label = `Budget: ₹${formatCompactNumber(convertToCr(tokens[0].value, tokens[0].unit))} Cr`;
    } else if (fallbackNumeric) {
      label = `Budget: ₹${formatCompactNumber(convertToCr(fallbackNumeric, 'cr'))} Cr`;
    } else {
      label = raw ? `Budget: ${raw}` : 'Budget unavailable';
    }
  } else if (item.type === 'Rent') {
    if (tokens.length > 0) {
      label = formatPriceValue(convertToK(tokens[0].value, tokens[0].unit), 'k');
    } else if (fallbackNumeric) {
      label = formatPriceValue(convertToK(fallbackNumeric, 'k'), 'k');
    } else {
      label = raw || 'Unspecified';
    }
  } else {
    if (tokens.length > 0) {
      label = formatPriceValue(convertToCr(tokens[0].value, tokens[0].unit), 'cr');
    } else if (fallbackNumeric) {
      label = formatPriceValue(convertToCr(fallbackNumeric, 'cr'), 'cr');
    } else {
      label = raw || 'Unspecified';
    }
  }

  return {
    label,
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
  const [quickTimeBands, setQuickTimeBands] = React.useState<Array<'1h' | '8h'>>([]);
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  const loadData = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [channelRecords, items] = await Promise.all([
        fetchChannels(),
        fetchStreamItems({
          channelId: channelId || undefined,
          sessionLabel: selectedSessionLabel && selectedSessionLabel !== 'all' ? selectedSessionLabel : undefined,
        }),
      ]);

      setChannels(channelRecords);
      setStreamItems(items);
      setStreamTotal(items.length);

      void fetchStreamStats()
        .then((stats) => {
          setStreamTotal(stats.total || items.length);
        })
        .catch(() => {
          setStreamTotal(items.length);
        });

      if (channelId) {
        await markChannelRead(channelId);
        window.dispatchEvent(new Event('channels:refresh'));
      }
    } catch (err) {
      setError(handleApiError(err));
      setStreamItems([]);
      setStreamTotal(0);
      setChannels([]);
    } finally {
      setIsLoading(false);
    }
  }, [channelId, selectedSessionLabel]);

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

     if (!user?.token || channelId) {
       return;
     }

     const setupRealtime = async () => {
       const { createSupabaseBrowserClient } = await import('../services/supabaseBrowser');
       if (!active) {
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
   }, [channelId, loadData, selectedSessionLabel, user?.token]);

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
      const result = await rebuildStreamFromSavedMessages(500);
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
  const isSuperAdmin =
    user?.appRole === 'super_admin' ||
    OWNER_SUPER_ADMIN_EMAILS.has(String(user?.email || '').trim().toLowerCase());

  const uniqueSources = React.useMemo(() => {
    const sources = new Set<string>();
    streamItems.forEach((item) => sources.add(item.source));
    return Array.from(sources).sort();
  }, [streamItems]);

  const visibleStream = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    let filtered = streamItems;

    if (query) {
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
          listing.description,
          listing.rawText || '',
        ].join(' ').toLowerCase();
        return haystack.includes(query);
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
          return minutes < 480;
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
    }, [streamItems, search, quickTypes, filterBhk, quickConfidenceBands, quickFreshnessBands, filterSource, brokerOnly, filterPropertyCategory]);

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
    setQuickConfidenceBands([]);
    setQuickFreshnessBands([]);
    setFilterBhk('all');
    setFilterSource('all');
    setBrokerOnly(false);
    setFilterPropertyCategory('all');
  };

  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeChannel?.id, search, quickTypes, filterBhk, quickConfidenceBands, quickFreshnessBands, filterSource, brokerOnly]);

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
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleCount((current) => Math.min(current + PAGE_SIZE, visibleStream.length));
      },
      {
        root: null,
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
  const hasMore = visibleCount < visibleStream.length;

  return (
    <>
      <div className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Stream</p>
            <h2 className="mt-1 text-[20px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">
              Every property from your groups, scored in real time
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
              Pulse reads every message from your connected WhatsApp groups, extracts listings and requirements, scores them by signal quality and freshness, and routes the best ones to your personal channels.
            </p>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
              Green dot = last hour. Amber = last 6hrs. Red = older. Act on green first.
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
              onClick={() => void handleRebuildStream()}
              className="rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)] transition-colors hover:brightness-110"
            >
              Rebuild Stream
            </button>
            <div className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]">
              {activeChannel ? formatChannelTitle(activeChannel.name) : 'All stream'}
            </div>
            <div className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
              {activeChannel ? visibleStream.length : streamTotal || visibleStream.length} items
            </div>
          </div>
        </div>
      </div>

      {infoMessage ? (
        <div className="rounded-[10px] border-[0.5px] border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-3 text-[12px] text-[var(--text-primary)]">
          {infoMessage}
        </div>
      ) : null}

      <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-surface)]/50 px-4 py-3">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 text-neutral-400">
            <Activity className="h-3.5 w-3.5 text-[--propai-green]" />
            <span className="font-medium text-white">WA clicks today</span>
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
          <a
            href={getWaClickExportUrl()}
            className="flex items-center gap-1 rounded-lg border border-neutral-700 px-2.5 py-1 text-[10px] text-neutral-400 hover:text-white"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </a>
        </div>
      </div>

      <div className="flex flex-col items-stretch justify-between gap-4 rounded-2xl border border-[color:var(--border)] bg-[var(--bg-surface)]/30 p-4 md:flex-row md:items-center">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)] transition-colors group-focus-within:text-primary" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={activeChannel ? `Search ${activeChannel.name}...` : 'Search stream...'}
            className="w-full rounded-xl border border-[color:var(--border-strong)] bg-black py-2 pl-12 pr-4 text-sm transition-all focus:border-primary focus:outline-none"
          />
        </div>

        <div className="flex w-full flex-wrap items-center gap-3 md:w-auto md:flex-nowrap">
          <button
            type="button"
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
            {activeChannel ? visibleStream.length : streamTotal || visibleStream.length} Stream Items
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[color:var(--border-strong)] bg-[var(--bg-base)] p-4">
        <div className="space-y-3">
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
            {(['1h', '8h'] as const).map((band) => (
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
                {band === '1h' ? '<1hr' : '<8hr'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Type</p>
            <button
              type="button"
              onClick={() => setQuickTypes([])}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
                quickTypes.length === 0
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
        <div className="space-y-3 lg:hidden">
          {isLoading ? (
            <div className="flex items-center justify-center gap-3 px-5 py-12 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading live stream...
            </div>
          ) : error ? (
            <div className="px-5 py-12 text-center text-sm text-red-400">
              {error}
            </div>
          ) : renderedStream.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-[var(--text-secondary)]">
              No live WhatsApp items have landed here yet.
            </div>
          ) : (
            renderedStream.map((listing) => {
              const isExpanded = expandedListingId === listing.id;
              const waCount = waClickStats?.by_listing[listing.id]?.count || 0;
              return (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  isExpanded={isExpanded}
                  onToggle={() => {
                    setExpandedListingId(isExpanded ? null : listing.id);
                    if (!isExpanded && editingListingId && editingListingId !== listing.id) {
                      setEditingListingId(null);
                      setCorrectionDraft(null);
                    }
                  }}
                  waClickCount={waCount}
                />
              );
            })
          )}
        </div>

        <div className="hidden lg:block">
          <div className="space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center gap-3 px-5 py-12 text-sm text-[var(--text-secondary)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading live stream...
              </div>
            ) : error ? (
              <div className="px-5 py-12 text-center text-sm text-red-400">
                {error}
              </div>
            ) : renderedStream.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-[var(--text-secondary)]">
                No live WhatsApp items have landed here yet.
              </div>
            ) : (
              renderedStream.map((listing) => {
                const isExpanded = expandedListingId === listing.id;
                const waCount = waClickStats?.by_listing[listing.id]?.count || 0;
                return (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    isExpanded={isExpanded}
                    onToggle={() => {
                      setExpandedListingId(isExpanded ? null : listing.id);
                      if (!isExpanded && editingListingId && editingListingId !== listing.id) {
                        setEditingListingId(null);
                        setCorrectionDraft(null);
                      }
                    }}
                    waClickCount={waCount}
                  />
                );
              })
            )}
          </div>
        </div>

        <div ref={sentinelRef} className="px-6 py-4 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
          {hasMore ? `${renderedStream.length} of ${visibleStream.length} loaded. More items appear as you scroll.` : 'End of stream'}
        </div>
    </div>
    </>
  );
};
