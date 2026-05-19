create table if not exists public.wabro_device_registrations (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.profiles(id) on delete cascade,
    created_by uuid references public.profiles(id) on delete set null,
    device_label text not null,
    platform text not null default 'android',
    token_hash text not null unique,
    status text not null default 'pending' check (status in ('pending', 'claimed', 'revoked')),
    expires_at timestamptz not null default (now() + interval '7 days'),
    claimed_at timestamptz,
    claimed_device_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists wabro_device_registrations_tenant_status_idx
    on public.wabro_device_registrations (tenant_id, status, created_at desc);

alter table public.wabro_devices
    add column if not exists platform text not null default 'android';

alter table public.wabro_devices
    add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_wabro_device_registration_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_wabro_device_registration_updated_at on public.wabro_device_registrations;

create trigger set_wabro_device_registration_updated_at
before update on public.wabro_device_registrations
for each row
execute function public.set_wabro_device_registration_updated_at();

drop trigger if exists set_wabro_devices_updated_at on public.wabro_devices;

create trigger set_wabro_devices_updated_at
before update on public.wabro_devices
for each row
execute function public.set_wabro_device_registration_updated_at();
