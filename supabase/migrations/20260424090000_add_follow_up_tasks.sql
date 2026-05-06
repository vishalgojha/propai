-- Follow-up task queue for callbacks and broker reminders
create table if not exists public.follow_up_tasks (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid references public.profiles(id) on delete cascade not null,
  lead_id text,
  lead_name text not null,
  lead_phone text,
  action_type text check (action_type in ('call', 'email', 'visit')) not null default 'call',
  due_at timestamp with time zone not null,
  status text check (status in ('pending', 'completed', 'cancelled')) not null default 'pending',
  notes text,
  priority_bucket text check (priority_bucket in ('P1', 'P2', 'P3')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(tenant_id, lead_id, action_type, due_at)
);

alter table public.follow_up_tasks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'follow_up_tasks'
      and policyname = 'Tenants can manage their own follow up tasks'
  ) then
    create policy "Tenants can manage their own follow up tasks"
      on public.follow_up_tasks
      for select
      using ((select auth.uid()) = tenant_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'follow_up_tasks'
      and policyname = 'Tenants can insert their own follow up tasks'
  ) then
    create policy "Tenants can insert their own follow up tasks"
      on public.follow_up_tasks
      for insert
      with check ((select auth.uid()) = tenant_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'follow_up_tasks'
      and policyname = 'Tenants can update their own follow up tasks'
  ) then
    create policy "Tenants can update their own follow up tasks"
      on public.follow_up_tasks
      for update
      using ((select auth.uid()) = tenant_id)
      with check ((select auth.uid()) = tenant_id);
  end if;
end $$;
