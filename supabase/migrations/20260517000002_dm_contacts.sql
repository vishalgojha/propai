create table if not exists public.dm_contacts (
    id uuid default gen_random_uuid() primary key,
    tenant_id uuid not null,
    remote_jid text not null,
    label text not null default 'none' check (label in ('none', 'realtor', 'client')),
    name text,
    phone text,
    tagged_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_dm_contacts_tenant_jid on public.dm_contacts(tenant_id, remote_jid);
create index if not exists idx_dm_contacts_tenant_label on public.dm_contacts(tenant_id, label);

alter table public.dm_contacts enable row level security;

create policy "dm_contacts_tenant_access"
    on public.dm_contacts
    for all
    using (
        tenant_id = (select (auth.jwt() -> 'app_metadata' -> 'workspace_id')::uuid)
        or (select (auth.jwt() -> 'app_metadata' ->> 'is_super_admin'))::boolean = true
    );
