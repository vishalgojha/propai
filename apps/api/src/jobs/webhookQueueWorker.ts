import { whatsappCloudApiService } from '../services/whatsappCloudApiService';

const POLL_INTERVAL_MS = 2_000;
const BATCH_SIZE = 10;

export class WebhookQueueWorker {
  private timer: ReturnType<typeof setInterval> | null = null;

  start() {
    if (this.timer) return;

    console.log('[WebhookQueue] Starting worker (interval: 2s, batch: 10)');
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
  }

  stop() {
    if (!this.timer) return;

    clearInterval(this.timer);
    this.timer = null;
    console.log('[WebhookQueue] Stopped worker');
  }

  private async tick() {
    try {
      const result = await whatsappCloudApiService.processQueuedWebhookEvents(BATCH_SIZE);
      if (result.processed > 0) {
        console.log(
          `[WebhookQueue] Processed ${result.processed} events ` +
          `(${result.replied} replies, ${result.ignored} ignored)`
        );
      }
    } catch (error) {
      console.error('[WebhookQueue] Tick failed:', error);
    }
  }
}

export const webhookQueueWorker = new WebhookQueueWorker();
