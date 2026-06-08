-- WIPE ALL LISTINGS AND REQUIREMENTS
-- Run this to clear all stream data and public listings

-- 1. Clear public property leads (depends on public_listings)
truncate table public.public_property_leads cascade;

-- 2. Clear public listings (www)
truncate table public.public_listings cascade;

-- 3. Clear stream items (app) - both residential and commercial
truncate table public.stream_items_residential cascade;
truncate table public.stream_items_commercial cascade;

-- 4. Clear base stream_items if it exists and has data
truncate table public.stream_items cascade;

-- 5. Clear channel_items (references stream_items)
truncate table public.channel_items cascade;

-- 6. Clear broker_channels (optional - keep channels but remove items)
-- truncate table public.broker_channels cascade;

-- 7. Clear wa_click_events (references listings)
truncate table public.wa_click_events cascade;

-- 8. Clear igr_enrichment_queue (references stream_items)
truncate table public.igr_enrichment_queue cascade;

-- 9. Clear search_reference (built from stream data)
truncate table public.search_reference cascade;

-- Reset sequences if any
-- (Not needed for UUID tables, but keeping for completeness)

notify pgrst, 'reload schema';