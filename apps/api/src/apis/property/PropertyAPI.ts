import { supabase } from '../../config/supabase';
import type { PropertyItem, PropertyFilters, PropertyStats } from './types';

export class PropertyAPI {
  async getProperties(tenantId: string, filters?: PropertyFilters): Promise<PropertyItem[]> {
    let query = supabase
      .from('stream_items')
      .select('*')
      .eq('tenant_id', tenantId);

    if (filters?.type && filters.type.length > 0) {
      query = query.in('type', filters.type);
    }

    if (filters?.category) {
      query = query.eq('property_category', filters.category);
    }

    if (filters?.bhk && filters.bhk !== 'all') {
      query = query.eq('bhk', filters.bhk);
    }

    if (filters?.minPrice) {
      query = query.gte('price_numeric', filters.minPrice);
    }

    if (filters?.maxPrice) {
      query = query.lte('price_numeric', filters.maxPrice);
    }

    if (filters?.minArea) {
      query = query.gte('area_sqft', filters.minArea);
    }

    if (filters?.source && filters.source !== 'all') {
      query = query.eq('source_phone', filters.source);
    }

    if (filters?.confidenceMin) {
      query = query.gte('confidence_score', filters.confidenceMin);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.map(this.mapToPropertyItem);
  }

  private mapToPropertyItem(data: any): PropertyItem {
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
      propertyUse: data.property_use || undefined,
      confidence: data.confidence_score || 0,
      source: data.source_phone || '',
      sourcePhone: data.source_phone || undefined,
      isRead: data.is_read || false,
      createdAt: data.created_at,
    };
  }
}
