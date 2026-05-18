create table if not exists public.mcp_oauth_clients (
  client_id text primary key,
  client_name text not null,
  redirect_uris jsonb not null default '[]'::jsonb,
  grant_types jsonb not null default '[]'::jsonb,
  response_types jsonb not null default '[]'::jsonb,
  token_endpoint_auth_method text not null default 'none',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.mcp_oauth_codes (
  code text primary key,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null,
  access_token text not null,
  refresh_token text,
  expires_in integer not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists mcp_oauth_codes_client_id_idx on public.mcp_oauth_codes (client_id);
create index if not exists mcp_oauth_codes_created_at_idx on public.mcp_oauth_codes (created_at);

create table if not exists public.mcp_sessions (
  session_id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  transport text not null default 'streamable-http',
  status text not null default 'active',
  user_agent text,
  created_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists mcp_sessions_user_id_idx on public.mcp_sessions (user_id);
create index if not exists mcp_sessions_status_idx on public.mcp_sessions (status);
