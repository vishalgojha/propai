import { broadcastCampaignService, RecipientStatus } from './broadcastCampaignService';
import { openWAService } from './openWAService';

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

      const { data: recipients, error } = await (await import('../config/supabase')).supabaseAdmin!
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

      const delayMs = campaign.delay_between_messages_ms || 5000;
      const maxFailures = Math.max(10, Math.floor(recipients.length * 0.2));
      let consecutiveFailures = 0;

      for (const recipient of recipients) {
        if (!this.runningCampaigns.has(campaignId)) {
          break;
        }

        const phone = recipient.phone.replace(/[^0-9]/g, '');
        const chatId = `${phone}@c.us`;

        let result: { success: boolean; messageId?: string; error?: string };

        if (campaign.media_url) {
          result = await openWAService.sendWithFallback(
            chatId,
            campaign.message,
            campaign.media_url || undefined,
          );
        } else {
          result = await openWAService.sendText(chatId, campaign.message);
        }

        if (result.success) {
          await broadcastCampaignService.updateRecipientStatus(
            result.messageId || `manual:${recipient.id}`,
            'sent',
          );
          consecutiveFailures = 0;
        } else {
          await broadcastCampaignService.updateRecipientStatus(
            `manual:${recipient.id}`,
            'failed',
            result.error,
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
