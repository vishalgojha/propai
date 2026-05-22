import { supabase } from '../../config/supabase';
import type { StreamItem, StreamFilters, StreamStats, StreamChannel } from './types';

function isMissingIngestionStatusError(message?: string | null) {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('ingestion_status') && (
    normalized.includes('does not exist') ||
    normalized.includes('schema cache') ||
    normalized.includes('column')
  );
}

export class StreamAPI {
  async getStreamItems(
    tenantId: string,
    networkMode = false,
    filters?: StreamFilters,
  ): Promise<{ items: StreamItem[]; network_mode: boolean; total: number }> {
    let tenantIds = [tenantId];
    if (networkMode) {
      const { data: layer2Tenants } = await supabase
        .from('subscriptions')
        .select('tenant_id')
        .in('plan', ['Pro'])
        .eq('status', 'active');

      tenantIds = Array.from(new Set([
        tenantId,
        ...((layer2Tenants || []).map((row: any) => String(row.tenant_id || '')).filter(Boolean)),
      ]));
    }

    const applyFilters = (query: any) => {
      if (filters?.type && filters.type.length > 0) {
        try {
          query = query.in('type', filters.type);
        } catch (e) {
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

      return query;
    };

    let query = applyFilters(
      supabase
        .from('stream_items')
        .select('*')
        .in('tenant_id', tenantIds)
        .eq('ingestion_status', 'accepted')
    );

    let { data, error } = await query.order('created_at', { ascending: false });
    if (error && isMissingIngestionStatusError(error.message)) {
      query = applyFilters(
        supabase
          .from('stream_items')
          .select('*')
          .in('tenant_id', tenantIds)
      );
      ({ data, error } = await query.order('created_at', { ascending: false }));
    }

    if (error || !data || !Array.isArray(data)) {
      return { items: [], network_mode: networkMode, total: 0 };
    }

    const items = data.map((item) => this.mapToStreamItem(item, tenantId));
    return {
      items,
      network_mode: networkMode,
      total: items.length,
    };
  }

  private generateWaLink(data: any, brokerName: string | null, brokerPhone: string | null): string | null {
    const phone = String(brokerPhone || '').replace(/\D/g, '');
    if (!phone) {
      return null;
    }

    const bhk = String(data.bhk || '').trim() || 'a property';
    const locality = String(data.locality || data.parsed_payload?.locality || '').trim() || 'the target locality';
    const building = String(
      data.parsed_payload?.building ||
      data.parsed_payload?.buildingName ||
      data.parsed_payload?.projectName ||
      '',
    ).trim();
    const assetType = String(
      data.parsed_payload?.propertyUse ||
      data.property_use ||
      data.asset_class ||
      data.property_category ||
      data.bhk ||
      'property'
    ).trim();
    const price = String(data.price_label || data.parsed_payload?.price || data.parsed_payload?.budget || '').trim() || 'the discussed budget';
    const greeting = `Hi ${brokerName || 'there'}, found you on propai live. `;
    const isRequirement = String(data.record_type || data.type || '').trim().toLowerCase() === 'requirement';
    const text = isRequirement
      ? `${greeting}Regarding your requirement for ${assetType} in ${locality}${price ? ` around ₹${price}` : ''}, I may have something relevant.`
      : `${greeting}Regarding your listing for ${bhk || assetType}${building ? ` at ${building}` : ''} in ${locality}${price ? ` at ₹${price}` : ''}, is it still available?`;

    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  private mapToStreamItem(data: any, currentTenantId: string): StreamItem {
    const brokerPhone = data.source_phone || data.parsed_payload?.sourcePhone || data.parsed_payload?.contactPhone || null;
    const brokerName =
      data.broker_name ||
      data.parsed_payload?.brokerName ||
      data.parsed_payload?.sender_name ||
      null;
    const brokerCompany =
      data.parsed_payload?.brokerCompany ||
      data.parsed_payload?.company ||
      null;
    const source =
      data.parsed_payload?.contactName ||
      data.parsed_payload?.sourceLabel ||
      brokerName ||
      brokerCompany ||
      'Broker contact';

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
      source,
      brokerName,
      brokerCompany,
      waLink: this.generateWaLink(data, brokerName, brokerPhone),
      isNetworkItem: String(data.tenant_id || '') !== currentTenantId,
      isRead: data.is_read || false,
      createdAt: data.created_at,
    };
  }

  async getStats(tenantId: string): Promise<StreamStats> {
    let { data, error } = await supabase
      .from('stream_items')
      .select('confidence_score, is_read')
      .eq('tenant_id', tenantId)
      .eq('ingestion_status', 'accepted');

    if (error && isMissingIngestionStatusError(error.message)) {
      ({ data, error } = await supabase
        .from('stream_items')
        .select('confidence_score, is_read')
        .eq('tenant_id', tenantId));
    }

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
    let { data, error } = await supabase
      .from('stream_items')
      .select('source_phone')
      .eq('tenant_id', tenantId)
      .eq('ingestion_status', 'accepted');

    if (error && isMissingIngestionStatusError(error.message)) {
      ({ data, error } = await supabase
        .from('stream_items')
        .select('source_phone')
        .eq('tenant_id', tenantId));
    }

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
