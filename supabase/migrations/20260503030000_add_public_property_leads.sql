create table if not exists public.public_property_leads (
  id uuid default gen_random_uuid() primary key,
  listing_id uuid references public.listings(id) on delete set null,
  broker_tenant_id uuid references public.profiles(id) on delete set null,
  lead_name text not null,
  lead_phone text not null,
  source text not null default 'public_site',
  source_path text,
  status text not null default 'new' check (status in ('new', 'reviewed', 'contacted', 'closed', 'spam')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists public_property_leads_listing_idx
  on public.public_property_leads (listing_id, created_at desc);

create index if not exists public_property_leads_broker_idx
  on public.public_property_leads (broker_tenant_id, created_at desc);

alter table public.public_property_leads enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'public_property_leads'
      and policyname = 'Brokers can view their own public property leads'
  ) then
    create policy "Brokers can view their own public property leads"
      on public.public_property_leads
      for select
      using ((select auth.uid()) = broker_tenant_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'public_property_leads'
      and policyname = 'Brokers can update their own public property leads'
  ) then
    create policy "Brokers can update their own public property leads"
      on public.public_property_leads
      for update
      using ((select auth.uid()) = broker_tenant_id)
      with check ((select auth.uid()) = broker_tenant_id);
  end if;
end $$;
