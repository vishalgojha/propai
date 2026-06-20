-- WhatsApp Activation Codes
-- Enables click-to-WhatsApp activation flow: user generates a code in the web app,
-- sends it to the Pulse WABA number, and the webhook links their WhatsApp identity.

create table if not exists public.whatsapp_activation_codes (
    id uuid primary key default gen_random_uuid(),
    code text not null,
    tenant_id uuid not null references public.profiles(id) on delete cascade,
    context_type text not null default 'broker_onboarding',
    context_id uuid,
    status text not null default 'pending'
        check (status in ('pending', 'activated', 'expired')),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    activated_at timestamptz,
    activated_phone text,
    updated_at timestamptz not null default now(),
    unique(code)
);

create index if not exists idx_activation_codes_tenant_status
    on public.whatsapp_activation_codes (tenant_id, status, created_at desc);

create index if not exists idx_activation_codes_code_status
    on public.whatsapp_activation_codes (code, status);

alter table public.whatsapp_activation_codes enable row level security;

-- Service role full access (used by webhook handler + internal services)
create policy "service_role_full_access"
    on public.whatsapp_activation_codes
    for all
    to service_role
    using (true)
    with check (true);

-- Tenant can view their own codes (UI list)
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'whatsapp_activation_codes'
          and policyname = 'tenant_select_own_codes'
    ) then
        create policy tenant_select_own_codes
            on public.whatsapp_activation_codes
            for select
            to authenticated
            using (tenant_id = auth.uid());
    end if;
end $$;
