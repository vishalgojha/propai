alter table if exists public.igr_transactions
  add column if not exists city text;

create index if not exists idx_igr_city
  on public.igr_transactions (city);

create or replace view igr_transactions_free as
  select
    id,
    doc_number,
    registration_date,
    sro_office,
    district,
    article_type,
    consideration_amount,
    rent_amount,
    deposit_amount,
    village_locality,
    city,
    area_sqft,
    source,
    scraped_at
  from igr_transactions;

grant select on igr_transactions_free to anon, authenticated;

alter table if exists public.igr_enrichment_queue
  add column if not exists city text not null default '';

alter table if exists public.igr_enrichment_queue
  drop constraint if exists igr_enrichment_queue_building_name_locality_key;

create unique index if not exists idx_igr_enrichment_queue_building_locality_city
  on public.igr_enrichment_queue (building_name, locality, city);

alter table if exists public.igr_transactions
  alter column city drop not null;
