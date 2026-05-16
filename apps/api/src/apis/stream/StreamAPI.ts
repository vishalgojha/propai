import { supabase } from '../../config/supabase';
import type { StreamItem, StreamFilters, StreamStats, StreamChannel } from './types';

export class StreamAPI {
  async getStreamItems(tenantId: string, filters?: StreamFilters): Promise<StreamItem[]> {
    let query = supabase
      .from('stream_items')
      .select('*')
      .eq('tenant_id', tenantId);

    if (filters?.type && filters.type.length > 0) {
      // 'type' column might not exist in stream_items table on some deployments.
      try {
        query = query.in('type', filters.type);
      } catch (e) {
        // Ignore type filter if column does not exist
      }
    }

    if (filters?.category) {
      query = query.eq('property_category', filters.category);
    }

    if (filters?.locality) {
      query = query.ilike('locality', `%${filters.locality}%`);
    }

    if (filters?.minConfidence) {
      query = query.gte('confidence_score', filters.minConfidence);
    }

    if (filters?.source && filters.source !== 'all') {
      query = query.eq('source_phone', filters.source);
    }

    if (filters?.isRead !== undefined) {
      query = query.eq('is_read', filters.isRead);
    }

    if (filters?.search) {
      const search = `%${filters.search.toLowerCase()}%`;
      query = query.or(`locality.ilike.${search},title.ilike.${search},raw_text.ilike.${search}`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error || !data) return [];
    if (!Array.isArray(data)) return [];
    return data.map(this.mapToStreamItem);
  }

  private mapToStreamItem(data: any): StreamItem {
    const phone = data.source_phone || '';
    const masked = phone ? `${phone.slice(0, 5)} •••••` : null;
    return {
      id: data.id,
      type: data.type,
      title: data.parsed_payload?.displayTitle || undefined,
      location: data.locality || '',
      city: data.city || undefined,
      price: data.price_label || '',
      priceNumeric: data.price_numeric || undefined,
      bhk: data.bhk || '',
      propertyCategory: data.property_category || 'residential',
      areaSqft: data.area_sqft || undefined,
      confidence: data.confidence_score || 0,
      source: data.source_phone || '',
      brokerPhoneMasked: masked,
      isRead: data.is_read || false,
      createdAt: data.created_at,
    };
  }

  async getStats(tenantId: string): Promise<StreamStats> {
    const { data, error } = await supabase
      .from('stream_items')
      .select('confidence_score, is_read')
      .eq('tenant_id', tenantId);

    if (error || !data) return { total: 0, unread: 0, avgConfidence: 0 };
    if (!Array.isArray(data)) return { total: 0, unread: 0, avgConfidence: 0 };

    const total = data.length;
    const unread = data.filter((item: any) => !item.is_read).length;
    const avgConfidence = total > 0
      ? data.reduce((sum: number, item: any) => sum + (item.confidence_score || 0), 0) / total
      : 0;

    return { total, unread, avgConfidence };
  }

  async markAsRead(tenantId: string, itemId: string): Promise<void> {
    await supabase
      .from('stream_items')
      .update({ is_read: true })
      .eq('id', itemId)
      .eq('tenant_id', tenantId);
  }

  async correctItem(tenantId: string, itemId: string, corrections: Partial<StreamItem>): Promise<void> {
    const updateData: any = {};
    if (corrections.type) updateData.type = corrections.type;
    if (corrections.propertyCategory) updateData.property_category = corrections.propertyCategory;
    if (corrections.bhk) updateData.bhk = corrections.bhk;
    if (corrections.priceNumeric) updateData.price_numeric = corrections.priceNumeric;
    if (corrections.areaSqft) updateData.area_sqft = corrections.areaSqft;

    await supabase
      .from('stream_items')
      .update(updateData)
      .eq('id', itemId)
      .eq('tenant_id', tenantId);
  }

  async getChannels(tenantId: string): Promise<StreamChannel[]> {
    const { data, error } = await supabase
      .from('stream_items')
      .select('source_phone')
      .eq('tenant_id', tenantId);

    if (error || !data) return [];
    if (!Array.isArray(data)) return [];

    const channelMap = new Map<string, number>();
    data.forEach((item: any) => {
      const phone = item.source_phone || 'unknown';
      channelMap.set(phone, (channelMap.get(phone) || 0) + 1);
    });

    return Array.from(channelMap.entries()).map(([phone, count]) => ({
      phone,
      label: phone,
      count,
    }));
  }
}
