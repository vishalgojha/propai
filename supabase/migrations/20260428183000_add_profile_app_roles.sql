alter table public.profiles
    add column if not exists app_role text not null default 'broker';

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'profiles_app_role_check'
          and conrelid = 'public.profiles'::regclass
    ) then
        alter table public.profiles
            add constraint profiles_app_role_check
            check (app_role in ('broker', 'super_admin'));
    end if;
end $$;

update public.profiles
set
    app_role = 'super_admin',
    updated_at = now()
where lower(coalesce(email, '')) = 'vishal@chaoscraftslabs.com';

insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    phone_verified,
    app_role,
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
    'super_admin',
    coalesce(au.created_at, now()),
    now()
from auth.users au
where lower(coalesce(au.email, '')) = 'vishal@chaoscraftslabs.com'
on conflict (id) do update
set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    phone = coalesce(public.profiles.phone, excluded.phone),
    app_role = 'super_admin',
    updated_at = now();
