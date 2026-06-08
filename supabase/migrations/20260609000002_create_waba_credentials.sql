-- WABA Credentials for Meta Cloud API (Embedded Signup)
create table if not exists public.waba_credentials (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.profiles(id) on delete cascade,
    
    -- Meta identifiers
    business_account_id text not null,           -- WABA ID
    business_account_name text,
    phone_number_id text not null,               -- Cloud API phone number ID
    phone_number text not null,                  -- E.164 format +91...
    phone_number_verified boolean default false,
    
    -- Tokens
    access_token_encrypted text not null,        -- Long-lived system token (encrypted)
    token_expires_at timestamptz,
    token_scope text,                            -- Granted scopes
    
    -- Status
    is_active boolean default true,
    is_token_expired boolean default false,
    last_sync_at timestamptz,
    sync_error text,
    
    -- Metadata
    meta_app_id text,                            -- Our Meta App ID used
    embedded_signup_data jsonb,                  -- Full raw response for debugging
    
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    
    unique (tenant_id, phone_number_id)
);

create index if not exists idx_waba_credentials_tenant_active
    on public.waba_credentials (tenant_id, is_active) where is_active = true;

create index if not exists idx_waba_credentials_phone
    on public.waba_credentials (phone_number);

alter table public.waba_credentials enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies where tablename = 'waba_credentials' and policyname = 'waba_own'
    ) then
        create policy waba_own on public.waba_credentials
            using (auth.uid() = tenant_id)
            with check (auth.uid() = tenant_id);
    end if;
end $$;

-- Webhook events log for Cloud API incoming messages
create table if not exists public.cloud_api_webhook_events (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.profiles(id) on delete cascade,
    waba_credential_id uuid references public.waba_credentials(id) on delete set null,
    
    -- Meta webhook payload
    meta_message_id text,
    meta_contact_wa_id text,                     -- Sender's WhatsApp ID (phone)
    from_name text,                              -- Profile name
    message_type text,                           -- text, image, document, location, etc.
    message_body text,                           -- Text content
    media_url text,                              -- Media URL if applicable
    media_mime_type text,
    media_sha256 text,
    timestamp timestamptz not null,
    
    -- Raw payload for debugging
    raw_payload jsonb not null,
    
    -- Processing status
    processed boolean default false,
    processing_error text,
    stream_item_id uuid,                         -- Linked stream item if ingested
    
    created_at timestamptz not null default now()
);

create index if not exists idx_cloud_webhook_tenant_time
    on public.cloud_api_webhook_events (tenant_id, timestamp desc);

create index if not exists idx_cloud_webhook_contact
    on public.cloud_api_webhook_events (meta_contact_wa_id);

create index if not exists idx_cloud_webhook_unprocessed
    on public.cloud_api_webhook_events (tenant_id, processed) where processed = false;

alter table public.cloud_api_webhook_events enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies where tablename = 'cloud_api_webhook_events' and policyname = 'cloud_webhook_own'
    ) then
        create policy cloud_webhook_own on public.cloud_api_webhook_events
            using (auth.uid() = tenant_id)
            with check (auth.uid() = tenant_id);
    end if;
end $$;

notify pgrst, 'reload schema';