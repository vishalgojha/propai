alter table public.stream_items
    add column if not exists building_name text;

create index if not exists idx_stream_items_building_name
    on public.stream_items (building_name);

alter table public.public_listings
    add column if not exists building_name text;

update public.stream_items
set building_name = nullif(trim(parsed_payload ->> 'buildingName'), '')
where building_name is null
  and nullif(trim(parsed_payload ->> 'buildingName'), '') is not null;
