alter table stream_items add column if not exists property_category text not null default 'residential' check (property_category in ('residential', 'commercial'));

alter table stream_items add column if not exists area_sqft numeric;
alter table stream_items add column if not exists property_use text;
alter table stream_items add column if not exists floor_number text;
alter table stream_items add column if not exists total_floors text;
alter table stream_items add column if not exists furnishing text check (furnishing in ('unfurnished', 'semi-furnished', 'fully-furnished'));

create index if not exists idx_stream_items_property_category on stream_items (tenant_id, property_category);
