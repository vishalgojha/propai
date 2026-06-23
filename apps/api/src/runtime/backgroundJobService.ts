import { syndicationSyncJob } from '../jobs/syndicationSyncJob';
import { generateMarketInsightsJob } from '../jobs/generateMarketInsights';
import { igrEnrichmentJob } from '../jobs/igrEnrichmentJob';
import { followUpOverdueJob } from '../jobs/followUpOverdueJob';
import { webhookQueueWorker } from '../jobs/webhookQueueWorker';
import { evolutionBatchParserJob } from '../jobs/evolutionBatchParserJob';

type JobStarter = {
    name: string;
    start: () => void;
    stop?: () => void;
};

const JOBS: JobStarter[] = [
    { name: 'syndicationSyncJob', start: () => syndicationSyncJob.start(), stop: () => syndicationSyncJob.stop?.() },
    { name: 'generateMarketInsightsJob', start: () => generateMarketInsightsJob.start(), stop: () => generateMarketInsightsJob.stop?.() },
    { name: 'igrEnrichmentJob', start: () => igrEnrichmentJob.start(), stop: () => igrEnrichmentJob.stop?.() },
    { name: 'followUpOverdueJob', start: () => followUpOverdueJob.start(), stop: () => followUpOverdueJob.stop() },
    { name: 'webhookQueueWorker', start: () => webhookQueueWorker.start(), stop: () => webhookQueueWorker.stop() },
    { name: 'evolutionBatchParserJob', start: () => evolutionBatchParserJob.start(), stop: () => evolutionBatchParserJob.stop() },
];

export class BackgroundJobService {
    private started = false;

    start() {
        if (this.started) {
            return;
        }

        for (const job of JOBS) {
            try {
                job.start();
            } catch (error) {
                console.error(`[startup] ${job.name} failed to start:`, error);
            }
        }

        this.started = true;
    }

    stop() {
        if (!this.started) {
            return;
        }

        for (const job of JOBS) {
            try {
                job.stop?.();
            } catch (error) {
                console.error(`[shutdown] ${job.name} failed to stop:`, error);
            }
        }

        this.started = false;
    }
}

export const backgroundJobService = new BackgroundJobService();

