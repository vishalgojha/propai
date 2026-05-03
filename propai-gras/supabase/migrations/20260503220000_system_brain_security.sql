-- SECURE THE MOAT: Names are system-internal only
-- This ensures the AI Agent can use the names for logic, but never expose them to users.

-- 1. Tighten the Main Table
alter table igr_transactions enable row level security;

-- 2. Define the "System Brain" Policy
-- Only the Service Role (used by the AI Backend) can see the names.
drop policy if exists "Owner only access to names" on igr_transactions;
create policy "System Brain Access"
  on igr_transactions
  for select
  using (auth.jwt() ->> 'role' = 'service_role');

-- 3. Public Analytics View (No Names)
-- This is what the app.propai.live users/frontend will see.
drop view if exists igr_market_data;
create or replace view igr_market_data as
  select 
    id, 
    registration_date, 
    village_locality, 
    area_sqft, 
    consideration_amount, 
    rent_amount, 
    article_type,
    (consideration_amount / nullif(area_sqft, 0)) as rate_psf
  from igr_transactions;

grant select on igr_market_data to anon, authenticated;
