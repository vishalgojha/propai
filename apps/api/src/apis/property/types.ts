export interface PropertyItem {
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
  propertyUse?: string;
  confidence: number;
  source: string;
  sourcePhone?: string;
  isRead: boolean;
  createdAt: string;
}

export interface PropertyFilters {
  type?: string[];
  category?: 'residential' | 'commercial';
  bhk?: string;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  source?: string;
  confidenceMin?: number;
}

export type PropertyCategory = 'residential' | 'commercial';

export interface PropertyStats {
  total: number;
  residential: number;
  commercial: number;
  avgConfidence: number;
}
