-- Broker Syndication: trusted feed sharing between independent workspaces
-- Each workspace stays independent — this is not account merging,
-- just opted-in feed sharing between trusted partner brokers.

-- ── Syndication relationships ──────────────────────────────────────────────
create table if not exists broker_syndications (
    id uuid primary key default gen_random_uuid(),
    requester_workspace_id uuid not null references auth.users(id) on delete cascade,
    acceptor_workspace_id uuid references auth.users(id) on delete set null,
    status text not null default 'pending'
        check (status in ('pending', 'active', 'paused', 'revoked')),
    scope text[] not null default '{rent,sale}',
    syndication_token text unique not null default encode(gen_random_bytes(24), 'hex'),
    requester_label text,  -- human-readable name the acceptor sees
    acceptor_label text,   -- human-readable name the requester sees
    created_at timestamptz not null default now(),
    accepted_at timestamptz,
    unique(requester_workspace_id, acceptor_workspace_id)
);

create index if not exists idx_syndications_requester
    on broker_syndications(requester_workspace_id);

create index if not exists idx_syndications_acceptor
    on broker_syndications(acceptor_workspace_id);

create index if not exists idx_syndications_token
    on broker_syndications(syndication_token);

alter table broker_syndications enable row level security;

-- RLS: workspace owner sees their own syndications (as requester or acceptor)
create policy if not exists broker_syndications_owner_access
    on broker_syndications
    for all
    using (
        requester_workspace_id = auth.uid()
        or acceptor_workspace_id = auth.uid()
    );

-- ── Syndicated listings marker on stream_items ────────────────────────────
-- source_workspace_id: the workspace that originally created the listing
-- is_syndicated: true when pulled from a partner's feed
alter table stream_items add column if not exists source_workspace_id uuid
    references auth.users(id) on delete set null;

alter table stream_items add column if not exists is_syndicated boolean
    not null default false;

create index if not exists idx_stream_items_syndicated
    on stream_items(tenant_id, is_syndicated)
    where is_syndicated = true;
