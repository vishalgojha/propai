import { igrEnrichmentService } from '../services/igrEnrichmentService';

const POLL_INTERVAL_MS = 15 * 60 * 1000;

export class IgrEnrichmentJob {
  private timer: ReturnType<typeof setInterval> | null = null;

  start() {
    if (this.timer) return;

    console.log('[IGREnrichment] Starting queue processor (interval: 15 min)');
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
  }

  stop() {
    if (!this.timer) return;

    clearInterval(this.timer);
    this.timer = null;
    console.log('[IGREnrichment] Stopped queue processor');
  }

  private async tick() {
    try {
      const result = await igrEnrichmentService.processQueue();
      if (result.processed > 0) {
        console.log('[IGREnrichment] Queue run complete', result);
      }
    } catch (error) {
      console.error('[IGREnrichment] Queue run failed', error);
    }
  }
}

export const igrEnrichmentJob = new IgrEnrichmentJob();
