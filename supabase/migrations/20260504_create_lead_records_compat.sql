create table if not exists public.lead_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.profiles(id) on delete cascade not null,
  lead_id uuid references public.leads(id) on delete set null,
  name text,
  phone text,
  location_hint text,
  locality_canonical text,
  budget text,
  record_type text not null default 'buyer_requirement',
  raw_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists lead_records_tenant_record_created_idx
  on public.lead_records (tenant_id, record_type, created_at desc);

create index if not exists lead_records_tenant_phone_idx
  on public.lead_records (tenant_id, phone)
  where phone is not null;

alter table public.lead_records enable row level security;

drop policy if exists lead_records_tenant_manage on public.lead_records;
create policy lead_records_tenant_manage
  on public.lead_records
  for all
  using (tenant_id = auth.uid())
  with check (tenant_id = auth.uid());
