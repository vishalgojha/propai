import backendApi from './api';
import { ENDPOINTS } from './endpoints';
import type { StreamItem } from '../data/mockStream';

export async function fetchLiveStreamItems(channelId?: string | null, sessionLabel?: string | null) {
  const params: Record<string, any> = {};
  if (channelId) params.channelId = channelId;
  if (sessionLabel) params.sessionLabel = sessionLabel;

  const response = await backendApi.get(ENDPOINTS.channels.stream, { params });
  return (Array.isArray(response.data) ? response.data : []) as StreamItem[];
}

export async function rebuildStreamFromSavedMessages(limit = 500) {
  const response = await backendApi.post(ENDPOINTS.channels.rebuild, { limit });
  return response.data as {
    success: boolean;
    scanned: number;
    ingested: number;
    totalStreamItems: number;
  };
}

export async function correctStreamItem(
  streamItemId: string,
  payload: {
    type: StreamItem['type'];
    location: string;
    city?: string;
    price: string;
    priceNumeric?: number | null;
    bhk: string;
    source: string;
    sourcePhone?: string | null;
    recordType?: string;
    dealType?: string;
    assetClass?: string;
    confidence: number;
    parseNotes?: string;
  },
) {
  const response = await backendApi.post(ENDPOINTS.channels.correct(streamItemId), payload);
  return response.data as { success: boolean; item: StreamItem };
}
