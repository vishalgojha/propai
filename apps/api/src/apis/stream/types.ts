export interface StreamItem {
  id: string;
  type: 'property' | 'stream' | 'commercial';
  title?: string;
  location: string;
  city?: string;
  price: string;
  priceNumeric?: number;
  bhk: string;
  propertyCategory: 'residential' | 'commercial';
  areaSqft?: number;
  confidence: number;
  source: string;
  sourcePhone?: string;
  isRead: boolean;
  createdAt: string;
}

export interface StreamFilters {
  type?: string[];
  category?: 'residential' | 'commercial';
  locality?: string;
  minConfidence?: number;
  source?: string;
  isRead?: boolean;
  search?: string;
}

export interface StreamStats {
  total: number;
  unread: number;
  avgConfidence: number;
}

export interface StreamChannel {
  phone: string;
  label: string;
  count: number;
}
