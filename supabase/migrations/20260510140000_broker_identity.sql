create table if not exists broker_identity (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid references auth.users(id) on delete cascade not null,
  full_name text,
  agency_name text,
  city text,
  localities text[],
  mobile text,
  plan text default 'free',
  team_members jsonb default '[]'::jsonb,
  connected_devices int default 0,
  max_devices int default 1,
  whatsapp_groups jsonb default '[]'::jsonb,
  allowlisted_realtors jsonb default '[]'::jsonb,
  onboarding_completed boolean default false,
  onboarding_step int default 0,
  recent_actions jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(broker_id)
);

alter table broker_identity enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'broker_identity' and policyname = 'broker_own'
  ) then
    create policy broker_own on broker_identity
      using (auth.uid() = broker_id)
      with check (auth.uid() = broker_id);
  end if;
end $$;
