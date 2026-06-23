-- Long-lived rotating refresh tokens for PropAI app sessions.
-- These back the WhatsApp-code login flow without relying on Supabase Auth refresh tokens.

create table if not exists public.app_refresh_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    token_hash text not null unique,
    issued_at timestamptz not null default now(),
    expires_at timestamptz not null,
    revoked_at timestamptz,
    last_used_at timestamptz,
    replaced_by uuid references public.app_refresh_tokens(id) on delete set null,
    user_agent text,
    ip_address inet,
    created_at timestamptz not null default now()
);

create index if not exists idx_app_refresh_tokens_user_active
    on public.app_refresh_tokens (user_id, expires_at desc)
    where revoked_at is null;

create index if not exists idx_app_refresh_tokens_expires
    on public.app_refresh_tokens (expires_at);

alter table public.app_refresh_tokens enable row level security;

create policy "service_role_full_access"
    on public.app_refresh_tokens
    for all
    to service_role
    using (true)
    with check (true);

notify pgrst, 'reload schema';
