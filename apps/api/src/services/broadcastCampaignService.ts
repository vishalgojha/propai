import { supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin;

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed' | 'cancelled';
export type RecipientStatus = 'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'blocked';

export interface CreateCampaignInput {
  tenantId: string;
  name: string;
  message: string;
  mediaUrl?: string;
  audienceType: 'list' | 'segment' | 'custom' | 'all';
  listId?: string;
  segmentCriteria?: Record<string, unknown>;
  customPhones?: string[];
  scheduledAt?: string;
  rateLimitPerHour?: number;
  delayBetweenMessagesMs?: number;
  acceptedRisk: boolean;
  createdBy?: string;
}

export interface CampaignRecord {
  id: string;
  tenant_id: string;
  name: string;
  message: string;
  media_url: string | null;
  audience_type: string;
  list_id: string | null;
  segment_criteria: Record<string, unknown> | null;
  custom_phones: string[] | null;
  total_recipients: number;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  rate_limit_per_hour: number;
  delay_between_messages_ms: number;
  accepted_risk: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignStats {
  total: number;
  pending: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  blocked: number;
}

export interface CampaignWithStats extends CampaignRecord {
  stats: CampaignStats | null;
}

export class BroadcastCampaignService {
  async create(input: CreateCampaignInput): Promise<CampaignRecord> {
    if (!db) throw new Error('Database admin client is not configured');

    const { data, error } = await db
      .from('broadcast_campaigns')
      .insert({
        tenant_id: input.tenantId,
        name: input.name,
        message: input.message,
        media_url: input.mediaUrl || null,
        audience_type: input.audienceType,
        list_id: input.listId || null,
        segment_criteria: input.segmentCriteria || null,
        custom_phones: input.customPhones || null,
        scheduled_at: input.scheduledAt || null,
        rate_limit_per_hour: input.rateLimitPerHour || 100,
        delay_between_messages_ms: input.delayBetweenMessagesMs || 5000,
        accepted_risk: input.acceptedRisk,
        created_by: input.createdBy || null,
        status: input.scheduledAt ? 'scheduled' : 'draft',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async getById(campaignId: string): Promise<CampaignWithStats | null> {
    if (!db) throw new Error('Database admin client is not configured');

    const { data: campaign, error } = await db
      .from('broadcast_campaigns')
      .select()
      .eq('id', campaignId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!campaign) return null;

    const { data: stats } = await db
      .from('broadcast_campaign_stats')
      .select()
      .eq('campaign_id', campaignId)
      .maybeSingle();

    return { ...campaign, stats: stats || null };
  }

  async listByTenant(tenantId: string, status?: string): Promise<CampaignRecord[]> {
    if (!db) throw new Error('Database admin client is not configured');

    let query = db
      .from('broadcast_campaigns')
      .select()
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }

  async delete(campaignId: string, tenantId: string): Promise<void> {
    if (!db) throw new Error('Database admin client is not configured');

    const { error } = await db
      .from('broadcast_campaigns')
      .delete()
      .eq('id', campaignId)
      .eq('tenant_id', tenantId);

    if (error) throw new Error(error.message);
  }

  async cancel(campaignId: string, tenantId: string): Promise<CampaignRecord> {
    if (!db) throw new Error('Database admin client is not configured');

    const { data, error } = await db
      .from('broadcast_campaigns')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .in('status', ['draft', 'scheduled', 'sending'])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async populateRecipients(campaignId: string, tenantId: string): Promise<number> {
    if (!db) throw new Error('Database admin client is not configured');

    const { data: campaign, error: campaignError } = await db
      .from('broadcast_campaigns')
      .select()
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .eq('status', 'draft')
      .maybeSingle();

    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) throw new Error('Campaign not found or not in draft status');

    let phones: string[] = [];

    if (campaign.audience_type === 'list' && campaign.list_id) {
      const { data: list, error: listError } = await db
        .from('broadcast_lists')
        .select('id')
        .eq('id', campaign.list_id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (listError) throw new Error(listError.message);
      if (!list) {
        throw new Error('Broadcast list not found for this workspace');
      }

      const { data: contacts, error: contactError } = await db
        .from('broadcast_list_contacts')
        .select('contact_id')
        .eq('list_id', campaign.list_id);

      if (contactError) throw new Error(contactError.message);

      if (contacts?.length) {
        const contactIds = contacts.map((c: any) => c.contact_id);
        const { data: brokerContacts, error: brokerError } = await db
          .from('broker_contacts')
          .select('id, phone')
          .in('id', contactIds)
          .eq('tenant_id', tenantId)
          .eq('unsubscribed', false);

        if (brokerError) throw new Error(brokerError.message);
        phones = (brokerContacts || []).map((c: any) => c.phone);
      }
    } else if (campaign.audience_type === 'segment' && campaign.segment_criteria) {
      const criteria = campaign.segment_criteria as Record<string, unknown>;
      let query = db
        .from('broker_contacts')
        .select('phone')
        .eq('tenant_id', tenantId)
        .eq('unsubscribed', false);

      if (criteria.locality && Array.isArray(criteria.locality) && (criteria.locality as string[]).length > 0) {
        query = query.overlaps('inferred_areas', criteria.locality);
      }
      if (criteria.bhk && Array.isArray(criteria.bhk) && (criteria.bhk as string[]).length > 0) {
        query = query.overlaps('bhk_types', criteria.bhk);
      }
      if (criteria.budget_max && typeof criteria.budget_max === 'number') {
        query = query.or(`price_range_high.is.null,price_range_high.gte.${criteria.budget_max}`);
      }
      if (criteria.budget_min && typeof criteria.budget_min === 'number') {
        query = query.or(`price_range_low.is.null,price_range_low.lte.${criteria.budget_min}`);
      }
      if (criteria.last_seen_days && typeof criteria.last_seen_days === 'number') {
        const cutoff = new Date(Date.now() - (criteria.last_seen_days as number) * 86400000).toISOString();
        query = query.gte('last_seen_at', cutoff);
      }

      const { data: contacts, error: segmentError } = await query;
      if (segmentError) throw new Error(segmentError.message);
      phones = (contacts || []).map((c: any) => c.phone);
    } else if (campaign.audience_type === 'custom' && Array.isArray(campaign.custom_phones)) {
      phones = campaign.custom_phones;
    } else if (campaign.audience_type === 'all') {
      const { data: contacts, error: allError } = await db
        .from('broker_contacts')
        .select('phone')
        .eq('tenant_id', tenantId)
        .eq('unsubscribed', false);

      if (allError) throw new Error(allError.message);
      phones = (contacts || []).map((c: any) => c.phone);
    }

    const uniquePhones = Array.from(new Set(phones.filter(Boolean)));

    const { data: unsubscribed } = await db
      .from('broadcast_unsubscribes')
      .select('phone')
      .eq('tenant_id', tenantId);

    const unsubscribedPhones = new Set((unsubscribed || []).map((u: any) => u.phone));
    const filteredPhones = uniquePhones.filter((p) => !unsubscribedPhones.has(p));

    const recipients = filteredPhones.map((phone) => ({
      campaign_id: campaignId,
      phone,
      status: 'pending' as RecipientStatus,
    }));

    if (recipients.length > 0) {
      const { error: insertError } = await db
        .from('broadcast_recipients')
        .insert(recipients);

      if (insertError) throw new Error(insertError.message);
    }

    const { error: updateError } = await db
      .from('broadcast_campaigns')
      .update({ total_recipients: filteredPhones.length })
      .eq('id', campaignId);

    if (updateError) throw new Error(updateError.message);

    return filteredPhones.length;
  }

  async updateRecipientStatus(
    messageId: string,
    status: RecipientStatus,
    errorMessage?: string,
  ): Promise<void> {
    if (!db) throw new Error('Database admin client is not configured');

    const updates: Record<string, unknown> = { status };
    if (status === 'sent') updates.sent_at = new Date().toISOString();
    if (status === 'delivered') updates.delivered_at = new Date().toISOString();
    if (status === 'read') updates.read_at = new Date().toISOString();
    if (status === 'failed' || status === 'blocked') {
      updates.failed_at = new Date().toISOString();
      if (errorMessage) updates.error_message = errorMessage;
    }

    const { error } = await db
      .from('broadcast_recipients')
      .update(updates)
      .eq('openwa_message_id', messageId);

    if (error) throw new Error(error.message);
  }

  async markCampaignComplete(campaignId: string): Promise<void> {
    if (!db) throw new Error('Database admin client is not configured');

    await db
      .from('broadcast_campaigns')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', campaignId)
      .eq('status', 'sending');
  }

  async markCampaignFailed(campaignId: string, errorMessage: string): Promise<void> {
    if (!db) throw new Error('Database admin client is not configured');

    await db
      .from('broadcast_campaigns')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', campaignId)
      .eq('status', 'sending');
  }

  async startCampaign(campaignId: string): Promise<CampaignRecord> {
    if (!db) throw new Error('Database admin client is not configured');

    const { data, error } = await db
      .from('broadcast_campaigns')
      .update({
        status: 'sending',
        started_at: new Date().toISOString(),
      })
      .eq('id', campaignId)
      .eq('status', 'draft')
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }
}

export const broadcastCampaignService = new BroadcastCampaignService();
