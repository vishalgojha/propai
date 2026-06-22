import backendApi from './api';
import { ENDPOINTS } from './endpoints';

export interface StreamItem {
  id: string;
  refNo?: string;
  type: 'Rent' | 'Sale' | 'Requirement' | 'Pre-leased' | 'Lease';
  title?: string;
  location: string;
  buildingName?: string | null;
  microLocation?: string | null;
  city?: string;
  price: string;
  priceNumeric?: number | null;
  configuration: string;
  posted?: string;
  description?: string;
  rawText?: string;
  recordType?: string;
  dealType?: string;
  assetClass?: string;
  furnishing?: string;
  floorNumber?: string | null;
  totalFloors?: string | null;
  propertyUse?: string | null;
  propertyCategory?: 'residential' | 'commercial';
  commercialType?: string | null;
  fitoutStatus?: string | null;
  workstationsCount?: number | null;
  cabinsCount?: number | null;
  areaSqft?: number | null;
  source: string;
  sourcePhone?: string | null;
  brokerName?: string | null;
  brokerCompany?: string | null;
  waLink?: string | null;
  brokerWaMeLinks?: string[] | null;
  brokerContacts?: Array<{ name: string | null; phone: string; waLink: string }> | null;
  isNetworkItem?: boolean;
  isSyndicated?: boolean;
  sourceWorkspaceId?: string;
  sourceWorkspaceName?: string;
  isRead?: boolean;
  createdAt: string;
  igrTransactions?: IgrTransactionPreview[];
  igrQueueStatus?: IgrQueueStatusPreview | null;
  ingestionStatus?: string;
  suppressionReason?: string | null;
}

export interface IgrTransactionPreview {
  doc_number: string | null;
  reg_date: string | null;
  building_name: string | null;
  locality: string | null;
  consideration: number | null;
  area_sqft: number | null;
  price_per_sqft: number | null;
  config: string | null;
}

export interface IgrQueueStatusPreview {
  status: 'pending' | 'done' | 'failed';
  buildingName: string;
  locality: string | null;
  city: string | null;
  queuedAt: string;
  lastCheckedAt: string | null;
  nextRetryAt: string | null;
}

export interface StreamResponse {
  items: StreamItem[];
  network_mode: boolean;
  total: number;
}

export interface InboxMatch {
  id: string;
  sourceItem: StreamItem;
  matchedItem: StreamItem;
  isRead: boolean;
  createdAt: string;
}

export interface InboxMatchesResponse {
  items: InboxMatch[];
  network_mode: boolean;
  total: number;
}

export interface StreamSummaryResponse {
  fifteenMinutes: number;
  oneHour: number;
  fourHours: number;
  oneDay: number;
  sevenDays: number;
  allTime: number;
  network_mode: boolean;
}

export interface StreamFilters {
  type?: string[];
  category?: 'residential' | 'commercial';
  locality?: string;
  timeBand?: Array<'1h' | '4h' | '1d' | '7d'>;
  freshnessBand?: Array<'1h' | '6h'>;
  source?: string;
  sessionLabel?: string;
  channelId?: string;
  isRead?: boolean;
  search?: string;
  configuration?: string;
  brokerOnly?: boolean;
  limit?: number;
  showAll?: boolean;
}

export interface FuzzySuggestion {
  suggestion: string;
  termType: string;
  similarity: number;
}

export interface SearchResponse {
  items: StreamItem[];
  total: number;
  suggestions: FuzzySuggestion[];
  network_mode: boolean;
}

export async function searchStream(
  assetClass: 'residential' | 'commercial',
  queryString: string,
  limit = 50,
  offset = 0,
): Promise<SearchResponse> {
  const response = await backendApi.post(ENDPOINTS.channels.search, {
    asset_class: assetClass,
    query_string: queryString,
    limit,
    offset,
  }, { timeout: 30000 });

  return {
    items: Array.isArray(response.data?.items) ? response.data.items as StreamItem[] : [],
    total: Number(response.data?.total || 0),
    suggestions: Array.isArray(response.data?.suggestions) ? response.data.suggestions as FuzzySuggestion[] : [],
    network_mode: Boolean(response.data?.network_mode),
  };
}

