export interface PropertyListing {
  id: string;
  title: string;
  type: 'RENT' | 'SALE';
  propertyType: 'APARTMENT' | 'VILLA' | 'PLOT' | 'COMMERCIAL';
  location: string;
  city: string;
  price: string;
  area: string;
  bhk?: number;
  source: 'WHATSAPP' | 'DIRECT';
  sourceName: string;
  timestamp: string;
  tags: string[];
  description: string;
  status: 'VERIFIED' | 'PENDING' | 'INVALID';
}

export interface WhatsAppSession {
  id: string;
  phoneNumber: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'PAIRING';
  lastSeen: string;
  groupsTracked: number;
}
