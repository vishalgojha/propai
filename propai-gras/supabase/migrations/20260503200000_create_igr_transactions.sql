-- IGR Transactions Table
-- Created: 2026-05-03

create table if not exists igr_transactions (
  id                   bigserial primary key,
  doc_number           text not null unique,          -- IGR document number (upsert key)
  registration_date    date,
  sro_office           text,
  district             text,
  article_type         text default '25',             -- 25 = Sale Deed
  consideration_amount numeric(15, 2),                -- transaction value INR
  property_description text,
  buyer_name           text,
  seller_name          text,
  village_locality     text,
  area_sqft            numeric(10, 2),
  scraped_at           timestamptz default now(),

  -- useful indexes for PropAI queries
  constraint igr_transactions_doc_number_unique unique (doc_number)
);

-- Indexes for common queries
create index if not exists idx_igr_date        on igr_transactions (registration_date desc);
create index if not exists idx_igr_sro         on igr_transactions (sro_office);
create index if not exists idx_igr_locality    on igr_transactions (village_locality);
create index if not exists idx_igr_amount      on igr_transactions (consideration_amount);
create index if not exists idx_igr_buyer       on igr_transactions (buyer_name);
create index if not exists idx_igr_seller      on igr_transactions (seller_name);

-- Enable Row Level Security (optional but recommended)
alter table igr_transactions enable row level security;

-- Allow service role full access (used by scraper)
create policy "service role full access"
  on igr_transactions
  for all
  using (true)
  with check (true);
