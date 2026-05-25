import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase';
import { igrQueryService, IgrTransactionPreview } from './igrQueryService';

type QueueStatus = 'pending' | 'done' | 'failed';

type QueueRow = {
  id: number;
  stream_item_id: string | null;
  building_name: string;
  locality: string;
  status: QueueStatus;
  last_checked_at: string | null;
  created_at: string;
};

type EnrichedIgrData = {
  buildingName: string;
  locality: string | null;
  transactions: IgrTransactionPreview[];
  localityStats: Awaited<ReturnType<typeof igrQueryService.getLocalityStats>> | null;
};

function normalizeValue(value: string | null | undefined) {
  return String(value || '').trim();
}

function isFreshRegistrationDate(registrationDate: string | null, days = 30) {
  if (!registrationDate) {
    return false;
  }

  const registeredAt = new Date(registrationDate);
  if (Number.isNaN(registeredAt.getTime())) {
    return false;
  }

  const ageMs = Date.now() - registeredAt.getTime();
  return ageMs <= days * 24 * 60 * 60 * 1000;
}

export class IgrEnrichmentService {
  private getAdmin(): SupabaseClient {
    if (!supabaseAdmin) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for IGR enrichment');
    }

    return supabaseAdmin;
  }

  async queueIfStale(buildingName: string, locality: string | null | undefined, streamItemId: string) {
    const normalizedBuildingName = normalizeValue(buildingName);
    const normalizedLocality = normalizeValue(locality);

    if (!normalizedBuildingName) {
      if (normalizedLocality) {
        await this.logLocalityBuildingHints(normalizedLocality);
      }
      return;
    }

    let latestQuery = this.getAdmin()
      .from('igr_transactions')
      .select('reg_date')
      .ilike('building_name', `%${normalizedBuildingName}%`)
      .order('reg_date', { ascending: false })
      .limit(1);

    if (normalizedLocality) {
      latestQuery = latestQuery.ilike('locality', `%${normalizedLocality}%`);
    }

    const { data: latestRow, error: latestError } = await latestQuery.maybeSingle();

    if (latestError) {
      throw new Error(latestError.message);
    }

    const latestRegDate = latestRow?.reg_date == null ? null : String(latestRow.reg_date);
    if (isFreshRegistrationDate(latestRegDate, 30)) {
      return;
    }

    const { error: queueError } = await this.getAdmin()
      .from('igr_enrichment_queue')
      .upsert(
        {
          stream_item_id: streamItemId,
          building_name: normalizedBuildingName,
          locality: normalizedLocality,
          status: 'pending',
          last_checked_at: null,
        },
        { onConflict: 'building_name,locality' },
      );

    if (queueError) {
      throw new Error(queueError.message);
    }
  }

  async processQueue() {
    const { data, error } = await this.getAdmin()
      .from('igr_enrichment_queue')
      .select('id, stream_item_id, building_name, locality, status, last_checked_at, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) {
      throw new Error(error.message);
    }

    const queueItems = (data || []) as QueueRow[];
    if (!queueItems.length) {
      return { processed: 0, done: 0, failed: 0 };
    }

    const startedAt = new Date().toISOString();
    const queueIds = queueItems.map((item) => item.id);
    const { error: touchError } = await this.getAdmin()
      .from('igr_enrichment_queue')
      .update({ last_checked_at: startedAt })
      .in('id', queueIds);

    if (touchError) {
      throw new Error(touchError.message);
    }

    let done = 0;
    let failed = 0;

    for (const item of queueItems) {
      try {
        await igrQueryService.getRecentTransactionsForListing(
          item.building_name,
          item.locality || null,
          10,
        );

        const { error: doneError } = await this.getAdmin()
          .from('igr_enrichment_queue')
          .update({
            status: 'done',
            last_checked_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        if (doneError) {
          throw new Error(doneError.message);
        }

        done += 1;
      } catch (error) {
        const { error: failedError } = await this.getAdmin()
          .from('igr_enrichment_queue')
          .update({
            status: 'failed',
            last_checked_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        if (failedError) {
          console.error('[IGREnrichment] Failed to update queue status', {
            queueId: item.id,
            error: failedError.message,
          });
        }

        failed += 1;
        console.error('[IGREnrichment] Queue item failed', {
          queueId: item.id,
          buildingName: item.building_name,
          locality: item.locality,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    return {
      processed: queueItems.length,
      done,
      failed,
    };
  }

  async getEnrichedData(buildingName: string, locality: string | null | undefined): Promise<EnrichedIgrData> {
    const normalizedBuildingName = normalizeValue(buildingName);
    const normalizedLocality = normalizeValue(locality);

    const [transactions, localityStats] = await Promise.all([
      igrQueryService.getRecentTransactionsForListing(
        normalizedBuildingName,
        normalizedLocality || null,
        10,
      ),
      normalizedLocality
        ? igrQueryService.getLocalityStats(normalizedLocality, 6)
        : Promise.resolve(null),
    ]);

    return {
      buildingName: normalizedBuildingName,
      locality: normalizedLocality || null,
      transactions,
      localityStats,
    };
  }

  private async logLocalityBuildingHints(locality: string) {
    const { data, error } = await this.getAdmin()
      .from('igr_transactions')
      .select('building_name')
      .ilike('locality', `%${locality}%`)
      .not('building_name', 'is', null)
      .limit(200);

    if (error) {
      throw new Error(error.message);
    }

    const counts = new Map<string, number>();
    for (const row of data || []) {
      const buildingName = normalizeValue((row as { building_name?: string | null }).building_name);
      if (!buildingName) {
        continue;
      }

      counts.set(buildingName, (counts.get(buildingName) || 0) + 1);
    }

    const topBuildings = [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 3)
      .map(([buildingName]) => buildingName);

    if (topBuildings.length > 0) {
      console.log('[IGREnrichment] Locality-only enrichment hint', {
        locality,
        topBuildings,
      });
    }
  }
}

export const igrEnrichmentService = new IgrEnrichmentService();
