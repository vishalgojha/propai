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

export async function rebuildStreamFromSavedMessages(limit = 500, sessionLabel?: string | null, remoteJid?: string | null, asyncReplay = false) {
  const response = await backendApi.post(ENDPOINTS.channels.rebuild, {
    limit,
    sessionLabel: sessionLabel || undefined,
    remoteJid: remoteJid || undefined,
    async: asyncReplay,
  });
  return response.data as {
    success: boolean;
    async?: boolean;
    queued?: boolean;
    status?: string;
    scopeKey?: string;
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
    configuration: string;
    source: string;
    sourcePhone?: string | null;
    recordType?: string;
    dealType?: string;
    assetClass?: string;
    parseNotes?: string;
  },
) {
  const response = await backendApi.post(ENDPOINTS.channels.correct(streamItemId), payload);
  return response.data as { success: boolean; item: StreamItem };
}
