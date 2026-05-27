-- Add broker_wa_me_links array column to both stream tables
-- Replaces raw phone text with sanitized wa.me click-to-chat links

alter table stream_items_residential
    add column if not exists broker_wa_me_links text[] not null default '{}';

alter table stream_items_commercial
    add column if not exists broker_wa_me_links text[] not null default '{}';

create index if not exists idx_stream_res_wa_links
    on stream_items_residential using gin (broker_wa_me_links);

create index if not exists idx_stream_com_wa_links
    on stream_items_commercial using gin (broker_wa_me_links);

-- Backfill: generate wa.me links from existing source_phone
update stream_items_residential
set broker_wa_me_links = array['https://wa.me/' || regexp_replace(source_phone, '[^0-9]', '', 'g')]
where source_phone is not null and source_phone != '' and (broker_wa_me_links is null or broker_wa_me_links = '{}');

update stream_items_commercial
set broker_wa_me_links = array['https://wa.me/' || regexp_replace(source_phone, '[^0-9]', '', 'g')]
where source_phone is not null and source_phone != '' and (broker_wa_me_links is null or broker_wa_me_links = '{}');

notify pgrst, 'reload schema';
