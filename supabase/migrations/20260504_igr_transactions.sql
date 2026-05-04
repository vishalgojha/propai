create table if not exists public.igr_transactions (
  id bigserial primary key,
  sro_office text not null,
  district text,
  doc_number text,
  reg_date date,
  building_name text,
  locality text,
  area_sqft numeric,
  consideration numeric,
  price_per_sqft numeric generated always as (
    case
      when area_sqft > 0 then round(consideration / area_sqft, 0)
      else null
    end
  ) stored,
  property_type text,
  config text,
  raw_json jsonb,
  created_at timestamptz default now()
);

create index if not exists igr_transactions_locality_idx
  on public.igr_transactions (locality);

create index if not exists igr_transactions_building_idx
  on public.igr_transactions (building_name);

create index if not exists igr_transactions_reg_date_idx
  on public.igr_transactions (reg_date desc);

alter table public.igr_transactions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'igr_transactions'
      and policyname = 'igr_transactions_authenticated_select'
  ) then
    create policy igr_transactions_authenticated_select
      on public.igr_transactions
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'igr_transactions'
      and policyname = 'igr_transactions_service_role_insert'
  ) then
    create policy igr_transactions_service_role_insert
      on public.igr_transactions
      for insert
      to service_role
      with check (true);
  end if;
end
$$;
