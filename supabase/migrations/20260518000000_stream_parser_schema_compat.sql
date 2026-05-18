alter table if exists public.stream_items
  add column if not exists property_category text,
  add column if not exists area_sqft numeric,
  add column if not exists furnishing text,
  add column if not exists floor_number text,
  add column if not exists total_floors text,
  add column if not exists property_use text;

alter table if exists public.raw_dump
  add column if not exists session_id text,
  add column if not exists rejection_reason text;
