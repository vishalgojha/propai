export interface WaClickEvent {
    id: string;
    listing_id: string;
    broker_phone: string;
    user_id: string;
    workspace_id: string;
    source: string;
    device: string;
    clicked_at: string;
}

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
