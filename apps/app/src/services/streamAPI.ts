import backendApi from './api';
import { ENDPOINTS } from './endpoints';

export interface StreamItem {
  id: string;
  type: 'Rent' | 'Sale' | 'Requirement' | 'Pre-leased' | 'Lease';
  title?: string;
  location: string;
  buildingName?: string | null;
  microLocation?: string | null;
  city?: string;
  price: string;
  priceNumeric?: number | null;
  bhk: string;
  posted?: string;
  description?: string;
  rawText?: string;
  parseNotes?: string;
  recordType?: string;
  dealType?: string;
  assetClass?: string;
  furnishing?: string;
  propertyCategory?: 'residential' | 'commercial';
  areaSqft?: number | null;
  confidence: number;
  source: string;
  brokerName?: string | null;
  brokerCompany?: string | null;
  waLink?: string | null;
  isNetworkItem?: boolean;
  isSyndicated?: boolean;
  sourceWorkspaceId?: string;
  sourceWorkspaceName?: string;
  isRead?: boolean;
  createdAt: string;
  igrTransactions?: IgrTransactionPreview[];
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

export interface StreamResponse {
  items: StreamItem[];
  network_mode: boolean;
  total: number;
}

export interface StreamSummaryResponse {
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
  minConfidence?: number;
  source?: string;
  sessionLabel?: string;
  channelId?: string;
  isRead?: boolean;
  search?: string;
  limit?: number;
}

export async function fetchStreamItems(filters?: StreamFilters): Promise<StreamResponse> {
  const params: Record<string, any> = {};
  
  if (filters?.type && filters.type.length > 0) {
    params.type = filters.type.join(',');
  }
  if (filters?.category) params.category = filters.category;
  if (filters?.locality) params.locality = filters.locality;
  if (filters?.minConfidence) params.minConfidence = filters.minConfidence;
  if (filters?.source && filters.source !== 'all') params.source = filters.source;
  if (filters?.sessionLabel && filters.sessionLabel !== 'all') params.sessionLabel = filters.sessionLabel;
  if (filters?.channelId) params.channelId = filters.channelId;
  if (filters?.isRead !== undefined) params.isRead = filters.isRead;
  if (filters?.search) params.search = filters.search;
  if (filters?.limit) params.limit = filters.limit;

  const response = await backendApi.get(ENDPOINTS.channels.stream, { params, timeout: 60000 });
  return {
    items: Array.isArray(response.data?.items) ? response.data.items as StreamItem[] : [],
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
  avgConfidence: number;
}> {
  try {
    const response = await backendApi.get(ENDPOINTS.streamItems.stats);
    return {
      total: Number(response.data?.total || 0),
      byType: {},
      byCategory: {},
      unreadCount: Number(response.data?.unread || 0),
      avgConfidence: Number(response.data?.avgConfidence || 0),
    };
  } catch {
    return {
      total: 0,
      byType: {},
      byCategory: {},
      unreadCount: 0,
      avgConfidence: 0,
    };
  }
}
