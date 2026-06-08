alter table wa_click_events
    add column if not exists listing_type text,
    add column if not exists locality text,
    add column if not exists building_name text,
    add column if not exists bhk text,
    add column if not exists price_label text,
    add column if not exists area_sqft numeric;

create index if not exists idx_wa_click_events_locality
    on wa_click_events (locality);

create index if not exists idx_wa_click_events_listing_type
    on wa_click_events (listing_type);