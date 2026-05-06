import { supabase } from '../../config/supabase';
import type { Lead, LeadStatus, FollowUp, LeadFilters, LeadStats } from './types';

export class LeadsAPI {
  async getLeads(tenantId: string, filters?: LeadFilters): Promise<Lead[]> {
    let query = supabase
      .from('lead_records')
      .select('*')
      .eq('tenant_id', tenantId);

    if (filters?.status && filters.status.length > 0) {
      query = query.in('status', filters.status);
    }

    if (filters?.priority && filters.priority.length > 0) {
      query = query.in('priority', filters.priority);
    }

    if (filters?.location) {
      query = query.ilike('location', `%${filters.location}%`);
    }

    if (filters?.minBudget) {
      query = query.gte('budget_numeric', filters.minBudget);
    }

    if (filters?.maxBudget) {
      query = query.lte('budget_numeric', filters.maxBudget);
    }

    if (filters?.overdue) {
      query = query.lt('next_followup_at', new Date().toISOString());
    }

    if (filters?.source) {
      query = query.eq('source', filters.source);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.map(this.mapToLead);
  }

  private mapToLead(data: any): Lead {
    return {
      id: data.id,
      name: data.name || '',
      phone: data.phone || '',
      email: data.email || undefined,
      budget: data.budget_label || undefined,
      budgetNumeric: data.budget_numeric || undefined,
      location: data.location || undefined,
      city: data.city || undefined,
      propertyType: data.property_type || undefined,
      bhk: data.bhk || undefined,
      status: data.status || 'new',
      priority: data.priority || 'medium',
      source: data.source || undefined,
      notes: data.notes || undefined,
      lastContactedAt: data.last_contacted_at || undefined,
      nextFollowUpAt: data.next_followup_at || undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
}
