import { Request, Response } from 'express';
import { broadcastCampaignService } from '../services/broadcastCampaignService';
import { broadcastExecutor } from '../services/broadcastExecutor';
import { workspaceAccessService } from '../services/workspaceAccessService';

function firstString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
}

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? String(id[0] || '') : String(id || '');
}

async function resolveBroadcastContext(req: Request) {
  return workspaceAccessService.resolveContext((req as any).user ?? {});
}

export const createCampaign = async (req: Request, res: Response) => {
  try {
    const context = await resolveBroadcastContext(req);
    const tenantId = context.workspaceOwnerId;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      name,
      message,
      mediaUrl,
      audienceType,
      listId,
      segmentCriteria,
      customPhones,
      scheduledAt,
      rateLimitPerHour,
      delayBetweenMessagesMs,
      acceptedRisk,
    } = req.body || {};

    if (!name || !message) {
      return res.status(400).json({ error: 'name and message are required' });
    }

    if (!acceptedRisk) {
      return res.status(400).json({ error: 'You must accept the ban risk to create a campaign' });
    }

    const campaign = await broadcastCampaignService.create({
      tenantId,
      name,
      message,
      mediaUrl,
      audienceType: audienceType || 'list',
      listId,
      segmentCriteria,
      customPhones,
      scheduledAt,
      rateLimitPerHour,
      delayBetweenMessagesMs,
      acceptedRisk: true,
      createdBy: context.currentUserId,
    });

    return res.status(201).json({ success: true, campaign });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to create campaign' });
  }
};

export const getCampaign = async (req: Request, res: Response) => {
  try {
    const context = await resolveBroadcastContext(req);
    const tenantId = context.workspaceOwnerId;
    const campaignId = paramId(req);

    if (!tenantId || !campaignId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const campaign = await broadcastCampaignService.getById(campaignId);
    if (!campaign || campaign.tenant_id !== tenantId) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    return res.json({ success: true, campaign });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to get campaign' });
  }
};

export const listCampaigns = async (req: Request, res: Response) => {
  try {
    const context = await resolveBroadcastContext(req);
    const tenantId = context.workspaceOwnerId;
    const status = firstString(req.query.status);

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const campaigns = await broadcastCampaignService.listByTenant(tenantId, status);
    return res.json({ success: true, campaigns });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to list campaigns' });
  }
};

export const deleteCampaign = async (req: Request, res: Response) => {
  try {
    const context = await resolveBroadcastContext(req);
    const tenantId = context.workspaceOwnerId;
    const campaignId = paramId(req);

    if (!tenantId || !campaignId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    await broadcastCampaignService.delete(campaignId, tenantId);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to delete campaign' });
  }
};

export const cancelCampaign = async (req: Request, res: Response) => {
  try {
    const context = await resolveBroadcastContext(req);
    const tenantId = context.workspaceOwnerId;
    const campaignId = paramId(req);

    if (!tenantId || !campaignId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const campaign = await broadcastCampaignService.cancel(campaignId, tenantId);
    return res.json({ success: true, campaign });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to cancel campaign' });
  }
};

export const populateRecipients = async (req: Request, res: Response) => {
  try {
    const context = await resolveBroadcastContext(req);
    const tenantId = context.workspaceOwnerId;
    const campaignId = paramId(req);

    if (!tenantId || !campaignId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const count = await broadcastCampaignService.populateRecipients(campaignId, tenantId);
    return res.json({ success: true, recipientCount: count });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to populate recipients' });
  }
};

export const startCampaign = async (req: Request, res: Response) => {
  try {
    const context = await resolveBroadcastContext(req);
    const tenantId = context.workspaceOwnerId;
    const campaignId = paramId(req);

    if (!tenantId || !campaignId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const campaign = await broadcastCampaignService.getById(campaignId);
    if (!campaign || campaign.tenant_id !== tenantId) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'draft') {
      return res.status(400).json({ error: 'Campaign must be in draft status to start' });
    }

    if (campaign.total_recipients === 0) {
      return res.status(400).json({ error: 'Campaign has no recipients. Populate recipients first.' });
    }

    await broadcastCampaignService.startCampaign(campaignId);
    void broadcastExecutor.executeCampaign(campaignId);

    return res.json({ success: true, message: 'Campaign started' });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to start campaign' });
  }
};

export const getCampaignRecipients = async (req: Request, res: Response) => {
  try {
    const context = await resolveBroadcastContext(req);
    const tenantId = context.workspaceOwnerId;
    const campaignId = paramId(req);
    const status = firstString(req.query.status);
    const page = parseInt(firstString(req.query.page), 10) || 1;
    const limit = Math.min(parseInt(firstString(req.query.limit), 10) || 50, 200);

    if (!tenantId || !campaignId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const campaign = await broadcastCampaignService.getById(campaignId);
    if (!campaign || campaign.tenant_id !== tenantId) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const { supabaseAdmin } = await import('../config/supabase');
    let query = supabaseAdmin!
      .from('broadcast_recipients')
      .select('id, phone, status, error_message, sent_at, delivered_at, read_at, failed_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    }

    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return res.json({
      success: true,
      recipients: data,
      pagination: { page, limit, total: count || 0 },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to get recipients' });
  }
};

export const getCampaignStats = async (req: Request, res: Response) => {
  try {
    const context = await resolveBroadcastContext(req);
    const tenantId = context.workspaceOwnerId;
    const campaignId = paramId(req);

    if (!tenantId || !campaignId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const campaign = await broadcastCampaignService.getById(campaignId);
    if (!campaign || campaign.tenant_id !== tenantId) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    return res.json({
      success: true,
      stats: campaign.stats,
      status: campaign.status,
      totalRecipients: campaign.total_recipients,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to get stats' });
  }
};
