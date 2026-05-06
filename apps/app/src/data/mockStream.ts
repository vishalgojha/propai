export interface StreamItem {
  id: string;
  type: 'Rent' | 'Sale' | 'Requirement' | 'Pre-leased' | 'Lease';
  title?: string;
  location: string;
  city?: string;
  price: string;
  priceNumeric?: number | null;
  bhk: string;
  posted: string;
  createdAt?: string;
  source: string;
  sourcePhone?: string | null;
  confidence: number;
  description: string;
  rawText?: string;
  recordType?: string;
  dealType?: string;
  assetClass?: string;
  parseNotes?: string | null;
  isCorrected?: boolean;
  propertyCategory?: 'residential' | 'commercial';
  areaSqft?: number | null;
  propertyUse?: string;
  floorNumber?: string;
  totalFloors?: string;
  furnishing?: 'unfurnished' | 'semi-furnished' | 'fully-furnished';
}

type RawStreamItem = Omit<StreamItem, 'confidence'>;

const rawStream: RawStreamItem[] = [
  {
    id: 'L-1029',
    type: 'Sale',
    location: 'Bandra West, Mount Mary',
    price: '9.5 Cr',
    bhk: '3 BHK',
    posted: '10m ago',
    source: 'Bandra Homes Experts',
    description: 'Ultra luxury 3BHK for sale. Mountain facing, semi-furnished. 1500 sqft carpet. One of the best views in Mumbai. Owner moving abroad.',
  },
  {
    id: 'L-1028',
    type: 'Rent',
    location: 'Powai, Hiranandani',
    price: '85k',
    bhk: '2 BHK',
    posted: '25m ago',
    source: 'Powai Broking Hub',
    description: 'Spacious 2BHK in Odyssey Tower. High floor, garden view. Full modular kitchen. Immediate possession.',
  },
  {
    id: 'L-1027',
    type: 'Requirement',
    location: 'Worli, Sea Face',
    price: 'Unspecified',
    bhk: '4+ BHK',
    posted: '45m ago',
    source: 'Exclusive South Mumbai',
    description: 'VHN client looking for standalone bungalow or sea facing 4+ BHK penthouse in Worli. Budget no bar for right property.',
  },
  {
    id: 'L-1026A',
    type: 'Pre-leased',
    location: 'Juhu, Gulmohar Road',
    price: '3.1 Cr',
    bhk: '2 BHK',
    posted: '55m ago',
    source: 'Elite Investor Desk',
    description: 'Pre-leased investment apartment with tenant locked in for 18 months. Good rental yield and stable occupancy.',
  },
  {
    id: 'L-1026',
    type: 'Sale',
    location: 'Kandivali East, Thakur Village',
    price: '2.2 Cr',
    bhk: '2 BHK',
    posted: '1h ago',
    source: 'Western Suburbs Elite',
    description: '2BHK flat available in Gagan Towers. East facing, vaastu compliant. Renovation recently done.',
  },
  {
    id: 'L-1025',
    type: 'Rent',
    location: 'Andheri West, Lokhandwala',
    price: '45k',
    bhk: '1 BHK',
    posted: '2h ago',
    source: 'Andheri Network',
    description: 'Fully furnished 1BHK for bachelors/couples. Near Joggers park. CCTV, security, 24/7 water.',
  },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseRecencyMinutes = (posted: string) => {
  const normalized = posted.trim().toLowerCase();
  const minutesMatch = normalized.match(/^(\d+(?:\.\d+)?)m/);
  if (minutesMatch) return Number(minutesMatch[1]);

  const hoursMatch = normalized.match(/^(\d+(?:\.\d+)?)h/);
  if (hoursMatch) return Number(hoursMatch[1]) * 60;

  const daysMatch = normalized.match(/^(\d+(?:\.\d+)?)d/);
  if (daysMatch) return Number(daysMatch[1]) * 60 * 24;

  if (normalized.includes('today')) return 30;
  if (normalized.includes('yesterday')) return 24 * 60 + 30;
  return 12 * 60;
};

const hasPriceSignal = (price: string) => {
  if (!price) return 0;
  const lower = price.toLowerCase();
  if (lower.includes('unspecified') || lower.includes('n/a') || lower === 'na' || lower.includes('negotiable')) return 0;
  const normalized = lower.split('').filter(c => c !== ' ').join('');
  if (normalized.split('').some(c => c >= '0' && c <= '9')) return normalized.includes('cr') || normalized.includes('k') || normalized.includes('l') ? 1 : 0.82;
  return 0.4;
};

const hasBhkSignal = (bhk: string) => {
  const trimmed = bhk.trim().toLowerCase();
  const bhkValues = ['1bhk', '2bhk', '3bhk', '4bhk', '5bhk'];
  return bhkValues.some(v => trimmed.startsWith(v)) || trimmed.endsWith('bhk') ? 1 : 0.78;
};

const describeSignalStrength = (description: string) => {
  const text = description.toLowerCase();
  const keywordHits = [
    'immediate',
    'ready possession',
    'semi-furnished',
    'furnished',
    'vaastu',
    'negotiable',
    'tenant',
    'rental yield',
    'sea facing',
    'garden view',
    'cctv',
    'security',
    'modular kitchen',
    'carpet',
    'owner',
  ].filter((keyword) => text.includes(keyword)).length;

  const lengthScore = clamp(description.length / 180, 0.35, 1);
  const bonus = clamp(keywordHits * 0.06, 0, 0.24);
  return clamp(lengthScore + bonus, 0.4, 1);
};

const calculateStreamConfidence = (item: RawStreamItem) => {
  const recencyMinutes = parseRecencyMinutes(item.posted);
  const recencyScore = clamp(1 - recencyMinutes / (24 * 60 * 3), 0.55, 1);
  const locationScore = item.location.trim().length > 0 ? 1 : 0.45;
  const sourceScore = item.source.trim().split(/\s+/).length >= 2 ? 1 : 0.72;
  const priceScore = hasPriceSignal(item.price);
  const bhkScore = hasBhkSignal(item.bhk);
  const descriptionScore = describeSignalStrength(item.description);

  const weighted =
    (locationScore * 0.22) +
    (sourceScore * 0.14) +
    (priceScore * 0.18) +
    (bhkScore * 0.12) +
    (descriptionScore * 0.22) +
    (recencyScore * 0.12);

  return Math.round(clamp(weighted * 100, 45, 99));
};

export const mockStream: StreamItem[] = rawStream.map((item) => ({
  ...item,
  confidence: calculateStreamConfidence(item),
}));
