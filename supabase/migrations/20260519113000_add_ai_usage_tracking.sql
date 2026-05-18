create table if not exists public.ai_usage (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.profiles(id) on delete cascade,
    provider text not null,
    model text not null,
    prompt_tokens integer not null default 0,
    completion_tokens integer not null default 0,
    total_tokens integer not null default 0,
    estimated_cost_usd numeric not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists ai_usage_tenant_created_idx
    on public.ai_usage (tenant_id, created_at desc);

create index if not exists ai_usage_provider_created_idx
    on public.ai_usage (provider, created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own
    on public.ai_usage
    for select
    to authenticated
    using (tenant_id = auth.uid());

notify pgrst, 'reload schema';