export async function fetchStreamItems(filters?: StreamFilters): Promise<StreamResponse> {
  const params: Record<string, any> = {};
  
  if (filters?.type && filters.type.length > 0) {
    params.type = filters.type.join(',');
  }
  if (filters?.category) params.category = filters.category;
  if (filters?.locality) params.locality = filters.locality;
  if (filters?.configuration && filters.configuration !== 'all') params.configuration = filters.configuration;
  if (filters?.timeBand && filters.timeBand.length > 0) params.timeBand = filters.timeBand.join(',');
  if (filters?.freshnessBand && filters.freshnessBand.length > 0) params.freshnessBand = filters.freshnessBand.join(',');
  if (filters?.source && filters.source !== 'all') params.source = filters.source;
  if (filters?.sessionLabel && filters.sessionLabel !== 'all') params.sessionLabel = filters.sessionLabel;
  if (filters?.channelId) params.channelId = filters.channelId;
  if (filters?.isRead !== undefined) params.isRead = filters.isRead;
  if (filters?.search) params.search = filters.search;
  if (filters?.brokerOnly) params.brokerOnly = 'true';
  if (filters?.limit) params.limit = filters.limit;
  if (filters?.showAll) params.showAll = 'true';

  const response = await backendApi.get(ENDPOINTS.channels.stream, { params, timeout: 60000 });
  return {
    items: Array.isArray(response.data?.items) ? response.data.items as StreamItem[] : [],
    network_mode: Boolean(response.data?.network_mode),
    total: Number(response.data?.total || 0),
  };
}

export async function fetchInboxMatches(limit = 200): Promise<InboxMatchesResponse> {
  const response = await backendApi.get(ENDPOINTS.channels.inbox, { params: { limit }, timeout: 60000 });
  return {
    items: Array.isArray(response.data?.items) ? response.data.items as InboxMatch[] : [],
    network_mode: Boolean(response.data?.network_mode),
    total: Number(response.data?.total || 0),
  };
}

export async function fetchStreamSummary(filters?: Pick<StreamFilters, 'sessionLabel' | 'channelId'>): Promise<StreamSummaryResponse> {
  const params: Record<string, any> = {};
  if (filters?.sessionLabel && filters.sessionLabel !== 'all') params.sessionLabel = filters.sessionLabel;
  if (filters?.channelId) params.channelId = filters.channelId;

  const response = await backendApi.get(ENDPOINTS.channels.streamSummary, { params, timeout: 60000 });
  return {
    fifteenMinutes: Number(response.data?.fifteenMinutes || 0),
    oneHour: Number(response.data?.oneHour || 0),
    fourHours: Number(response.data?.fourHours || 0),
    oneDay: Number(response.data?.oneDay || 0),
    sevenDays: Number(response.data?.sevenDays || 0),
    allTime: Number(response.data?.allTime || 0),
    network_mode: Boolean(response.data?.network_mode),
  };
}

export async function markStreamItemRead(itemId: string): Promise<boolean> {
  try {
    await backendApi.post(ENDPOINTS.streamItems.read(itemId));
    return true;
  } catch {
    return false;
  }
}

export async function correctStreamItem(
  itemId: string,
  updates: Record<string, unknown>
): Promise<{ success: boolean; item: StreamItem } | null> {
  try {
    const response = await backendApi.post(ENDPOINTS.channels.correct(itemId), updates);
    return response.data as { success: boolean; item: StreamItem };
  } catch {
    return null;
  }
}

export async function fetchStreamStats(): Promise<{
  total: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  unreadCount: number;
}> {
  try {
    const response = await backendApi.get(ENDPOINTS.streamItems.stats);
    return {
      total: Number(response.data?.total || 0),
      byType: {},
      byCategory: {},
      unreadCount: Number(response.data?.unread || 0),
    };
  } catch {
    return {
      total: 0,
      byType: {},
      byCategory: {},
      unreadCount: 0,
    };
  }
}
