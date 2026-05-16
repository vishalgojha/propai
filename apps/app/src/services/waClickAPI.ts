import backendApi from './api';
import { ENDPOINTS } from './endpoints';

export interface WaClickStats {
    total_clicks: number;
    unique_listings: number;
    last_click_at: string | null;
    by_listing: Record<string, { count: number; last_clicked_at: string }>;
}

export interface WaClickLogEntry {
    clicked_at: string;
    source: string;
    device: string;
}

export interface WaClickListingLog {
    listing_id: string;
    total: number;
    events: WaClickLogEntry[];
}

export async function logWaClick(listingId: string, source = 'stream', device = 'web'): Promise<{ redirect_url: string; logged: boolean } | null> {
    try {
        const response = await backendApi.post(ENDPOINTS.waClick.log, { listing_id: listingId, source, device });
        return response.data as { redirect_url: string; logged: boolean };
    } catch {
        return null;
    }
}

export async function fetchWaClickStats(date?: string): Promise<WaClickStats> {
    try {
        const params: Record<string, string> = {};
        if (date) params.date = date;
        const response = await backendApi.get(ENDPOINTS.waClick.stats, { params });
        return response.data as WaClickStats;
    } catch {
        return { total_clicks: 0, unique_listings: 0, last_click_at: null, by_listing: {} };
    }
}

export async function fetchWaClickListingLog(listingId: string): Promise<WaClickListingLog> {
    try {
        const response = await backendApi.get(ENDPOINTS.waClick.listing(listingId));
        return response.data as WaClickListingLog;
    } catch {
        return { listing_id: listingId, total: 0, events: [] };
    }
}

export function getWaClickExportUrl(date?: string): string {
    const params = date ? `?date=${encodeURIComponent(date)}` : '';
    return ENDPOINTS.waClick.export + params;
}
