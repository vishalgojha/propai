import React from 'react';
import {
  ArrowUpFromLine,
  Loader2,
  Search,
  Sparkles,
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
import { fetchStreamItems, fetchStreamStats, fetchStreamSummary, correctStreamItem, searchStream, type StreamItem, type StreamSummaryResponse, type FuzzySuggestion } from '../services/streamAPI';
import { rebuildStreamFromSavedMessages } from '../services/streamService';
import { fetchWaClickStats, exportWaClickCsv, type WaClickStats } from '../services/waClickAPI';

const formatChannelTitle = (name: string) => `#${name}`;
const PAGE_SIZE = 20;
const STREAM_INITIAL_FETCH_LIMIT = 100;
const STREAM_SEARCH_FETCH_LIMIT = 500;
const STREAM_VIEW_CACHE_VERSION = 1;
const STREAM_VIEW_CACHE_TTL_MS = 2 * 60 * 1000;
const ALL_TYPES = ['Rent', 'Sale', 'Requirement', 'Pre-leased', 'Lease'] as const;
const ALL_CONFIGURATIONS = ['1 BHK', '2 BHK', '3 BHK', '4+ BHK', 'Studio', 'Office', 'Retail', 'Shop', 'Showroom', 'Warehouse'] as const;
const ALL_COMMERCIAL_FACETS = ['Office', 'Retail', 'Shop', 'Showroom', 'Warehouse', 'Pre-leased'] as const;
const ALL_PROPERTY_CATEGORIES = ['residential', 'commercial'] as const;
const BROKER_TAG_PATTERN = /\b(broker|broking|agnt|agent)\b/i;
const ACTIVE_SESSION_STORAGE_KEY = 'propai.active_whatsapp_session';
const BROKER_DECORATION_PATTERN = /[\p{Extended_Pictographic}\u200d\uFE0F]/gu;
const BROKER_SYMBOL_PATTERN = /[•·▪▫◆◇★☆⬤◉○●⬛⬜◼◻⬢⬡⬆⬇⬅➡↔↕]/gu;
const OWNER_SUPER_ADMIN_EMAILS = new Set([
  'vishal@propai.live',
  'vishalojha@gmail.com',
  'vishal.ojha@propai.live',
  'vishal@chaoscraftlabs.com',
  'vishal@chaoscraftslabs.com',
  'chariotrealty@gmail.com',
  'hello@chaoscraftlabs.com',
  'ojha007@gmail.com',
  'hello@propai.live',
]);
type StreamPresetId = 'fresh' | 'rental' | 'sale' | 'pre_leased' | 'requirements';
const STREAM_PRESETS: Array<{ id: StreamPresetId; label: string }> = [
  { id: 'fresh', label: '🔴 Fresh' },
  { id: 'rental', label: '🏠 Rental' },
  { id: 'sale', label: '💰 Sale' },
  { id: 'pre_leased', label: '🏢 Pre-Leased' },
  { id: 'requirements', label: '📋 Requirements' },
];

type StreamViewCache = {
  version: number;
  cachedAt: number;
  items: StreamItem[];
  channels: PersonalChannel[];
  summary: StreamSummaryResponse | null;
  total: number;
  networkMode: boolean;
};

const getStreamViewCacheKey = (scopeKey: string) => `propai.stream_view.${scopeKey}`;

const readStreamViewCache = (scopeKey: string): StreamViewCache | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(getStreamViewCacheKey(scopeKey));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StreamViewCache> | null;
    if (!parsed || parsed.version !== STREAM_VIEW_CACHE_VERSION || !Array.isArray(parsed.items) || !Array.isArray(parsed.channels)) {
      return null;
    }

    if (typeof parsed.cachedAt !== 'number' || Date.now() - parsed.cachedAt > STREAM_VIEW_CACHE_TTL_MS) {
      return null;
    }

    return {
      version: STREAM_VIEW_CACHE_VERSION,
      cachedAt: parsed.cachedAt,
      items: parsed.items as StreamItem[],
      channels: parsed.channels as PersonalChannel[],
      summary: parsed.summary && typeof parsed.summary === 'object' ? parsed.summary as StreamSummaryResponse : null,
      total: Number(parsed.total || 0),
      networkMode: Boolean(parsed.networkMode),
    };
  } catch {
    return null;
  }
};

const writeStreamViewCache = (scopeKey: string, payload: Omit<StreamViewCache, 'version' | 'cachedAt'>) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const nextCache: StreamViewCache = {
      version: STREAM_VIEW_CACHE_VERSION,
      cachedAt: Date.now(),
      ...payload,
    };
    window.sessionStorage.setItem(getStreamViewCacheKey(scopeKey), JSON.stringify(nextCache));
  } catch {
    // Ignore storage failures.
  }
};

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

