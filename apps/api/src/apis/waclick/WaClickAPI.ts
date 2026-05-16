import { supabase } from '../../config/supabase';
import type { WaClickStats, WaClickListingLog, WaClickLogEntry } from './types';

export class WaClickAPI {
    async logClick(params: {
        listingId: string;
        brokerPhone: string;
        userId: string;
        workspaceId: string;
        source?: string;
        device?: string;
    }) {
        const { error } = await supabase.from('wa_click_events').insert({
            listing_id: params.listingId,
            broker_phone: params.brokerPhone,
            user_id: params.userId,
            workspace_id: params.workspaceId,
            source: params.source || 'stream',
            device: params.device || 'web',
        });

        return { success: !error, error: error?.message || null };
    }

    async getStats(workspaceId: string, date?: string): Promise<WaClickStats> {
        const day = date || new Date().toISOString().slice(0, 10);
        const start = `${day}T00:00:00+05:30`;
        const end = `${day}T23:59:59+05:30`;

        const { data, error } = await supabase
            .from('wa_click_events')
            .select('listing_id, clicked_at')
            .eq('workspace_id', workspaceId)
            .gte('clicked_at', start)
            .lte('clicked_at', end);

        if (error || !data) {
            return { total_clicks: 0, unique_listings: 0, last_click_at: null, by_listing: {} };
        }

        const byListing: Record<string, { count: number; last_clicked_at: string }> = {};
        let lastClick: string | null = null;

        for (const row of data) {
            const id = row.listing_id;
            if (!byListing[id]) {
                byListing[id] = { count: 0, last_clicked_at: row.clicked_at };
            }
            byListing[id].count += 1;
            if (row.clicked_at > (byListing[id].last_clicked_at || '')) {
                byListing[id].last_clicked_at = row.clicked_at;
            }
            if (!lastClick || row.clicked_at > lastClick) {
                lastClick = row.clicked_at;
            }
        }

        return {
            total_clicks: data.length,
            unique_listings: Object.keys(byListing).length,
            last_click_at: lastClick,
            by_listing: byListing,
        };
    }

    async getListingLog(listingId: string, workspaceId: string, limit = 20): Promise<WaClickListingLog> {
        const { data, error } = await supabase
            .from('wa_click_events')
            .select('clicked_at, source, device')
            .eq('listing_id', listingId)
            .eq('workspace_id', workspaceId)
            .order('clicked_at', { ascending: false })
            .limit(limit);

        if (error || !data) {
            return { listing_id: listingId, total: 0, events: [] };
        }

        const events: WaClickLogEntry[] = data.map((row: any) => ({
            clicked_at: row.clicked_at,
            source: row.source,
            device: row.device,
        }));

        return {
            listing_id: listingId,
            total: events.length,
            events,
        };
    }

    async getExportRows(workspaceId: string, date?: string) {
        let query = supabase
            .from('wa_click_events')
            .select('clicked_at, listing_id, source, device')
            .eq('workspace_id', workspaceId);

        if (date) {
            const start = `${date}T00:00:00+05:30`;
            const end = `${date}T23:59:59+05:30`;
            query = query.gte('clicked_at', start).lte('clicked_at', end);
        }

        const { data, error } = await query.order('clicked_at', { ascending: false });

        if (error || !data) return [];
        return data;
    }

    async getBrokerPhone(listingId: string, workspaceId: string): Promise<string | null> {
        const { data, error } = await supabase
            .from('stream_items')
            .select('source_phone')
            .eq('id', listingId);

        if (error || !data || !data.length) {
            const { data: listingData } = await supabase
                .from('listings')
                .select('structured_data')
                .eq('id', listingId)
                .single();

            if (listingData?.structured_data) {
                const sd = listingData.structured_data as Record<string, unknown>;
                const phone = sd.contact_number || sd.phone || null;
                return phone ? String(phone) : null;
            }
            return null;
        }

        return (data[0] as any).source_phone || null;
    }
}
