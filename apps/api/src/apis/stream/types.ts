export interface StreamItem {
  id: string;
  type: 'Rent' | 'Sale' | 'Lease' | 'Requirement' | 'Pre-leased';
  title?: string;
  location: string;
  buildingName?: string | null;
  microLocation?: string | null;
  city?: string;
  price: string;
  priceNumeric?: number;
  bhk: string;
  propertyCategory: 'residential' | 'commercial';
  areaSqft?: number;
  furnishing?: string | null;
  floorNumber?: string | null;
  totalFloors?: string | null;
  propertyUse?: string | null;
  commercialType?: string | null;
  fitoutStatus?: string | null;
  workstationsCount?: number | null;
  cabinsCount?: number | null;
  source: string;
  brokerName: string | null;
  brokerCompany: string | null;
  waLink: string | null;
  assetClass?: string | null;
  description?: string | null;
  rawText?: string | null;
  isNetworkItem?: boolean;
  isSyndicated?: boolean;
  sourceWorkspaceId?: string;
  sourceWorkspaceName?: string;
  isRead: boolean;
  createdAt: string;
  igrTransactions?: IgrTransactionPreview[];
  igrQueueStatus?: IgrQueueStatusPreview | null;
}

export interface IgrTransactionPreview {
  doc_number: string | null;
  reg_date: string | null;
  building_name: string | null;
  locality: string | null;
  consideration: number | null;
  area_sqft: number | null;
  price_per_sqft: number | null;
  config: string | null;
}

export interface IgrQueueStatusPreview {
  status: 'pending' | 'done' | 'failed';
  buildingName: string;
  locality: string | null;
  city: string | null;
  queuedAt: string;
  lastCheckedAt: string | null;
  nextRetryAt: string | null;
}

export interface StreamFilters {
  type?: string[];
  category?: 'residential' | 'commercial';
  locality?: string;
  source?: string;
  isRead?: boolean;
  search?: string;
}

export interface StreamStats {
  total: number;
  unread: number;
}

export interface StreamChannel {
  phone: string;
  label: string;
  count: number;
}
