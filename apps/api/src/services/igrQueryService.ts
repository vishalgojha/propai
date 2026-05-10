import { supabase, supabaseAdmin } from '../config/supabase';

type TransactionRecord = {
  doc_number: string | null;
  reg_date: string | null;
  building_name: string | null;
  locality: string | null;
  consideration: number | null;
  area_sqft: number | null;
  price_per_sqft: number | null;
  config: string | null;
};

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
  async getLastTransactionForBuilding(buildingName: string): Promise<TransactionRecord | null> {
    const name = buildingName.trim();
    if (!name) return null;

    const { data, error } = await getClient()
      .from('igr_transactions')
      .select('doc_number, reg_date, building_name, locality, consideration, area_sqft, price_per_sqft, config')
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
        .select('doc_number, reg_date, building_name, locality, consideration, area_sqft, price_per_sqft, config')
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

      return {
        doc_number: best.doc_number ?? null,
        reg_date: best.reg_date ?? null,
        building_name: best.building_name ?? null,
        locality: best.locality ?? null,
        consideration: toNumber(best.consideration),
        area_sqft: toNumber(best.area_sqft),
        price_per_sqft: toNumber(best.price_per_sqft),
        config: best.config ?? null,
      };
    }

    return {
      doc_number: data.doc_number ?? null,
      reg_date: data.reg_date ?? null,
      building_name: data.building_name ?? null,
      locality: data.locality ?? null,
      consideration: toNumber(data.consideration),
      area_sqft: toNumber(data.area_sqft),
      price_per_sqft: toNumber(data.price_per_sqft),
      config: data.config ?? null,
    };
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

  async searchTransactions(query: SearchQuery) {
    let request = getClient()
      .from('igr_transactions')
      .select('doc_number, reg_date, building_name, locality, consideration, area_sqft, price_per_sqft, config, property_type, district')
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
