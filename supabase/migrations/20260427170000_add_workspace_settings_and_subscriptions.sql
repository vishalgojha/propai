create table if not exists public.workspace_settings (
  tenant_id uuid primary key references public.profiles(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspace_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_settings'
      and policyname = 'workspace_settings_select_own'
  ) then
    create policy workspace_settings_select_own
      on public.workspace_settings
      for select
      to authenticated
      using (auth.uid() = tenant_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_settings'
      and policyname = 'workspace_settings_insert_own'
  ) then
    create policy workspace_settings_insert_own
      on public.workspace_settings
      for insert
      to authenticated
      with check (auth.uid() = tenant_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_settings'
      and policyname = 'workspace_settings_update_own'
  ) then
    create policy workspace_settings_update_own
      on public.workspace_settings
      for update
      to authenticated
      using (auth.uid() = tenant_id)
      with check (auth.uid() = tenant_id);
  end if;
end $$;

create table if not exists public.subscriptions (
  tenant_id uuid primary key references public.profiles(id) on delete cascade,
  plan text not null default 'Free' check (plan in ('Free', 'Pro', 'Team')),
  status text not null default 'trial',
  created_at timestamptz not null default now(),
  renewal_date timestamptz
);

alter table public.subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and policyname = 'subscriptions_select_own'
  ) then
    create policy subscriptions_select_own
      on public.subscriptions
      for select
      to authenticated
      using (auth.uid() = tenant_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and policyname = 'subscriptions_insert_own'
  ) then
    create policy subscriptions_insert_own
      on public.subscriptions
      for insert
      to authenticated
      with check (auth.uid() = tenant_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and policyname = 'subscriptions_update_own'
  ) then
    create policy subscriptions_update_own
      on public.subscriptions
      for update
      to authenticated
      using (auth.uid() = tenant_id)
      with check (auth.uid() = tenant_id);
  end if;
end $$;
