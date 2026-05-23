create table if not exists public.market_insights (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  locality text not null,
  title text not null,
  summary text not null,
  listing_count int not null default 0,
  requirement_count int not null default 0,
  avg_price_numeric numeric,
  min_price_numeric numeric,
  max_price_numeric numeric,
  demand_signal text check (demand_signal is null or demand_signal in ('high_demand', 'good_supply', 'active')),
  period_label text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists market_insights_locality_idx
  on public.market_insights (locality);

create index if not exists market_insights_published_at_idx
  on public.market_insights (published_at desc);

alter table public.market_insights enable row level security;

grant select on table public.market_insights to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'market_insights'
      and policyname = 'market_insights_public_read'
  ) then
    create policy market_insights_public_read
      on public.market_insights
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;
