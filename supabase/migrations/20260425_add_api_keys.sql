-- Persistent AI keys for workspace fallbacks
create table if not exists public.api_keys (
  tenant_id uuid references public.profiles(id) on delete cascade not null,
  provider text not null,
  key text not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (tenant_id, provider)
);

alter table public.api_keys enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'api_keys'
      and policyname = 'Tenants can manage their own api keys'
  ) then
    create policy "Tenants can manage their own api keys"
      on public.api_keys
      for select
      using ((select auth.uid()) = tenant_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'api_keys'
      and policyname = 'Tenants can insert their own api keys'
  ) then
    create policy "Tenants can insert their own api keys"
      on public.api_keys
      for insert
      with check ((select auth.uid()) = tenant_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'api_keys'
      and policyname = 'Tenants can update their own api keys'
  ) then
    create policy "Tenants can update their own api keys"
      on public.api_keys
      for update
      using ((select auth.uid()) = tenant_id)
      with check ((select auth.uid()) = tenant_id);
  end if;
end $$;