const stripBrokerDecorations = (raw: string) =>
  String(raw || '')
    .normalize('NFKC')
    .replace(BROKER_DECORATION_PATTERN, ' ')
    .replace(BROKER_SYMBOL_PATTERN, ' ')
    .replace(/[|]{2,}/g, ' ')
    .replace(/[<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const sanitizeBrokerText = (raw: string) => {
  const text = stripBrokerDecorations(redactPhoneNumbers(raw));
  if (!text) return '';

  const visibleLines = text
    .split('\n')
    .map((line) => stripBrokerDecorations(line))
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

  return stripHiddenLines(visibleLines.join('\n'));
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
  const cleaned = stripSnippetNoise(sanitizeBrokerText(String(item.rawText || item.description || '')));
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

const getCommercialFacetText = (item: StreamItem) =>
  normalizeSearchText(
    [
      item.commercialType,
      item.propertyUse,
      item.assetClass,
      item.fitoutStatus,
      item.description,
      item.title,
    ]
      .filter(Boolean)
      .join(' '),
  );

const matchesCommercialFacet = (item: StreamItem, facet: string) => {
  if (facet === 'all') return true;
  const normalizedFacet = normalizeSearchText(facet);
  const haystack = getCommercialFacetText(item);

  if (!normalizedFacet) {
    return true;
  }

  return haystack.includes(normalizedFacet);
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

const formatLocalityCell = (value?: string | null) => {
  const text = String(value || '').trim();
  if (!text || /^n\/?a$/i.test(text) || /^unknown$/i.test(text)) {
    return '—';
  }

  return text;
};

const buildStreamDedupeKey = (item: StreamItem) =>
  normalizeSearchText(
    [
      item.type,
      item.recordType,
      item.location,
      item.buildingName,
      item.microLocation,
      item.price,
      item.configuration,
      item.areaSqft,
      item.furnishing,
      item.floorNumber,
      item.totalFloors,
      item.propertyUse,
      item.commercialType,
      item.fitoutStatus,
      item.workstationsCount,
      item.cabinsCount,
      item.description,
      item.rawText,
    ]
      .filter((value) => value != null && String(value).trim().length > 0)
      .join('|'),
  );

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

const summarizeIgrBuildingIntel = (buildingName?: string | null, transactions?: StreamItem['igrTransactions']) => {
  const trimmedBuildingName = String(buildingName || '').trim();
  const rows = Array.isArray(transactions) ? transactions.filter(Boolean) : [];
  const latest = rows[0] || null;

  if (!trimmedBuildingName && !latest) {
    return null;
  }

  const latestRate = latest?.price_per_sqft != null && Number.isFinite(latest.price_per_sqft)
    ? `₹${Math.round(latest.price_per_sqft).toLocaleString('en-IN')}/sqft`
    : null;
  const latestPrice = latest?.consideration != null && Number.isFinite(latest.consideration)
    ? formatPriceNumeric(latest.consideration)
    : null;
  const latestDate = latest?.reg_date
    ? new Date(latest.reg_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null;

  return {
    title: trimmedBuildingName || latest?.building_name || 'Building intel',
    subtitle: rows.length > 0
      ? `${rows.length} recent registration${rows.length === 1 ? '' : 's'}`
      : 'Awaiting transaction history',
    latest: [latestPrice, latestDate, latestRate].filter(Boolean).join(' · ') || 'Latest registration not parsed yet',
    locality: latest?.locality || null,
  };
};

const formatQueueTime = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const summarizeIgrQueueStatus = (listing: StreamItem) => {
  const buildingName = String(listing.buildingName || listing.igrQueueStatus?.buildingName || '').trim();
  if (!buildingName) return null;

  const status = listing.igrQueueStatus;
  const lastChecked = formatQueueTime(status?.lastCheckedAt);
  const nextRetry = formatQueueTime(status?.nextRetryAt);

  if (!status) {
    return {
      label: 'IGR lookup queued',
      detail: `${buildingName} is in the background lookup flow.`,
    };
  }

  if (status.status === 'done') {
    return {
      label: 'IGR lookup done',
      detail: lastChecked
        ? `${buildingName} was checked on ${lastChecked}; no matching saved registrations are attached yet.`
        : `${buildingName} was checked; no matching saved registrations are attached yet.`,
    };
  }

  if (status.status === 'failed') {
    return {
      label: 'IGR lookup failed',
      detail: lastChecked
        ? `${buildingName} failed during the last portal check on ${lastChecked}.`
        : `${buildingName} failed during the last portal check.`,
    };
  }

  if (lastChecked && nextRetry) {
    return {
      label: 'IGR lookup pending',
      detail: `${buildingName} was last checked on ${lastChecked}. Next retry: ${nextRetry}.`,
    };
  }

  return {
    label: 'IGR lookup pending',
    detail: `${buildingName} is waiting for its first background registration lookup.`,
  };
};

const buildCopyText = (item: StreamItem) => {
  const snippet = buildSnippet(item);
  const lines = [
    getRecordLabel(item),
    getTypeLabel(item),
    item.location || '—',
    item.configuration || '—',
    normalizePriceDisplay(item).label || 'Price on request',
    snippet.isLowSignal ? 'low signal' : snippet.label,
  ].filter(Boolean);
  return lines.join('\n');
};

const normalizeLocalityQuery = (value?: string | null) =>
  String(value || '')
    .replace(/\+/g, ' ')
    .trim()
    .split(',')[0]
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

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
  configuration: string;
  source: string;
  recordType: string;
  dealType: string;
  assetClass: string;
};

const buildCorrectionDraft = (item: StreamItem): StreamCorrectionDraft => ({
  type: item.type,
  location: item.location,
  city: item.city || '',
  price: item.price,
  configuration: item.configuration,
  source: item.source,
  recordType: item.recordType || '',
  dealType: item.dealType || '',
  assetClass: item.assetClass || '',
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
  const localityParam = searchParams.get('locality') || '';
  const localityFilter = React.useMemo(() => normalizeLocalityQuery(localityParam), [localityParam]);
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
  const [isRefreshingStream, setIsRefreshingStream] = React.useState(false);
  const [hasCachedStreamView, setHasCachedStreamView] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [infoMessage, setInfoMessage] = React.useState<string | null>(null);
  const [showFilters, setShowFilters] = React.useState(false);
  const [filterConfiguration, setFilterConfiguration] = React.useState<string>('all');
  const [filterCommercialFacet, setFilterCommercialFacet] = React.useState<string>('all');
  const [filterSource, setFilterSource] = React.useState<string>('all');
  const [brokerOnly, setBrokerOnly] = React.useState(false);
  const [showAllItems, setShowAllItems] = React.useState(false);
  const [quickTypes, setQuickTypes] = React.useState<Array<StreamItem['type']>>([]);
  const [quickFreshnessBands, setQuickFreshnessBands] = React.useState<Array<'1h' | '6h'>>([]);
  const [filterPropertyCategory, setFilterPropertyCategory] = React.useState<string>('residential');
  const [searchSuggestions, setSearchSuggestions] = React.useState<FuzzySuggestion[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
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
  const isSuperAdmin =
    user?.appRole === 'super_admin' ||
    OWNER_SUPER_ADMIN_EMAILS.has(String(user?.email || '').trim().toLowerCase());

  React.useEffect(() => {
    if (filterPropertyCategory === 'commercial') {
      if (filterConfiguration !== 'all') {
        setFilterConfiguration('all');
      }
      return;
    }

    if (filterCommercialFacet !== 'all') {
      setFilterCommercialFacet('all');
    }
  }, [filterPropertyCategory, filterConfiguration, filterCommercialFacet]);

  const serverFilters = React.useMemo(() => ({
    category: filterPropertyCategory as 'residential' | 'commercial',
    locality: localityFilter || undefined,
    limit: STREAM_INITIAL_FETCH_LIMIT,
    showAll: showAllItems || undefined,
  }), [filterPropertyCategory, localityFilter, showAllItems]);
  const queryScopeKey = React.useMemo(
    () => [channelId || 'all', selectedSessionLabel || 'all', filterPropertyCategory, localityFilter || 'all'].join('|'),
    [channelId, selectedSessionLabel, filterPropertyCategory, localityFilter],
  );
  const canViewStream = React.useMemo(
    () => isSuperAdmin || canViewStreamPlan(user?.subscription?.plan),
    [isSuperAdmin, user?.subscription?.plan],
  );

  const loadData = React.useCallback(async () => {
    if (!canViewStream) {
      setIsLoading(false);
      setIsRefreshingStream(false);
      setError(null);
      setInfoMessage(null);
      setChannels([]);
      setStreamItems([]);
      setStreamNetworkMode(false);
      setStreamSummary(null);
      setStreamTotal(0);
      return;
    }

    setIsLoading(!hasCachedStreamView);
    setIsRefreshingStream(hasCachedStreamView);
    setError(null);
    try {
      const targetSessionLabel = selectedSessionLabel && selectedSessionLabel !== 'all' ? selectedSessionLabel : undefined;
      const [channelRecords, initialStreamResponse] = await Promise.all([
        fetchChannels(),
        fetchStreamItems({
          channelId: channelId || undefined,
          sessionLabel: targetSessionLabel,
          ...serverFilters,
          limit: STREAM_INITIAL_FETCH_LIMIT,
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
      writeStreamViewCache(queryScopeKey, {
        items,
        channels: channelRecords,
        summary: null,
        total: streamResponse.total || items.length,
        networkMode: Boolean(streamResponse.network_mode),
      });

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
          writeStreamViewCache(queryScopeKey, {
            items,
            channels: channelRecords,
            summary,
            total: nextTotal,
            networkMode: Boolean(summary?.network_mode ?? streamResponse.network_mode),
          });
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
      if (!hasCachedStreamView) {
        setStreamItems([]);
        setStreamTotal(0);
        setStreamNetworkMode(false);
        setStreamSummary(null);
        setChannels([]);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshingStream(false);
    }
  }, [canViewStream, channelId, hasCachedStreamView, queryScopeKey, selectedSessionLabel, serverFilters]);

  React.useEffect(() => {
    const cached = readStreamViewCache(queryScopeKey);
    if (cached) {
      setHasCachedStreamView(true);
      setStreamItems(cached.items);
      setChannels(cached.channels);
      setStreamSummary(cached.summary);
      setStreamTotal(cached.total);
      setStreamNetworkMode(cached.networkMode);
      setIsLoading(false);
    } else {
      setHasCachedStreamView(false);
      setStreamItems([]);
      setStreamTotal(0);
      setStreamSummary(null);
      setStreamNetworkMode(false);
      setChannels([]);
      setIsLoading(true);
    }
    setVisibleCount(PAGE_SIZE);
    setExpandedListingId(null);
    setEditingListingId(null);
    setOpenActionMenuId(null);
    setSearchSuggestions([]);
    setError(null);
    setInfoMessage(null);
    attemptedBackfillScopesRef.current.clear();
  }, [queryScopeKey]);

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

  const uniqueSources = React.useMemo(() => {
    const sources = new Set<string>();
    streamItems.forEach((item) => sources.add(item.source));
    return Array.from(sources).sort();
  }, [streamItems]);

  const visibleStream = React.useMemo(() => {
    // When using unified search API, results are already filtered server-side
    if (isSearching || (search.trim() && streamTotal > 0 && streamItems.length !== streamTotal)) {
      return streamItems;
    }

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
          listing.configuration,
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

    if (filterPropertyCategory === 'residential' && filterConfiguration !== 'all') {
      if (filterConfiguration === '4+ BHK') {
        filtered = filtered.filter((item) => /4\+?\s*bhk/i.test(item.configuration));
      } else {
        filtered = filtered.filter((item) => item.configuration.toLowerCase().includes(filterConfiguration.toLowerCase().replace(' bhk', '')));
      }
    }

    if (filterPropertyCategory === 'commercial' && filterCommercialFacet !== 'all') {
      filtered = filtered.filter((item) => matchesCommercialFacet(item, filterCommercialFacet));
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

    // Always filter by category (residential or commercial)
    filtered = filtered.filter((item) => (item.propertyCategory || 'residential') === filterPropertyCategory);

    return filtered;
  }, [streamItems, search, quickTypes, filterConfiguration, filterCommercialFacet, quickFreshnessBands, quickTimeBands, filterSource, brokerOnly, filterPropertyCategory]);

  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (quickTypes.length > 0) count++;
    if (quickTimeBands.length > 0) count++;
    if (filterPropertyCategory === 'commercial') {
      if (filterCommercialFacet !== 'all') count++;
    } else if (filterConfiguration !== 'all') {
      count++;
    }
    if (quickFreshnessBands.length > 0) count++;
    if (filterSource !== 'all') count++;
    if (brokerOnly) count++;
    if (filterPropertyCategory !== 'all') count++;
    return count;
  }, [quickTypes, quickTimeBands, filterConfiguration, filterCommercialFacet, quickFreshnessBands, filterSource, brokerOnly, filterPropertyCategory]);

  const clearAllFilters = () => {
    setQuickTypes([]);
    setQuickTimeBands([]);
    setQuickFreshnessBands([]);
    setFilterConfiguration('all');
    setFilterCommercialFacet('all');
    setFilterSource('all');
    setBrokerOnly(false);
    setSearch('');
    setSearchSuggestions([]);
  };

  const handleSearchSubmit = React.useCallback(async () => {
    if (!search.trim()) {
      loadData();
      return;
    }

    setIsSearching(true);
    try {
      const assetClass = filterPropertyCategory === 'commercial' ? 'commercial' : 'residential';
      const result = await searchStream(assetClass, search.trim(), STREAM_SEARCH_FETCH_LIMIT);
      setStreamItems(result.items as StreamItem[]);
      setStreamTotal(result.total);
      setStreamNetworkMode(result.network_mode);
      setSearchSuggestions(result.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  }, [search, filterPropertyCategory, loadData]);

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

  };

  const isPresetActive = (preset: StreamPresetId) => {
    if (preset === 'fresh') return quickTimeBands.includes('1h');
    if (preset === 'rental') return quickTypes.includes('Rent');
    if (preset === 'sale') return quickTypes.includes('Sale');
    if (preset === 'pre_leased') return quickTypes.includes('Pre-leased');
    if (preset === 'requirements') return quickTypes.includes('Requirement');
    return false;
  };

  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeChannel?.id, search, quickTypes, filterConfiguration, quickFreshnessBands, quickTimeBands, filterSource, brokerOnly, filterPropertyCategory, localityFilter]);

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
    const loadMoreIfNeeded = () => {
      setVisibleCount((current) => Math.min(current + PAGE_SIZE, visibleStream.length));
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        loadMoreIfNeeded();
      },
      {
        root,
        rootMargin: '240px',
        threshold: 0,
      },
    );

    observer.observe(sentinel);

    const scrollTarget: Window | HTMLElement = root || window;
    const handleScroll = () => {
      if (visibleCount >= visibleStream.length) return;

      if (scrollTarget instanceof Window) {
        const distanceFromBottom = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
        if (distanceFromBottom <= 320) {
          loadMoreIfNeeded();
        }
        return;
      }

      const distanceFromBottom = scrollTarget.scrollHeight - (scrollTarget.scrollTop + scrollTarget.clientHeight);
      if (distanceFromBottom <= 320) {
        loadMoreIfNeeded();
      }
    };

    scrollTarget.addEventListener('scroll', handleScroll as EventListener, { passive: true });
    handleScroll();

    return () => {
      observer.disconnect();
      scrollTarget.removeEventListener('scroll', handleScroll as EventListener);
    };
  }, [visibleCount, visibleStream.length]);

  const renderedStream = React.useMemo(
    () => visibleStream.slice(0, visibleCount),
    [visibleStream, visibleCount],
  );
  const renderedGroups = React.useMemo<StreamLocalityGroup[]>(() => {
    const groups = new Map<string, StreamLocalityGroup>();
    const groupSeenKeys = new Map<string, Set<string>>();

    for (const item of renderedStream) {
      const locality = String(item.location || '').trim();
      if (!locality) continue;

      const dedupeKey = buildStreamDedupeKey(item);
      const seenKeys = groupSeenKeys.get(locality) || new Set<string>();
      if (seenKeys.has(dedupeKey)) {
        continue;
      }
      seenKeys.add(dedupeKey);
      groupSeenKeys.set(locality, seenKeys);

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
      fifteenMinutes: server?.fifteenMinutes ?? visibleStream.filter((item) => {
        const minutes = computeMinutes(item);
        return minutes != null && minutes < 15;
      }).length,
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
      ? `${formatChannelTitle(activeChannel.name)} routed feed`
      : streamNetworkMode
        ? 'Shared workspace feed'
        : 'Workspace feed';

    return [
      { label: 'Received last 15 min', value: summary.fifteenMinutes, hint: scopeLabel },
      { label: 'Received last 1 hour', value: summary.oneHour, hint: scopeLabel },
      { label: 'Received last 4 hours', value: summary.fourHours, hint: scopeLabel },
      { label: 'Received last 1 day', value: summary.oneDay, hint: scopeLabel },
      { label: 'Received last 7 days', value: summary.sevenDays, hint: scopeLabel },
      { label: 'Received all time', value: summary.allTime, hint: scopeLabel },
    ];
  }, [activeChannel, streamNetworkMode, visibleStream, computeMinutes, streamSummary]);

  if (!canViewStream) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
        <div className="rounded-[16px] border border-[color:var(--amber)] bg-[linear-gradient(180deg,rgba(66,47,9,0.28),rgba(12,16,24,0.92))] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--amber)]">Stream locked</p>
          <h2 className="mt-2 text-[24px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">Upgrade to view the feed</h2>
          <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
            Free and trial accounts can use the workspace, but the live stream, summaries, and routed inventory feed are restricted to Starter and Pro plans.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/pricing')}
              className="inline-flex items-center gap-2 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent)] px-5 py-3 text-[12px] font-bold uppercase tracking-[0.06em] text-[#020f07]"
            >
              Upgrade plan
            </button>
          </div>
        </div>
      </div>
    );
  }

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
              This view is the shared working surface for broker-posted listings and buyer demand. Review fresh items,
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

      {isRefreshingStream && !isLoading ? (
        <div className="flex items-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-[11px] text-[var(--text-secondary)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
          Refreshing cached stream in the background...
        </div>
      ) : null}

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

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-xs">
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
          <div className="hidden flex-1 sm:block" />
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

      {/* Unified Search Bar + Asset Toggle */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            id="stream-search"
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && search.trim()) {
                handleSearchSubmit();
              }
            }}
            placeholder="Search: '3bhk rent under 1.5L in Bandra' or 'office space 500sqft BKC'..."
            className="w-full rounded-xl border border-[color:var(--border-strong)] bg-[var(--bg-surface)] py-2.5 pl-12 pr-4 text-sm text-[var(--text-primary)] transition-all focus:border-primary focus:outline-none"
          />
          {searchSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] p-2 shadow-lg">
              {searchSuggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setSearch(s.suggestion);
                    setSearchSuggestions([]);
                    handleSearchSubmit();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-white"
                >
                  <span className="text-[10px] uppercase text-[var(--text-muted)]">{s.termType}</span>
                  Did you mean <span className="font-semibold text-primary">"{s.suggestion}"</span>?
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <button
            type="button"
            onClick={() => setFilterPropertyCategory('residential')}
            className={cn(
              'rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors sm:px-4',
              filterPropertyCategory !== 'commercial'
                ? 'border-[color:var(--accent-border)] bg-[var(--accent)] text-[#020f07]'
                : 'border-neutral-700 bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-white',
            )}
          >
            Residential
          </button>
          <button
            type="button"
            onClick={() => setFilterPropertyCategory('commercial')}
            className={cn(
              'rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors sm:px-4',
              filterPropertyCategory === 'commercial'
                ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                : 'border-neutral-700 bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-white',
            )}
          >
            Commercial
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
          >
            {showFilters ? 'Hide filters' : 'Show filters'}
            {activeFilterCount > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-black text-[#02130a]">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setShowAllItems((prev) => !prev)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors',
              showAllItems
                ? 'border-[color:var(--amber)] bg-amber-900/20 text-[var(--amber)]'
                : 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            {showAllItems ? 'Showing all' : 'Accepted only'}
          </button>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={clearAllFilters}
              className="rounded-full border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--text-primary)]"
            >
              Clear all
            </button>
          ) : null}
        </div>
        <p className="text-[11px] text-[var(--text-secondary)]">
          Filter by type, freshness, source, and broker-only signals.
        </p>
      </div>

      {showFilters ? (
        <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
          <div className="flex flex-wrap gap-2">
            {STREAM_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors',
                  isPresetActive(preset.id)
                    ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
                    : 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Signal type</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ALL_TYPES.map((type) => {
                  const active = quickTypes.includes(type as StreamItem['type']);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setQuickTypes((current) => toggleSelection(current, type as StreamItem['type']))}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors',
                        active
                          ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
                          : 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            {filterPropertyCategory === 'commercial' ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Commercial type</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ALL_COMMERCIAL_FACETS.map((facet) => {
                    const active = filterCommercialFacet === facet;
                    return (
                      <button
                        key={facet}
                        type="button"
                        onClick={() => setFilterCommercialFacet((current) => (current === facet ? 'all' : facet))}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors',
                          active
                            ? 'border-purple-500/70 bg-purple-500/20 text-purple-300'
                            : 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                        )}
                      >
                        {facet}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Configuration</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ALL_CONFIGURATIONS.map((config) => {
                    const active = filterConfiguration === config;
                    return (
                      <button
                        key={config}
                        type="button"
                        onClick={() => setFilterConfiguration((current) => (current === config ? 'all' : config))}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors',
                          active
                            ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
                            : 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                        )}
                      >
                        {config}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Freshness</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { label: '1h', band: '1h' as const },
                  { label: '6h', band: '6h' as const },
                ].map(({ label, band }) => {
                  const active = quickFreshnessBands.includes(band);
                  return (
                    <button
                      key={band}
                      type="button"
                      onClick={() => setQuickFreshnessBands((current) => toggleSelection(current, band))}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors',
                        active
                          ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
                          : 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Source</p>
              <select
                value={filterSource}
                onChange={(event) => setFilterSource(event.target.value)}
                className="mt-2 w-full rounded-xl border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none transition-colors focus:border-[color:var(--accent-border)]"
              >
                <option value="all">All sources</option>
                {uniqueSources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
              <label className="mt-3 inline-flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={brokerOnly}
                  onChange={(event) => setBrokerOnly(event.target.checked)}
                  className="h-4 w-4 rounded border-[color:var(--border)] bg-[var(--bg-base)] text-[var(--accent)]"
                />
                Broker-only text
              </label>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Time window</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(['1h', '4h', '1d', '7d'] as const).map((band) => {
                  const active = quickTimeBands.includes(band);
                  return (
                    <button
                      key={band}
                      type="button"
                      onClick={() => setQuickTimeBands((current) => toggleSelection(current, band))}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors',
                        active
                          ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
                          : 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      {band}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="glass-panel overflow-hidden rounded-2xl border-[color:var(--border)]">
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
              No broker-posted inventory or buyer records are available yet.
            </div>
          ) : (
            <>
              <div className="space-y-4 p-3 md:hidden">
                {renderedGroups.map((group) => (
                  <section key={group.locality} className="space-y-3">
                    <div className="sticky top-0 z-10 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2 text-[11px] font-semibold text-[var(--text-primary)]">
                      <div className="truncate">{group.locality}</div>
                      <div className="mt-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                        {group.listingCount} listing{group.listingCount === 1 ? '' : 's'} · {group.requirementCount} requirement{group.requirementCount === 1 ? '' : 's'}
                      </div>
                    </div>

                    {group.items.map((listing) => {
                      const isExpanded = expandedListingId === listing.id;
                      const recordLabel = getRecordLabel(listing);
                      const typeLabel = getTypeLabel(listing);
                      const snippet = buildSnippet(listing);
                      const rawNote = listing.rawText || listing.description || '';
                      const cleanNote = sanitizeBrokerText(rawNote);
                      const igrTransactions = Array.isArray(listing.igrTransactions) ? listing.igrTransactions.slice(0, 3) : [];
                      const buildingIntel = summarizeIgrBuildingIntel(listing.buildingName, listing.igrTransactions);
                      const igrQueueStatus = summarizeIgrQueueStatus(listing);
                      const showIgrQueueStatus = Boolean(String(listing.buildingName || '').trim()) && igrTransactions.length === 0 && Boolean(igrQueueStatus);
                      const commercialSummary = listing.propertyCategory === 'commercial' || listing.assetClass === 'commercial'
                        ? [listing.commercialType || listing.propertyUse || listing.assetClass, listing.fitoutStatus].filter(Boolean).join(' · ')
                        : '';
                      const primarySpec = commercialSummary || listing.configuration || formatAreaCell(listing.areaSqft) || 'Property';
                      const waLink = listing.brokerWaMeLinks?.[0] || listing.waLink;

                      return (
                        <article
                          key={listing.id}
                          data-action="stream-item"
                          onClick={() => {
                            setExpandedListingId(isExpanded ? null : listing.id);
                            if (!isExpanded && editingListingId && editingListingId !== listing.id) {
                              setEditingListingId(null);
                              setCorrectionDraft(null);
                            }
                          }}
                          className={cn(
                            'rounded-[14px] border p-3 transition-colors',
                            isExpanded
                              ? 'border-[color:var(--accent-border)] bg-[var(--bg-surface)]'
                              : 'border-[color:var(--border)] bg-[var(--bg-surface)]',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap gap-1.5">
                                <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em]', getRecordBadgeClass(recordLabel))}>
                                  {recordLabel}
                                </span>
                                <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em]', getDealBadgeClass(typeLabel))}>
                                  {typeLabel}
                                </span>
                              </div>
                              <h3 className="mt-2 text-[16px] font-semibold leading-snug text-[var(--text-primary)]">
                                {formatLocalityCell(listing.location)}
                              </h3>
                              <p className="mt-1 text-[12px] font-medium text-[var(--text-secondary)]">
                                {primarySpec}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-[13px] font-bold text-[var(--text-primary)]">
                                {normalizePriceDisplay(listing).label || 'Ask'}
                              </div>
                              <div className="mt-1 text-[10px] text-[var(--text-secondary)]">
                                {formatPostedCell(listing.createdAt)}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 space-y-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                            {listing.buildingName ? (
                              <div>Building: <span className="font-semibold text-[var(--text-primary)]">{listing.buildingName}</span></div>
                            ) : null}
                            {showIgrQueueStatus && igrQueueStatus ? (
                              <div className="inline-flex w-fit rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">
                                {igrQueueStatus.label}
                              </div>
                            ) : null}
                            {listing.microLocation ? (
                              <div>Landmark: <span className="font-semibold text-[var(--text-primary)]">{listing.microLocation}</span></div>
                            ) : null}
                            {buildingIntel ? (
                              <div>Intel: <span className="font-semibold text-[var(--text-primary)]">{buildingIntel.latest}</span></div>
                            ) : null}
                            {!snippet.isLowSignal ? (
                              <div>Signal: <span className="font-semibold text-[var(--text-primary)]">{snippet.label}</span></div>
                            ) : null}
                          </div>

                          {isExpanded ? (
                            <div className="mt-4 border-t border-[color:var(--border)] pt-3">
                              {igrTransactions.length > 0 ? (
                                <div className="mb-3 space-y-2">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">IGR Transactions</p>
                                  {igrTransactions.map((transaction) => (
                                    <div
                                      key={`${transaction.doc_number || 'txn'}-${transaction.reg_date || ''}`}
                                      className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[11px] text-[var(--text-primary)]"
                                    >
                                      {formatIgrCompact(transaction)}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Broker Note</p>
                              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[12px] leading-5 text-[var(--text-primary)]">{cleanNote || '—'}</pre>
                            </div>
                          ) : null}

                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!waLink) return;
                                window.open(waLink, '_blank', 'noopener,noreferrer');
                              }}
                              disabled={!waLink}
                              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Phone className="h-3.5 w-3.5" />
                              WA
                            </button>
                            <button
                              type="button"
                              data-action="save-to-channel"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenActionMenuId((current) => current === listing.id ? null : listing.id);
                              }}
                              className="h-10 rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2 text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--text-primary)]"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void navigator.clipboard.writeText(buildCopyText(listing));
                                setInfoMessage('Copied listing note.');
                              }}
                              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--text-primary)]"
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
                        </article>
                      );
                    })}
                  </section>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[1080px] w-full border-separate border-spacing-0 text-left">
              <thead>
                <tr className="border-b border-[color:var(--accent-border)] bg-[color:var(--propai-green-dim)]">
                  {(filterPropertyCategory === 'commercial'
                    ? ['Record', 'Type', 'Locality', 'Fit-out / Type', 'Area', 'Price', 'Workstations / Cabins', 'Floor', 'Posted', 'WA']
                    : ['Record', 'Type', 'Locality', 'Configuration', 'Area', 'Price', 'Furnishing', 'Floor', 'Posted', 'WA']
                  ).map((header) => (
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
                      colSpan={10}
                      className="border-y border-[color:var(--border)] bg-[var(--bg-base)] px-4 py-3 text-[12px] font-semibold text-[var(--text-primary)] backdrop-blur"
                    >
                      {group.locality} · {group.listingCount} listing{group.listingCount === 1 ? '' : 's'} · {group.requirementCount} requirement{group.requirementCount === 1 ? '' : 's'}
                    </td>
                  </tr>
                  {group.items.map((listing) => {
                    const isExpanded = expandedListingId === listing.id;
                    const recordLabel = getRecordLabel(listing);
                    const typeLabel = getTypeLabel(listing);
                    const rawNote = listing.rawText || listing.description || '';
                    const cleanNote = sanitizeBrokerText(rawNote);
                    const snippet = buildSnippet(listing);
                    const igrTransactions = Array.isArray(listing.igrTransactions) ? listing.igrTransactions.slice(0, 3) : [];
                    const buildingIntel = summarizeIgrBuildingIntel(listing.buildingName, listing.igrTransactions);
                    const igrQueueStatus = summarizeIgrQueueStatus(listing);
                    const showIgrQueueStatus = Boolean(String(listing.buildingName || '').trim()) && igrTransactions.length === 0 && Boolean(igrQueueStatus);

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
                          <td className="px-4 py-3 text-[13px] text-[var(--text-primary)]">
                            <div className="space-y-1">
                              <div>{formatLocalityCell(listing.location)}</div>
                              {listing.buildingName ? (
                                <div className="text-[11px] text-[var(--text-secondary)]">
                                  Building: <span className="font-semibold text-[var(--text-primary)]">{listing.buildingName}</span>
                                </div>
                              ) : null}
                              {showIgrQueueStatus && igrQueueStatus ? (
                                <div className="inline-flex w-fit rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">
                                  {igrQueueStatus.label}
                                </div>
                              ) : null}
                              {listing.microLocation ? (
                                <div className="text-[11px] text-[var(--text-secondary)]">
                                  Landmark: <span className="font-semibold text-[var(--text-primary)]">{listing.microLocation}</span>
                                </div>
                              ) : null}
                              {buildingIntel ? (
                                <div className="text-[11px] text-[var(--text-secondary)]">
                                  Intel: <span className="font-semibold text-[var(--text-primary)]">{buildingIntel.latest}</span>
                                </div>
                              ) : null}
                              {!snippet.isLowSignal ? (
                                <div className="text-[11px] text-[var(--text-secondary)]">
                                  Signal: <span className="font-semibold text-[var(--text-primary)]">{snippet.label}</span>
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[13px] text-[var(--text-primary)]">
                             {filterPropertyCategory === 'commercial'
                               ? (() => {
                                   const type = listing.commercialType || listing.propertyUse || listing.assetClass || '—';
                                   const fitout = listing.fitoutStatus ? ` (${listing.fitoutStatus})` : '';
                                   return `${type}${fitout}`;
                                 })()
                               : (listing.configuration || '—')}
                           </td>
                           <td className="px-4 py-3 text-[13px] text-[var(--text-primary)]">{formatAreaCell(listing.areaSqft)}</td>
                           <td className="px-4 py-3 text-[13px] font-semibold text-[var(--text-primary)]">{normalizePriceDisplay(listing).label || 'Price on request'}</td>
                           <td className="px-4 py-3 text-[13px] text-[var(--text-primary)]">
                             {filterPropertyCategory === 'commercial'
                               ? (() => {
                                   const ws = listing.workstationsCount;
                                   const cabins = listing.cabinsCount;
                                   if (ws || cabins) {
                                     return `${ws || '—'} Seats / ${cabins || '—'} Cabins`;
                                   }
                                   return listing.furnishing || '—';
                                 })()
                               : formatFurnishingCell(listing.furnishing)}
                           </td>
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
                            <td colSpan={10} className="px-4 pb-5 pt-1">
                              <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-base)] p-4">
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="space-y-3">
                                    {buildingIntel ? (
                                      <div className="rounded-[16px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)]/30 p-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">Building intel</p>
                                        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="text-[14px] font-semibold text-[var(--text-primary)]">
                                              {buildingIntel.title}
                                            </p>
                                            <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                                              {buildingIntel.subtitle}
                                              {buildingIntel.locality ? ` · ${buildingIntel.locality}` : ''}
                                            </p>
                                          </div>
                                          <div className="text-right">
                                            <p className="text-[11px] font-semibold text-[var(--text-primary)]">
                                              {buildingIntel.latest}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    ) : null}
                                    {listing.microLocation ? (
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Landmark</p>
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
                                    ) : showIgrQueueStatus && igrQueueStatus ? (
                                      <div className="rounded-[14px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)]/30 px-3 py-3">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">{igrQueueStatus.label}</p>
                                        <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                                          {igrQueueStatus.detail} Transactions will appear here after the Maharashtra IGR fetch succeeds.
                                        </p>
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
              </div>
            </>
          )}

        <div ref={sentinelRef} className="px-6 py-4 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
          {hasMore
            ? `${renderedStream.length} of ${visibleStream.length} loaded. More items appear as you scroll.`
            : `Showing latest ${renderedStream.length.toLocaleString('en-IN')} items`}
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
