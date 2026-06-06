import { supabase, supabaseAdmin } from '../config/supabase';
import { inferIgrCity } from './igrLocationResolver';

type TransactionRecord = {
  doc_number: string | null;
  reg_date: string | null;
  source: string | null;
  building_name: string | null;
  locality: string | null;
  city: string | null;
  consideration: number | null;
  area_sqft: number | null;
  price_per_sqft: number | null;
  config: string | null;
};

export type IgrTransactionPreview = TransactionRecord;

type SearchQuery = {
  locality?: string;
  building?: string;
  minDate?: string;
  city?: string;
};

type LocalityStats = {
  locality: string;
  months: number;
  avg_price_per_sqft: number | null;
  median_consideration: number | null;
  min_consideration: number | null;
  max_consideration: number | null;
  transaction_count: number;
};

function getClient() {
  return supabaseAdmin ?? supabase;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number) {
  return Math.round(value);
}

function normalizeSearchText(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSearchTokens(value?: string | null) {
  const stopwords = new Set([
    'building', 'project', 'tower', 'wing', 'sale', 'deed', 'transaction',
    'transactions', 'latest', 'last', 'recent', 'data', 'details', 'igr',
    'registration', 'registered', 'record', 'records', 'using', 'with',
    'from', 'near', 'in', 'at', 'on',
  ]);

  return normalizeSearchText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopwords.has(token));
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

let igrTransactionsCityColumnAvailablePromise: Promise<boolean> | null = null;

async function hasIgrTransactionsCityColumn() {
  if (!igrTransactionsCityColumnAvailablePromise) {
    igrTransactionsCityColumnAvailablePromise = (async () => {
      const client = getClient();
      const { error } = await client.from('igr_transactions').select('city').limit(1);
      if (!error) {
        return true;
      }

      const message = String(error.message || '').toLowerCase();
      const code = String(error.code || '').toUpperCase();
      if (code === 'PGRST204' || code === 'PGRST205' || message.includes('could not find') || message.includes('schema cache')) {
        return false;
      }

      throw new Error(error.message);
    })();
  }

  return igrTransactionsCityColumnAvailablePromise;
}

function cityMatches(candidateCity: string | null, requestedCity: string | null) {
  const left = normalizeSearchText(candidateCity);
  const right = normalizeSearchText(requestedCity);
  return Boolean(left && right && left.includes(right));
}

function selectFields(includeCity: boolean) {
  return includeCity
    ? 'doc_number, reg_date, source, building_name, locality, city, consideration, area_sqft, price_per_sqft, config'
    : 'doc_number, reg_date, source, building_name, locality, consideration, area_sqft, price_per_sqft, config';
}

export class IgrQueryService {
  private mapTransaction(row: Record<string, unknown>): TransactionRecord {
    return {
      doc_number: typeof row.doc_number === 'string' ? row.doc_number : null,
      reg_date: typeof row.reg_date === 'string' ? row.reg_date : null,
      source: typeof row.source === 'string' ? row.source : null,
      building_name: typeof row.building_name === 'string' ? row.building_name : null,
      locality: typeof row.locality === 'string' ? row.locality : null,
      city: typeof row.city === 'string' ? row.city : inferIgrCity({
        buildingName: typeof row.building_name === 'string' ? row.building_name : null,
        locality: typeof row.locality === 'string' ? row.locality : null,
      }),
      consideration: toNumber(row.consideration),
      area_sqft: toNumber(row.area_sqft),
      price_per_sqft: toNumber(row.price_per_sqft),
      config: typeof row.config === 'string' ? row.config : null,
    };
  }

  async getRecentTransactionsForListing(buildingName: string, locality?: string | null, city?: string | null, limit = 3): Promise<IgrTransactionPreview[]> {
    const trimmedBuilding = buildingName.trim();
    const trimmedLocality = String(locality || '').trim();
    const trimmedCity = String(city || '').trim();
    const effectiveLimit = Math.max(1, Math.min(limit, 10));
    const hasCityColumn = await hasIgrTransactionsCityColumn();
    const fetchLimit = trimmedCity && !hasCityColumn ? Math.max(20, effectiveLimit * 5) : effectiveLimit;

    if (!trimmedBuilding) {
      return [];
    }

    const igrTransactions = getClient().from('igr_transactions') as any;

    let directQuery = igrTransactions
      .select(selectFields(hasCityColumn))
      .ilike('building_name', `%${trimmedBuilding}%`)
      .order('reg_date', { ascending: false })
      .limit(fetchLimit);

    if (trimmedLocality) {
      directQuery = directQuery.ilike('locality', `%${trimmedLocality}%`);
    }

    if (trimmedCity && hasCityColumn) {
      directQuery = directQuery.ilike('city', `%${trimmedCity}%`);
    }

    const { data, error } = await directQuery;

    if (error) {
      throw new Error(error.message);
    }

    let directRows = Array.isArray(data) ? data.map((row) => this.mapTransaction(row as Record<string, unknown>)) : [];
    if (trimmedCity && !hasCityColumn) {
      directRows = directRows.filter((row) => cityMatches(row.city, trimmedCity));
    }
    if (directRows.length >= effectiveLimit) {
      return directRows.slice(0, effectiveLimit);
    }

    const buildingTokens = getSearchTokens(trimmedBuilding);
    const localityTokens = getSearchTokens(trimmedLocality);
    const queryTokens = Array.from(new Set([...buildingTokens, ...localityTokens]));
    if (!queryTokens.length) {
      return directRows.slice(0, effectiveLimit);
    }

    const orQuery = queryTokens
      .flatMap((token) => [
        `building_name.ilike.%${token}%`,
        `locality.ilike.%${token}%`,
      ])
      .join(',');

    let fuzzyQuery = (getClient().from('igr_transactions') as any)
      .select(selectFields(hasCityColumn))
      .or(orQuery)
      .order('reg_date', { ascending: false })
      .limit(trimmedCity && !hasCityColumn ? Math.max(40, effectiveLimit * 5) : 40);

    if (trimmedLocality) {
      fuzzyQuery = fuzzyQuery.ilike('locality', `%${trimmedLocality}%`);
    }

    if (trimmedCity && hasCityColumn) {
      fuzzyQuery = fuzzyQuery.ilike('city', `%${trimmedCity}%`);
    }

    const { data: fuzzyRows, error: fuzzyError } = await fuzzyQuery;
    if (fuzzyError) {
      throw new Error(fuzzyError.message);
    }

    const seen = new Set(directRows.map((row) => `${row.doc_number || ''}|${row.reg_date || ''}`));
    const ranked = (Array.isArray(fuzzyRows) ? fuzzyRows : [])
      .map((row) => {
        const transaction = this.mapTransaction(row as Record<string, unknown>);
        const haystack = `${normalizeSearchText(transaction.building_name)} ${normalizeSearchText(transaction.locality)}`;
        const score = queryTokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
        const localityBonus = trimmedLocality && normalizeSearchText(transaction.locality).includes(normalizeSearchText(trimmedLocality)) ? 2 : 0;
        const cityBonus = trimmedCity && cityMatches(transaction.city, trimmedCity) ? 2 : 0;
        return {
          transaction,
          score: score + localityBonus + cityBonus,
        };
      })
      .filter((entry) => entry.score > 0 && (!trimmedCity || hasCityColumn || cityMatches(entry.transaction.city, trimmedCity)))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return new Date(String(right.transaction.reg_date || '')).getTime() - new Date(String(left.transaction.reg_date || '')).getTime();
      });

    const merged = [...directRows];
    for (const entry of ranked) {
      const key = `${entry.transaction.doc_number || ''}|${entry.transaction.reg_date || ''}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(entry.transaction);
      if (merged.length >= effectiveLimit) {
        break;
      }
    }

    return merged.slice(0, effectiveLimit);
  }

  async getLastTransactionForBuilding(buildingName: string, locality?: string | null, city?: string | null): Promise<TransactionRecord | null> {
    const name = buildingName.trim();
    const trimmedLocality = String(locality || '').trim();
    const trimmedCity = String(city || '').trim();
    const hasCityColumn = await hasIgrTransactionsCityColumn();
    const fetchLimit = trimmedCity && !hasCityColumn ? 20 : 1;
    if (!name) return null;

    const igrTransactions = getClient().from('igr_transactions') as any;

    let request = igrTransactions
      .select(selectFields(hasCityColumn))
      .ilike('building_name', `%${name}%`)
      .order('reg_date', { ascending: false })
      .limit(fetchLimit);

    if (trimmedLocality) {
      request = request.ilike('locality', `%${trimmedLocality}%`);
    }

    if (trimmedCity && hasCityColumn) {
      request = request.ilike('city', `%${trimmedCity}%`);
    }

    const { data, error } = await request;

    if (error) {
      throw new Error(error.message);
    }

    const directRows = (Array.isArray(data) ? data : data ? [data] : []).map((row) => this.mapTransaction(row as Record<string, unknown>));
    const directMatch = trimmedCity && !hasCityColumn
      ? directRows.find((row) => cityMatches(row.city, trimmedCity)) || null
      : directRows[0] || null;

    if (directMatch) {
      return directMatch;
    }

    const tokens = getSearchTokens(name);
    if (!tokens.length) return null;

    const orQuery = tokens
      .flatMap((token) => [
        `building_name.ilike.%${token}%`,
        `locality.ilike.%${token}%`,
      ])
      .join(',');

      const { data: fuzzyRows, error: fuzzyError } = await (getClient().from('igr_transactions') as any)
        .select(selectFields(hasCityColumn))
        .or(orQuery)
        .order('reg_date', { ascending: false })
        .limit(40);

    if (fuzzyError) {
      throw new Error(fuzzyError.message);
    }

    const ranked = (fuzzyRows || [])
      .map((row: any) => {
        const transaction = this.mapTransaction(row as Record<string, unknown>);
        const haystack = `${normalizeSearchText(transaction.building_name)} ${normalizeSearchText(transaction.locality)}`;
        const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
        const cityScore = trimmedCity && cityMatches(transaction.city, trimmedCity) ? 2 : 0;
        return { row: transaction, score: score + cityScore };
      })
      .filter((entry: any) => entry.score > 0 && (!trimmedCity || hasCityColumn || cityMatches(entry.row.city, trimmedCity)))
      .sort((a: any, b: any) => b.score - a.score);

    const best = ranked[0]?.row;
    if (!best) return null;

    return best;
  }

  async getLocalityStats(locality: string, months = 6): Promise<LocalityStats> {
    const name = locality.trim();
    const effectiveMonths = months > 0 ? months : 6;
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - effectiveMonths);

    const { data, error } = await getClient()
      .from('igr_transactions')
      .select('consideration, price_per_sqft, locality')
      .ilike('locality', `%${name}%`)
      .gte('reg_date', cutoffDate.toISOString().slice(0, 10))
      .order('reg_date', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const rows = data || [];
    const pricePerSqftValues = rows
      .map((row) => toNumber(row.price_per_sqft))
      .filter((value): value is number => value != null);
    const considerationValues = rows
      .map((row) => toNumber(row.consideration))
      .filter((value): value is number => value != null);

    return {
      locality: name,
      months: effectiveMonths,
      avg_price_per_sqft: pricePerSqftValues.length
        ? round(pricePerSqftValues.reduce((sum, value) => sum + value, 0) / pricePerSqftValues.length)
        : null,
      median_consideration: considerationValues.length ? median(considerationValues) : null,
      min_consideration: considerationValues.length ? Math.min(...considerationValues) : null,
      max_consideration: considerationValues.length ? Math.max(...considerationValues) : null,
      transaction_count: rows.length,
    };
  }

  async getBuildingNames(search?: string): Promise<Array<{ name: string; city: string | null; count: number }>> {
    const searchTerm = normalizeSearchText(search);
    const minLength = searchTerm ? 1 : 3;
    const hasCityColumn = await hasIgrTransactionsCityColumn();

    let igrQuery = (getClient().from('igr_transactions') as any)
      .select(hasCityColumn ? 'building_name, city, locality' : 'building_name, locality');

    if (searchTerm) {
      igrQuery = igrQuery.ilike('building_name', `%${searchTerm}%`);
    }

    const { data: igrData, error: igrError } = await igrQuery;
    if (igrError) throw new Error(igrError.message);

    const [resStream, comStream] = await Promise.all([
      getClient().from('stream_items_residential').select('building_name, city').ilike('building_name', `%${searchTerm || ''}%`),
      getClient().from('stream_items_commercial').select('building_name, city').ilike('building_name', `%${searchTerm || ''}%`),
    ]);
    const streamData = [
      ...(Array.isArray(resStream.data) ? resStream.data : []),
      ...(Array.isArray(comStream.data) ? comStream.data : []),
    ];

    const freq = new Map<string, { name: string; city: string | null; count: number }>();
    for (const row of (igrData || []) as Array<{ building_name: string | null; city?: string | null; locality?: string | null }>) {
      const name = row.building_name?.trim();
      const city = inferIgrCity({
        buildingName: row.building_name,
        locality: row.locality || null,
        city: row.city || null,
      });
      if (name && name.length >= minLength) {
        const key = `${name.toLowerCase()}|${city?.toLowerCase() || ''}`;
        const existing = freq.get(key) || { name, city, count: 0 };
        existing.count += 1;
        freq.set(key, existing);
      }
    }
    for (const row of (streamData || []) as Array<{ building_name: string | null; city: string | null }>) {
      const name = row.building_name?.trim();
      const city = row.city?.trim() || null;
      if (name && name.length >= minLength) {
        const key = `${name.toLowerCase()}|${city?.toLowerCase() || ''}`;
        const existing = freq.get(key) || { name, city, count: 0 };
        existing.count += 1;
        freq.set(key, existing);
      }
    }

    return Array.from(freq.values())
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name) || String(a.city || '').localeCompare(String(b.city || '')))
      .slice(0, 20);
  }

  async searchTransactions(query: SearchQuery) {
    const hasCityColumn = await hasIgrTransactionsCityColumn();
    let request = (getClient().from('igr_transactions') as any)
      .select(hasCityColumn
        ? 'doc_number, reg_date, source, building_name, locality, city, consideration, area_sqft, price_per_sqft, config, property_type, district'
        : 'doc_number, reg_date, source, building_name, locality, consideration, area_sqft, price_per_sqft, config, property_type, district')
      .order('reg_date', { ascending: false })
      .limit(10);

    if (query.locality?.trim()) {
      request = request.ilike('locality', `%${query.locality.trim()}%`);
    }

    const cityFilter = query.city?.trim();
    if (cityFilter && hasCityColumn) {
      request = request.ilike('city', `%${cityFilter}%`);
    }

    if (query.building?.trim()) {
      request = request.ilike('building_name', `%${query.building.trim()}%`);
    }

    if (query.minDate?.trim()) {
      request = request.gte('reg_date', query.minDate.trim());
    }

    const { data, error } = await request;

    if (error) {
      throw new Error(error.message);
    }

    const rows = Array.isArray(data) ? data : [];

    return rows
      .map((row: any) => ({
        ...row,
        city: typeof row.city === 'string' ? row.city : inferIgrCity({
          buildingName: typeof row.building_name === 'string' ? row.building_name : null,
          locality: typeof row.locality === 'string' ? row.locality : null,
        }),
        consideration: toNumber(row.consideration),
        area_sqft: toNumber(row.area_sqft),
        price_per_sqft: toNumber(row.price_per_sqft),
      }))
      .filter((row: any) => !cityFilter || hasCityColumn || cityMatches(typeof row.city === 'string' ? row.city : null, cityFilter));
  }
}

export const igrQueryService = new IgrQueryService();
