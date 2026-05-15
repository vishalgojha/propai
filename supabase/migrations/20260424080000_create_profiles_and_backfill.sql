create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    full_name text,
    phone text,
    email text,
    phone_verified boolean not null default false,
    verification_token text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_profiles_phone_unique
    on public.profiles (phone)
    where phone is not null;

create unique index if not exists idx_profiles_email_unique
    on public.profiles (lower(email))
    where email is not null;

create index if not exists idx_profiles_updated_at
    on public.profiles (updated_at desc);

alter table public.profiles enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'profiles'
          and policyname = 'profiles_select_own'
    ) then
        create policy profiles_select_own
            on public.profiles
            for select
            to authenticated
            using (auth.uid() = id);
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'profiles'
          and policyname = 'profiles_insert_own'
    ) then
        create policy profiles_insert_own
            on public.profiles
            for insert
            to authenticated
            with check (auth.uid() = id);
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'profiles'
          and policyname = 'profiles_update_own'
    ) then
        create policy profiles_update_own
            on public.profiles
            for update
            to authenticated
            using (auth.uid() = id)
            with check (auth.uid() = id);
    end if;
end $$;

insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    phone_verified,
    created_at,
    updated_at
)
select
    au.id,
    au.email,
    coalesce(
        nullif(trim(au.raw_user_meta_data ->> 'full_name'), ''),
        split_part(coalesce(au.email, ''), '@', 1)
    ),
    nullif(regexp_replace(coalesce(au.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g'), ''),
    false,
    coalesce(au.created_at, now()),
    now()
from auth.users au
on conflict (id) do update
set
    email = coalesce(public.profiles.email, excluded.email),
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    phone = coalesce(public.profiles.phone, excluded.phone),
    updated_at = now();
