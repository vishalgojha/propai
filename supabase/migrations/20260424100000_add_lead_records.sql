-- Lead storage table for supervisor-approved writes
create table if not exists public.lead_records (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid references public.profiles(id) on delete cascade not null,
  lead_id text not null,
  phone text not null,
  name text not null,
  record_type text check (record_type in ('inventory_listing', 'buyer_requirement')) not null,
  dataset_mode text check (dataset_mode in ('broker_group', 'buyer_inquiry', 'mixed')),
  deal_type text,
  asset_class text,
  price_basis text,
  area_sqft numeric,
  area_basis text,
  budget numeric,
  location_hint text,
  city text,
  city_canonical text,
  locality_canonical text,
  micro_market text,
  matched_alias text,
  confidence numeric,
  unresolved_flag boolean default false,
  resolution_method text check (resolution_method in ('exact_alias', 'normalized_alias', 'fuzzy_alias', 'unresolved')),
  urgency text check (urgency in ('high', 'medium', 'low')),
  priority_bucket text check (priority_bucket in ('P1', 'P2', 'P3')),
  priority_score numeric,
  sentiment_score numeric,
  intent_score numeric,
  recency_score numeric,
  sentiment_risk numeric,
  raw_text text,
  source text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  payload jsonb not null default '{}'::jsonb,
  unique(tenant_id, lead_id)
);

alter table public.lead_records enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_records'
      and policyname = 'Tenants can manage their own lead records'
  ) then
    create policy "Tenants can manage their own lead records"
      on public.lead_records
      for select
      using ((select auth.uid()) = tenant_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_records'
      and policyname = 'Tenants can insert their own lead records'
  ) then
    create policy "Tenants can insert their own lead records"
      on public.lead_records
      for insert
      with check ((select auth.uid()) = tenant_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_records'
      and policyname = 'Tenants can update their own lead records'
  ) then
    create policy "Tenants can update their own lead records"
      on public.lead_records
      for update
      using ((select auth.uid()) = tenant_id)
      with check ((select auth.uid()) = tenant_id);
  end if;
end $$;
