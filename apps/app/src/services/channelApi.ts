import backendApi from './api';
import { ENDPOINTS } from './endpoints';

export type PersonalChannel = {
  id: string;
  name: string;
  slug: string;
  channelType: 'listing' | 'requirement' | 'mixed';
  localities: string[];
  keywords: string[];
  keywordsExclude: string[];
  dealTypes: string[];
  recordTypes: string[];
  bhkValues: string[];
  assetClasses: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  confidenceMin: number;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  itemCount: number;
};

export type CreateChannelPayload = {
  name?: string;
  channelType?: 'listing' | 'requirement' | 'mixed';
  localities?: string[];
  keywords?: string[];
  keywordsExclude?: string[];
  dealTypes?: string[];
  recordTypes?: string[];
  bhkValues?: string[];
  assetClasses?: string[];
  budgetMin?: number | null;
  budgetMax?: number | null;
  confidenceMin?: number | null;
  pinned?: boolean;
};

export async function fetchChannels() {
  const response = await backendApi.get(ENDPOINTS.channels.list);
  return Array.isArray(response.data) ? (response.data as PersonalChannel[]) : [];
}

export async function createChannel(payload: CreateChannelPayload) {
  const response = await backendApi.post(ENDPOINTS.channels.create, payload);
  return response.data as PersonalChannel;
}

export async function markChannelRead(channelId: string) {
  await backendApi.post(ENDPOINTS.channels.markRead(channelId));
}

export async function attachStreamItemToChannel(channelId: string, streamItemId: string) {
  await backendApi.post(ENDPOINTS.channels.attachItem(channelId), { streamItemId });
}
