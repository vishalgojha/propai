import { createHash } from 'node:crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase';
import { inferIgrCity } from './igrLocationResolver';
import { igrQueryService, IgrTransactionPreview } from './igrQueryService';
import { igrLiveFetchService } from './igrLiveFetchService';

export type QueueStatus = 'pending' | 'done' | 'failed';

export type IgrQueueStatusPreview = {
  status: QueueStatus;
  buildingName: string;
  locality: string | null;
  city: string | null;
  queuedAt: string;
  lastCheckedAt: string | null;
  nextRetryAt: string | null;
};

type QueueStatusCandidate = {
  streamItemId?: string | null;
  buildingName: string;
  locality?: string | null;
  city?: string | null;
};

type QueueRow = {
  id: number;
  stream_item_id: string | null;
  building_name: string;
  locality: string;
  city: string | null;
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

const QUEUE_BATCH_SIZE = 2;
const QUEUE_RETRY_COOLDOWN_MS = 30 * 60 * 1000;
const LIVE_FETCH_TIMEOUT_MS = 2 * 60 * 1000;

function normalizeValue(value: string | null | undefined) {
  return String(value || '').trim();
}

function normalizeKey(value: string | null | undefined) {
  return normalizeValue(value).toLowerCase().replace(/\s+/g, ' ');
}

function buildNextRetryAt(status: QueueStatus, lastCheckedAt: string | null) {
  if (status !== 'pending' || !lastCheckedAt) {
    return null;
  }

  const checkedAt = new Date(lastCheckedAt);
  if (Number.isNaN(checkedAt.getTime())) {
    return null;
  }

  return new Date(checkedAt.getTime() + QUEUE_RETRY_COOLDOWN_MS).toISOString();
}

function mapQueueStatusPreview(row: QueueRow): IgrQueueStatusPreview {
  return {
    status: row.status,
    buildingName: row.building_name,
    locality: row.locality || null,
    city: row.city || null,
    queuedAt: row.created_at,
    lastCheckedAt: row.last_checked_at,
    nextRetryAt: buildNextRetryAt(row.status, row.last_checked_at),
  };
}

function buildSeedDocNumber(buildingName: string, locality: string | null, city: string | null) {
  const hash = createHash('sha256')
    .update([normalizeValue(buildingName).toLowerCase(), normalizeValue(locality).toLowerCase(), normalizeValue(city).toLowerCase()].join('|'))
    .digest('hex')
    .slice(0, 20);
  return `seed:${hash}`;
}

function buildSeedRegistrationDate() {
  return '1900-01-01';
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

let igrTransactionsCityColumnAvailablePromise: Promise<boolean> | null = null;
let igrTransactionsSourceColumnAvailablePromise: Promise<boolean> | null = null;

async function hasIgrTransactionsColumn(column: string) {
  let promise = column === 'city'
    ? igrTransactionsCityColumnAvailablePromise
    : column === 'source'
      ? igrTransactionsSourceColumnAvailablePromise
      : null;

  if (!promise) {
    promise = (async () => {
      const admin = supabaseAdmin;
      if (!admin) {
        return false;
      }

      const relation: any = admin.from('igr_transactions');
      if (typeof relation.select !== 'function') {
        return false;
      }

      const { error } = await relation.select(column).limit(1);
      if (!error) {
        return true;
      }

      const message = String(error.message || '').toLowerCase();
      const code = String(error.code || '').toUpperCase();
      if (
        code === 'PGRST204' ||
        code === 'PGRST205' ||
        message.includes('could not find') ||
        message.includes('schema cache') ||
        message.includes('does not exist')
      ) {
        return false;
      }

      throw new Error(error.message);
    })();

    if (column === 'city') {
      igrTransactionsCityColumnAvailablePromise = promise;
    } else if (column === 'source') {
      igrTransactionsSourceColumnAvailablePromise = promise;
    }
  }

  return promise;
}

async function hasIgrTransactionsCityColumn() {
  if (!igrTransactionsCityColumnAvailablePromise) {
    igrTransactionsCityColumnAvailablePromise = hasIgrTransactionsColumn('city');
  }

  return igrTransactionsCityColumnAvailablePromise;
}

async function hasIgrTransactionsSourceColumn() {
  if (!igrTransactionsSourceColumnAvailablePromise) {
    igrTransactionsSourceColumnAvailablePromise = hasIgrTransactionsColumn('source');
  }

  return igrTransactionsSourceColumnAvailablePromise;
}

export class IgrEnrichmentService {
  private getAdmin(): SupabaseClient {
    if (!supabaseAdmin) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for IGR enrichment');
    }

    return supabaseAdmin;
  }

  async queueIfStale(buildingName: string, locality: string | null | undefined, streamItemId: string, city?: string | null | undefined) {
    const normalizedBuildingName = normalizeValue(buildingName);
    const normalizedLocality = normalizeValue(locality);
    const normalizedCity = normalizeValue(city);
    const hasCityColumn = await hasIgrTransactionsCityColumn();

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

    if (normalizedCity && hasCityColumn) {
      latestQuery = latestQuery.ilike('city', `%${normalizedCity}%`);
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
            city: hasCityColumn ? normalizedCity : '',
            status: 'pending',
            last_checked_at: null,
          },
          { onConflict: 'building_name,locality,city' },
        );

    if (queueError) {
      throw new Error(queueError.message);
    }
  }

  async seedBuildingName(buildingName: string, locality: string | null | undefined, city: string | null | undefined = null) {
    const normalizedBuildingName = normalizeValue(buildingName);
    const normalizedLocality = normalizeValue(locality);
    const normalizedCity = normalizeValue(city);
    const inferredCity = inferIgrCity({
      buildingName: normalizedBuildingName,
      locality: normalizedLocality || null,
      city: normalizedCity || null,
    });
    const hasCityColumn = await hasIgrTransactionsCityColumn();
    const hasSourceColumn = await hasIgrTransactionsSourceColumn();

    if (normalizedBuildingName.length < 3) {
      return;
    }

    const row = {
      doc_number: buildSeedDocNumber(normalizedBuildingName, normalizedLocality || null, normalizedCity || null),
      registration_date: buildSeedRegistrationDate(),
      sro_office: null,
      district: null,
      article_type: '25',
      consideration_amount: null,
      rent_amount: null,
      deposit_amount: null,
      lease_duration: null,
      property_description: 'stream_index_seed',
      building_name: normalizedBuildingName,
      buyer_name: null,
      seller_name: null,
      village_locality: normalizedLocality || null,
      locality: normalizedLocality || null,
      ...(hasCityColumn ? { city: normalizedCity || inferredCity || null } : {}),
      area_sqft: null,
      scraped_at: new Date().toISOString(),
      ...(hasSourceColumn ? { source: 'stream_index_seed' } : {}),
    };

    const { error } = await this.getAdmin()
      .from('igr_transactions')
      .upsert(row, { onConflict: 'doc_number', ignoreDuplicates: false });

    if (error) {
      throw new Error(error.message);
    }
  }

  async getQueueStatusPreviews(candidates: QueueStatusCandidate[]): Promise<Array<IgrQueueStatusPreview | null>> {
    const admin = this.getAdmin();
    const normalizedCandidates = candidates
      .map((candidate) => ({
        ...candidate,
        streamItemId: normalizeValue(candidate.streamItemId),
        buildingName: normalizeValue(candidate.buildingName),
        locality: normalizeValue(candidate.locality),
        city: normalizeValue(candidate.city),
      }))
      .filter((candidate) => candidate.buildingName.length >= 3);

    if (normalizedCandidates.length === 0) {
      return candidates.map(() => null);
    }

    const streamItemIds = Array.from(new Set(
      normalizedCandidates.map((candidate) => candidate.streamItemId).filter(Boolean),
    )).slice(0, 200);
    const buildingNames = Array.from(new Set(
      normalizedCandidates.map((candidate) => candidate.buildingName).filter(Boolean),
    )).slice(0, 200);

    const queries: Array<Promise<{ data: QueueRow[] | null; error: any }>> = [];
    if (streamItemIds.length > 0) {
      queries.push(
        admin
          .from('igr_enrichment_queue')
          .select('id, stream_item_id, building_name, locality, city, status, last_checked_at, created_at')
          .in('stream_item_id', streamItemIds)
          .order('created_at', { ascending: false }) as any,
      );
    }
    if (buildingNames.length > 0) {
      queries.push(
        admin
          .from('igr_enrichment_queue')
          .select('id, stream_item_id, building_name, locality, city, status, last_checked_at, created_at')
          .in('building_name', buildingNames)
          .order('created_at', { ascending: false }) as any,
      );
    }

    const results = await Promise.all(queries);
    const rows: QueueRow[] = [];
    const seen = new Set<number>();
    for (const result of results) {
      if (result.error) {
        throw new Error(result.error.message);
      }

      for (const row of result.data || []) {
        if (!seen.has(row.id)) {
          rows.push(row);
          seen.add(row.id);
        }
      }
    }

    const byStreamItemId = new Map<string, QueueRow>();
    for (const row of rows) {
      const streamItemId = normalizeValue(row.stream_item_id);
      if (streamItemId && !byStreamItemId.has(streamItemId)) {
        byStreamItemId.set(streamItemId, row);
      }
    }

    return candidates.map((candidate) => {
      const streamItemId = normalizeValue(candidate.streamItemId);
      if (streamItemId && byStreamItemId.has(streamItemId)) {
        return mapQueueStatusPreview(byStreamItemId.get(streamItemId)!);
      }

      const buildingName = normalizeKey(candidate.buildingName);
      const locality = normalizeKey(candidate.locality);
      const city = normalizeKey(candidate.city);
      const row = rows.find((entry) => {
        if (normalizeKey(entry.building_name) !== buildingName) return false;
        if (locality && normalizeKey(entry.locality) && normalizeKey(entry.locality) !== locality) return false;
        if (city && normalizeKey(entry.city) && normalizeKey(entry.city) !== city) return false;
        return true;
      });

      return row ? mapQueueStatusPreview(row) : null;
    });
  }

  async processQueue() {
    const retryBefore = new Date(Date.now() - QUEUE_RETRY_COOLDOWN_MS).toISOString();
    const { data, error } = await this.getAdmin()
      .from('igr_enrichment_queue')
      .select('id, stream_item_id, building_name, locality, city, status, last_checked_at, created_at')
      .eq('status', 'pending')
      .or(`last_checked_at.is.null,last_checked_at.lt.${retryBefore}`)
      .order('created_at', { ascending: true })
      .limit(QUEUE_BATCH_SIZE);

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
        const result = await Promise.race([
          igrLiveFetchService.fetchAndStore({
            buildingName: item.building_name,
            locality: item.locality || undefined,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Live IGR fetch timed out after ${LIVE_FETCH_TIMEOUT_MS / 1000}s`)), LIVE_FETCH_TIMEOUT_MS)
          ),
        ]);

        if (!result.success) {
          throw new Error(result.error || 'Live IGR fetch returned no usable transaction');
        }

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
            status: 'pending',
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
        console.warn('[IGREnrichment] Queue item deferred for retry', {
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
        null,
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
