alter table public.whatsapp_sessions
  add column if not exists keys jsonb,
  add column if not exists auth_state jsonb;

alter table public.whatsapp_ingestion_health
  add column if not exists session_label text,
  add column if not exists phone_number text,
  add column if not exists qr_code text,
  add column if not exists error_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.whatsapp_group_health (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.profiles(id) on delete cascade,
  session_id text,
  session_label text,
  group_id text,
  group_name text,
  status text not null default 'unknown',
  last_message_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists whatsapp_group_health_tenant_session_group_unique
  on public.whatsapp_group_health (tenant_id, session_label, group_id) nulls not distinct;

create index if not exists whatsapp_group_health_tenant_idx
  on public.whatsapp_group_health (tenant_id);

create index if not exists whatsapp_group_health_session_label_idx
  on public.whatsapp_group_health (session_label);

alter table public.whatsapp_group_health enable row level security;

drop policy if exists whatsapp_group_health_select_own on public.whatsapp_group_health;
create policy whatsapp_group_health_select_own
  on public.whatsapp_group_health
  for select
  using ((select auth.uid()) = tenant_id);

notify pgrst, 'reload schema';
