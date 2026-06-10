import { BROADCAST_SESSION_LABEL, broadcastCampaignService } from './broadcastCampaignService';
import { sessionManager } from '../whatsapp/SessionManager';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class BroadcastExecutor {
  private runningCampaigns = new Map<string, boolean>();

  async executeCampaign(campaignId: string): Promise<void> {
    if (this.runningCampaigns.has(campaignId)) {
      throw new Error('Campaign already running');
    }

    this.runningCampaigns.set(campaignId, true);

    try {
      const campaign = await broadcastCampaignService.getById(campaignId);
      if (!campaign) throw new Error('Campaign not found');
      if (campaign.status !== 'sending') throw new Error('Campaign is not in sending status');
      if (!campaign.accepted_risk) throw new Error('Risk not accepted for this campaign');

      const { supabaseAdmin } = await import('../config/supabase');
      const { data: recipients, error } = await supabaseAdmin!
        .from('broadcast_recipients')
        .select('id, phone, status')
        .eq('campaign_id', campaignId)
        .in('status', ['pending', 'failed'])
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);
      if (!recipients?.length) {
        await broadcastCampaignService.markCampaignComplete(campaignId);
        return;
      }

      const client = await sessionManager.getSession(campaign.tenant_id, BROADCAST_SESSION_LABEL);
      if (!client || client.getStatusSnapshot().status !== 'connected') {
        throw new Error(`Broadcast session '${BROADCAST_SESSION_LABEL}' is not connected. Connect it first.`);
      }

      const delayMs = campaign.delay_between_messages_ms || 5000;
      const maxFailures = Math.max(10, Math.floor(recipients.length * 0.2));
      let consecutiveFailures = 0;

      for (const recipient of recipients) {
        if (!this.runningCampaigns.has(campaignId)) {
          break;
        }

        const phone = recipient.phone.replace(/[^0-9]/g, '');
        const remoteJid = `${phone}@s.whatsapp.net`;

        try {
          if (campaign.media_url) {
            await client.sendMedia(remoteJid, {
              url: campaign.media_url,
              caption: campaign.message,
            });
          } else {
            await client.sendText(remoteJid, campaign.message);
          }

          await broadcastCampaignService.updateRecipientStatus(
            recipient.id,
            'sent',
          );
          consecutiveFailures = 0;
        } catch (error: any) {
          await broadcastCampaignService.updateRecipientStatus(
            recipient.id,
            'failed',
            error?.message || 'Failed to send',
          );
          consecutiveFailures++;

          if (consecutiveFailures >= maxFailures) {
            await broadcastCampaignService.markCampaignFailed(
              campaignId,
              `Too many consecutive failures (${consecutiveFailures})`,
            );
            break;
          }
        }

        if (recipient !== recipients[recipients.length - 1]) {
          await sleep(delayMs);
        }
      }

      await broadcastCampaignService.markCampaignComplete(campaignId);
    } catch (error: any) {
      await broadcastCampaignService.markCampaignFailed(campaignId, error?.message || 'Unknown error');
    } finally {
      this.runningCampaigns.delete(campaignId);
    }
  }

  async stopCampaign(campaignId: string): Promise<void> {
    this.runningCampaigns.delete(campaignId);
  }

  isRunning(campaignId: string): boolean {
    return this.runningCampaigns.has(campaignId);
  }
}

export const broadcastExecutor = new BroadcastExecutor();
