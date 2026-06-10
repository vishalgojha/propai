export interface StreamItem {
  id: string;
  type: 'Rent' | 'Sale' | 'Requirement' | 'Pre-leased' | 'Lease';
  title?: string;
  location: string;
  city?: string;
  price: string;
  priceNumeric?: number | null;
  configuration: string;
  posted: string;
  createdAt?: string;
  source: string;
  sourcePhone?: string | null;
  description: string;
  rawText?: string;
  recordType?: string;
  dealType?: string;
  assetClass?: string;
  isCorrected?: boolean;
  propertyCategory?: 'residential' | 'commercial';
  areaSqft?: number | null;
  propertyUse?: string;
  floorNumber?: string;
  totalFloors?: string;
  furnishing?: 'unfurnished' | 'semi-furnished' | 'fully-furnished';
}

export const mockStream: StreamItem[] = [
  {
    id: 'L-1029',
    type: 'Sale',
    location: 'Bandra West, Mount Mary',
    price: '9.5 Cr',
    configuration: '3 BHK',
    posted: '10m ago',
    source: 'Bandra Homes Experts',
    description: 'Ultra luxury 3BHK for sale. Mountain facing, semi-furnished. 1500 sqft carpet. One of the best views in Mumbai. Owner moving abroad.',
  },
  {
    id: 'L-1028',
    type: 'Rent',
    location: 'Powai, Hiranandani',
    price: '85k',
    configuration: '2 BHK',
    posted: '25m ago',
    source: 'Powai Broking Hub',
    description: 'Spacious 2BHK in Odyssey Tower. High floor, garden view. Full modular kitchen. Immediate possession.',
  },
  {
    id: 'L-1027',
    type: 'Requirement',
    location: 'Worli, Sea Face',
    price: 'Unspecified',
    configuration: '4+ BHK',
    posted: '45m ago',
    source: 'Exclusive South Mumbai',
    description: 'VHN client looking for standalone bungalow or sea facing 4+ BHK penthouse in Worli. Budget no bar for right property.',
  },
  {
    id: 'L-1026A',
    type: 'Pre-leased',
    location: 'Juhu, Gulmohar Road',
    price: '3.1 Cr',
    configuration: '2 BHK',
    posted: '55m ago',
    source: 'Elite Investor Desk',
    description: 'Pre-leased investment apartment with tenant locked in for 18 months. Good rental yield and stable occupancy.',
  },
  {
    id: 'L-1026',
    type: 'Sale',
    location: 'Kandivali East, Thakur Village',
    price: '2.2 Cr',
    configuration: '2 BHK',
    posted: '1h ago',
    source: 'Western Suburbs Elite',
    description: '2BHK flat available in Gagan Towers. East facing, vaastu compliant. Renovation recently done.',
  },
  {
    id: 'L-1025',
    type: 'Rent',
    location: 'Andheri West, Lokhandwala',
    price: '45k',
    configuration: '1 BHK',
    posted: '2h ago',
    source: 'Andheri Network',
    description: 'Fully furnished 1BHK for bachelors/couples. Near Joggers park. CCTV, security, 24/7 water.',
  },
];
