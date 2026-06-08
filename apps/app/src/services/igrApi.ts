import backendApi from './api';
import { ENDPOINTS } from './endpoints';

export type IgrTransaction = {
  doc_number: string | null;
  registration_date: string | null;
  sro_office: string | null;
  district: string | null;
  article_type: string | null;
  consideration_amount: number | null;
  rent_amount: number | null;
  deposit_amount: number | null;
  lease_duration: number | null;
  property_description: string | null;
  building_name: string | null;
  city?: string | null;
  buyer_name?: string | null;
  seller_name?: string | null;
  village_locality: string | null;
  area_sqft: number | null;
  source: string | null;
  scraped_at: string | null;
};

export type IgrSearchResponse = {
  buildingName: string | null;
  locality: string | null;
  city?: string | null;
  months: number;
  transactions: IgrTransaction[];
  latestTransaction: IgrTransaction | null;
  localityStats: {
    locality: string;
    months: number;
    avg_price_per_sqft: number | null;
    median_consideration: number | null;
    min_consideration: number | null;
    max_consideration: number | null;
    transaction_count: number;
  } | null;
};

export type IgrFetchResponse = {
  success: boolean;
  searchQuery?: string;
  sourceUrl?: string | null;
  extracted?: Record<string, unknown> | null;
  saved?: boolean;
  docNumber?: string | null;
  error?: string | null;
};

export type IgrQueueStatusPreview = {
  status: 'pending' | 'done' | 'failed';
  buildingName: string;
  locality: string | null;
  city: string | null;
  queuedAt: string;
  lastCheckedAt: string | null;
  nextRetryAt: string | null;
};

export type IgrBuildingName = {
  name: string;
  city: string | null;
  count: number;
  igrQueueStatus?: IgrQueueStatusPreview | null;
};

export async function fetchIgrSearch(buildingName?: string, locality?: string, city?: string, months = 6, limit = 10) {
  const response = await backendApi.get<IgrSearchResponse>(ENDPOINTS.igr.search, {
    params: {
      building_name: buildingName || undefined,
      locality: locality || undefined,
      city: city || undefined,
      months,
      limit,
    },
  });
  return response.data;
}

export async function fetchBuildingNames(search?: string) {
  const response = await backendApi.get<{ names: IgrBuildingName[] }>(
    ENDPOINTS.igr.buildingNames,
    { params: { search: search || undefined } },
  );
  return response.data.names;
}

export async function fetchAndSaveLiveIgr(buildingName?: string, locality?: string, city?: string) {
  const response = await backendApi.post<IgrFetchResponse>(ENDPOINTS.igr.fetch, {
    buildingName,
    locality,
    city,
  });
  return response.data;
}
