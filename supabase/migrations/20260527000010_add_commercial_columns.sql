-- Add commercial-specific columns to stream_items_commercial
-- These enable proper UI rendering for office/retail/warehouse listings

alter table stream_items_commercial
    add column if not exists commercial_type text,
    add column if not exists fitout_status text,
    add column if not exists workstations_count integer,
    add column if not exists cabins_count integer;

create index if not exists idx_stream_com_commercial_type
    on stream_items_commercial (commercial_type);

create index if not exists idx_stream_com_fitout_status
    on stream_items_commercial (fitout_status);
