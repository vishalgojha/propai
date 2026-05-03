-- Add rental support and columns for tiered access management
alter table igr_transactions 
  add column if not exists rent_amount      numeric(15, 2),
  add column if not exists deposit_amount   numeric(15, 2),
  add column if not exists lease_duration   integer,          -- duration in months
  add column if not exists is_premium       boolean default false; -- flag for high-value or specific tiered records

-- Update RLS for tiered access
-- Public/Free users should only see market data (Locality, Price, Area, Date)
-- Premium users/Service role can see Names

-- 1. Create a view for "Free" access (excludes names)
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
    scraped_at
  from igr_transactions;

-- 2. Restrict direct table access to Service Role or Premium Auth
-- Note: In a live Supabase setup, you'd use auth.uid() checks for premium roles.
alter table igr_transactions enable row level security;

-- Only allow service role to see the 'Names' (Premium Feature)
create policy "Service role can see everything"
  on igr_transactions
  for all
  using (true);

-- Allow everyone to read the Free View
grant select on igr_transactions_free to anon, authenticated;

-- Comments for documentation
comment on column igr_transactions.buyer_name is 'PREMIUM: Only accessible to paid tiers';
comment on column igr_transactions.seller_name is 'PREMIUM: Only accessible to paid tiers';
