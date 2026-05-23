import backendApi from './api';
import { ENDPOINTS } from './endpoints';

export type BrokerContact = {
  id: string;
  tenant_id: string;
  phone: string;
  display_name: string | null;
  inferred_areas: string[];
  source_groups: string[];
  group_count: number;
  unsubscribed: boolean;
  unsubscribed_at: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  listing_count: number;
  asset_types: string[];
  price_range_low: number | null;
  price_range_high: number | null;
};

export type BrokerContactOverlap = Omit<BrokerContact, 'tenant_id' | 'source_groups' | 'last_seen_at' | 'created_at' | 'updated_at'> & {
  source_groups: Array<{
    id: string;
    name: string;
    locality: string | null;
    category: string | null;
    sessionLabel: string | null;
  }>;
  last_seen_at: string | null;
};

export async function fetchBrokerContacts(): Promise<BrokerContact[]> {
  const response = await backendApi.get(ENDPOINTS.brokerContacts.list);
  return Array.isArray(response.data) ? (response.data as BrokerContact[]) : [];
}

export async function fetchBrokerContactOverlaps(): Promise<BrokerContactOverlap[]> {
  const response = await backendApi.get(ENDPOINTS.brokerContacts.overlaps);
  return Array.isArray(response.data) ? (response.data as BrokerContactOverlap[]) : [];
}
