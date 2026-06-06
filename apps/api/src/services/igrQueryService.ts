import { supabase, supabaseAdmin } from '../config/supabase';

type TransactionRecord = {
  doc_number: string | null;
  reg_date: string | null;
  source: string | null;
  building_name: string | null;
  locality: string | null;
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

export class IgrQueryService {
  private mapTransaction(row: Record<string, unknown>): TransactionRecord {
    return {
      doc_number: typeof row.doc_number === 'string' ? row.doc_number : null,
      reg_date: typeof row.reg_date === 'string' ? row.reg_date : null,
      source: typeof row.source === 'string' ? row.source : null,
      building_name: typeof row.building_name === 'string' ? row.building_name : null,
      locality: typeof row.locality === 'string' ? row.locality : null,
      consideration: toNumber(row.consideration),
      area_sqft: toNumber(row.area_sqft),
      price_per_sqft: toNumber(row.price_per_sqft),
      config: typeof row.config === 'string' ? row.config : null,
    };
  }

  async getRecentTransactionsForListing(buildingName: string, locality?: string | null, limit = 3): Promise<IgrTransactionPreview[]> {
    const trimmedBuilding = buildingName.trim();
    const trimmedLocality = String(locality || '').trim();
    const effectiveLimit = Math.max(1, Math.min(limit, 10));

    if (!trimmedBuilding) {
      return [];
    }

    let directQuery = getClient()
      .from('igr_transactions')
      .select('doc_number, reg_date, source, building_name, locality, consideration, area_sqft, price_per_sqft, config')
      .ilike('building_name', `%${trimmedBuilding}%`)
      .order('reg_date', { ascending: false })
      .limit(effectiveLimit);

    if (trimmedLocality) {
      directQuery = directQuery.ilike('locality', `%${trimmedLocality}%`);
    }

    const { data, error } = await directQuery;

    if (error) {
      throw new Error(error.message);
    }

    const directRows = Array.isArray(data) ? data.map((row) => this.mapTransaction(row as Record<string, unknown>)) : [];
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

    let fuzzyQuery = getClient()
      .from('igr_transactions')
      .select('doc_number, reg_date, source, building_name, locality, consideration, area_sqft, price_per_sqft, config')
      .or(orQuery)
      .order('reg_date', { ascending: false })
      .limit(40);

    if (trimmedLocality) {
      fuzzyQuery = fuzzyQuery.ilike('locality', `%${trimmedLocality}%`);
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
        return {
          transaction,
          score: score + localityBonus,
        };
      })
      .filter((entry) => entry.score > 0)
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

  async getLastTransactionForBuilding(buildingName: string): Promise<TransactionRecord | null> {
    const name = buildingName.trim();
    if (!name) return null;

    const { data, error } = await getClient()
      .from('igr_transactions')
      .select('doc_number, reg_date, source, building_name, locality, consideration, area_sqft, price_per_sqft, config')
      .ilike('building_name', `%${name}%`)
      .order('reg_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      const tokens = getSearchTokens(name);
      if (!tokens.length) return null;

      const orQuery = tokens
        .flatMap((token) => [
          `building_name.ilike.%${token}%`,
          `locality.ilike.%${token}%`,
        ])
        .join(',');

      const { data: fuzzyRows, error: fuzzyError } = await getClient()
        .from('igr_transactions')
        .select('doc_number, reg_date, source, building_name, locality, consideration, area_sqft, price_per_sqft, config')
        .or(orQuery)
        .order('reg_date', { ascending: false })
        .limit(40);

      if (fuzzyError) {
        throw new Error(fuzzyError.message);
      }

      const ranked = (fuzzyRows || [])
        .map((row) => {
          const haystack = `${normalizeSearchText(row.building_name)} ${normalizeSearchText(row.locality)}`;
          const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
          return { row, score };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);

      const best = ranked[0]?.row;
      if (!best) return null;

      return this.mapTransaction(best as Record<string, unknown>);
    }

    return this.mapTransaction(data as Record<string, unknown>);
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

  async getBuildingNames(search?: string): Promise<Array<{ name: string; count: number }>> {
    const searchTerm = normalizeSearchText(search);
    const minLength = searchTerm ? 1 : 3;

    let igrQuery = getClient()
      .from('igr_transactions')
      .select('building_name');

    if (searchTerm) {
      igrQuery = igrQuery.ilike('building_name', `%${searchTerm}%`);
    }

    const { data: igrData, error: igrError } = await igrQuery;
    if (igrError) throw new Error(igrError.message);

    const [resStream, comStream] = await Promise.all([
      getClient().from('stream_items_residential').select('building_name').ilike('building_name', `%${searchTerm || ''}%`),
      getClient().from('stream_items_commercial').select('building_name').ilike('building_name', `%${searchTerm || ''}%`),
    ]);
    const streamData = [
      ...(Array.isArray(resStream.data) ? resStream.data : []),
      ...(Array.isArray(comStream.data) ? comStream.data : []),
    ];

    const freq = new Map<string, number>();
    for (const row of (igrData || []) as Array<{ building_name: string | null }>) {
      const name = row.building_name?.trim();
      if (name && name.length >= minLength) {
        freq.set(name, (freq.get(name) || 0) + 1);
      }
    }
    for (const row of (streamData || []) as Array<{ building_name: string | null }>) {
      const name = row.building_name?.trim();
      if (name && name.length >= minLength) {
        freq.set(name, (freq.get(name) || 0) + 1);
      }
    }

    return Array.from(freq.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 20);
  }

  async searchTransactions(query: SearchQuery) {
    let request = getClient()
      .from('igr_transactions')
      .select('doc_number, reg_date, source, building_name, locality, consideration, area_sqft, price_per_sqft, config, property_type, district')
      .order('reg_date', { ascending: false })
      .limit(10);

    if (query.locality?.trim()) {
      request = request.ilike('locality', `%${query.locality.trim()}%`);
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

    return (data || []).map((row) => ({
      ...row,
      consideration: toNumber(row.consideration),
      area_sqft: toNumber(row.area_sqft),
      price_per_sqft: toNumber(row.price_per_sqft),
    }));
  }
}

export const igrQueryService = new IgrQueryService();
