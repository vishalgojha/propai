create table if not exists wa_click_events (
    id uuid primary key default gen_random_uuid(),
    listing_id text not null,
    broker_phone text not null,
    user_id text not null,
    workspace_id text not null,
    source text not null default 'stream',
    device text not null default 'web',
    clicked_at timestamptz not null default now()
);

create index if not exists idx_wa_click_events_workspace_clicked
    on wa_click_events (workspace_id, clicked_at desc);

create index if not exists idx_wa_click_events_listing
    on wa_click_events (listing_id);
