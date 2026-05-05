export type PublicListingType = 'rent' | 'sale' | 'requirement';

export interface PublicListingContact {
  name: string | null;
  number: string;
  waUrl: string;
}

export interface PublicListingSummary {
  id: string;
  type: PublicListingType;
  title: string;
  location: string;
  area: string | null;
  subArea: string | null;
  price: number | null;
  priceType: string | null;
  bhk: number | null;
  sizeSqft: number | null;
  propertyType: string | null;
  furnishing: string | null;
  description: string;
  postedAt: string | null;
  contact: PublicListingContact | null;
}

export interface PublicListingDetail extends PublicListingSummary {
  sourceGroupId: string | null;
  sourceGroupName: string | null;
  rawMessage: string | null;
  cleanedMessage: string | null;
  confidence: number | null;
}

export interface PublicListingsResponse {
  items: PublicListingSummary[];
  total: number;
}

export interface PublicListingResponse {
  item: PublicListingDetail | null;
}

export interface PublicAreasResponse {
  items: string[];
}

export interface PublicSitemapFeedResponse {
  areas: string[];
  listingIds: string[];
}
