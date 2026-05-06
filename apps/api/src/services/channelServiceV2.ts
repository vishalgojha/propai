import { streamAPI } from '../apis';
import type {
  PersonalChannelRecord,
  StreamItemRecord,
  CreateChannelInput,
} from './channelService';

export class ChannelServiceV2 {
  async getStreamItems(tenantId: string, filters?: {
    channelId?: string;
    sessionLabel?: string;
    type?: string[];
    category?: 'residential' | 'commercial';
    minConfidence?: number;
  }): Promise<StreamItemRecord[]> {
    const apiFilters: any = {};
    
    if (filters?.type && filters.type.length > 0) {
      apiFilters.type = filters.type;
    }
    if (filters?.category) {
      apiFilters.category = filters.category;
    }
    if (filters?.minConfidence) {
      apiFilters.minConfidence = filters.minConfidence;
    }

    return streamAPI.getStreamItems(tenantId, apiFilters) as any;
  }

  async getStreamStats(tenantId: string) {
    return streamAPI.getStats(tenantId);
  }

  async correctStreamItem(
    tenantId: string,
    streamItemId: string,
    updates: Partial<StreamItemRecord>
  ) {
    return streamAPI.correctItem(tenantId, streamItemId, updates as any);
  }

  async markItemAsRead(tenantId: string, itemId: string) {
    return streamAPI.markAsRead(tenantId, itemId);
  }

  async getChannels(tenantId: string) {
    return streamAPI.getChannels(tenantId);
  }
}
