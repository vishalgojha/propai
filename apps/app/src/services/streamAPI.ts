import backendApi from './api';
import { ENDPOINTS } from './endpoints';

export interface StreamItem {
  id: string;
  type: 'Rent' | 'Sale' | 'Requirement' | 'Pre-leased' | 'Lease';
  title?: string;
  location: string;
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
  propertyCategory?: 'residential' | 'commercial';
  areaSqft?: number | null;
  confidence: number;
  source: string;
  sourcePhone?: string | null;
  isRead?: boolean;
  createdAt: string;
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
}

export async function fetchStreamItems(filters?: StreamFilters): Promise<StreamItem[]> {
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

  const response = await backendApi.get(ENDPOINTS.channels.stream, { params });
  return (Array.isArray(response.data) ? response.data : []) as StreamItem[];
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
  updates: Partial<StreamItem>
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
