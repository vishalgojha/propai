-- IGR Transactions Table
-- Source: Maharashtra Inspector General of Registration portal
-- Same data source as Zapkey/Propstack
-- Upsert key: doc_number

create table if not exists igr_transactions (
  id                   bigserial primary key,
  doc_number           text not null unique,
  registration_date    date,
  sro_office           text,
  district             text,
  article_type         text default '25',             -- 25 = Sale Deed
  consideration_amount numeric(15, 2),                -- transaction value INR
  rent_amount          numeric(15, 2),                -- for lease transactions
  deposit_amount       numeric(15, 2),
  lease_duration       integer,                        -- duration in months
  property_description text,
  building_name        text,
  buyer_name           text,                          -- premium: service role only
  seller_name          text,                          -- premium: service role only
  village_locality     text,
  area_sqft            numeric(10, 2),
  source               text default 'igr_scanner',
  scraped_at           timestamptz default now()
);

-- Indexes for common queries
create index if not exists idx_igr_date        on igr_transactions (registration_date desc);
create index if not exists idx_igr_sro         on igr_transactions (sro_office);
create index if not exists idx_igr_locality    on igr_transactions (village_locality);
create index if not exists idx_igr_amount      on igr_transactions (consideration_amount);
create index if not exists idx_igr_building    on igr_transactions (building_name);
create index if not exists idx_igr_buyer       on igr_transactions (buyer_name);
create index if not exists idx_igr_seller      on igr_transactions (seller_name);
create index if not exists idx_igr_district    on igr_transactions (district);

-- Free view (excludes names for non-premium users)
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
    area_sqft,
    source,
    scraped_at
  from igr_transactions;

-- RLS
alter table igr_transactions enable row level security;

-- Service role full access (used by scraper + premium queries)
create policy "service_role_full_access"
  on igr_transactions
  for all
  using (true)
  with check (true);

-- Allow anon/authenticated to read the free view
grant select on igr_transactions_free to anon, authenticated;
