create table if not exists public.stream_item_corrections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  stream_item_id uuid not null references public.stream_items(id) on delete cascade,
  corrected_by uuid not null references public.profiles(id) on delete cascade,
  original_payload jsonb not null default '{}'::jsonb,
  corrected_payload jsonb not null default '{}'::jsonb,
  correction_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_stream_item_corrections_tenant
  on public.stream_item_corrections(tenant_id, created_at desc);

create index if not exists idx_stream_item_corrections_stream_item
  on public.stream_item_corrections(stream_item_id, created_at desc);

alter table public.stream_item_corrections enable row level security;

drop policy if exists "Users can view own stream corrections" on public.stream_item_corrections;
create policy "Users can view own stream corrections"
on public.stream_item_corrections
for select
to authenticated
using (tenant_id = auth.uid());
