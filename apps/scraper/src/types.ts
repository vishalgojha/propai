export interface RawMessage {
  id: string;
  chat_jid: string;
  sender: string;
  content: string;
  timestamp: string;
  chat_name: string;
}

export interface ExtractedListing {
  message_id: string;
  chat_name: string;
  sender: string;
  timestamp: string;
  bhk: string | null;
  transaction_type: string | null;
  locality: string | null;
  furnishing: string | null;
  parking: number;
  area_sqft: number | null;
  price_value: number | null;
  price_unit: string | null;
  price_lakhs: number | null;
  prices_json: string;
  all_localities_json: string;
  phones_json: string;
  content_preview: string;
  content_hash: string;
  listing_hash: string | null;
}

export interface Price {
  value: number;
  unit: "Cr" | "Lac" | "K";
}

export interface Area {
  value: number;
  unit: "sqft";
}

export interface IngestPayload {
  message_id: string;
  chat_name: string;
  sender: string;
  timestamp: string;
  content: string;
  bhk: string | null;
  transaction_type: string | null;
  locality: string | null;
  localities: string[];
  furnishing: string | null;
  parking: number;
  area_sqft: number | null;
  price_value: number | null;
  price_unit: string | null;
  price_lakhs: number | null;
  prices: Price[];
  phones: string[];
  phone: string | null;
  content_preview: string;
}
