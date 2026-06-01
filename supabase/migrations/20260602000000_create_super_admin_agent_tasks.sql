create table if not exists public.super_admin_agent_tasks (
    id uuid primary key default gen_random_uuid(),
    agent_type text not null default 'scout' check (agent_type in ('scout', 'seo', 'analyst', 'integrity')),
    tenant_id uuid,
    title text not null,
    source text not null,
    source_url text,
    context text not null default '',
    angle text not null default '',
    draft text not null default '',
    channel text not null default 'email' check (channel in ('email', 'dm', 'comment', 'partnership')),
    status text not null default 'needs_review' check (status in ('draft', 'needs_review', 'approved', 'sent', 'discarded')),
    priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
    notes text,
    metadata jsonb not null default '{}'::jsonb,
    created_by uuid,
    created_by_email text,
    updated_by uuid,
    updated_by_email text,
    approved_at timestamptz,
    sent_at timestamptz,
    discarded_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_super_admin_agent_tasks_type_status_updated
    on public.super_admin_agent_tasks (agent_type, status, updated_at desc);

create index if not exists idx_super_admin_agent_tasks_tenant_type_status
    on public.super_admin_agent_tasks (tenant_id, agent_type, status, updated_at desc);

create index if not exists idx_super_admin_agent_tasks_source_url
    on public.super_admin_agent_tasks (source_url);

alter table public.super_admin_agent_tasks enable row level security;

drop trigger if exists set_super_admin_agent_tasks_updated_at on public.super_admin_agent_tasks;
create or replace function public.set_super_admin_agent_tasks_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger set_super_admin_agent_tasks_updated_at
before update on public.super_admin_agent_tasks
for each row
execute function public.set_super_admin_agent_tasks_updated_at();
