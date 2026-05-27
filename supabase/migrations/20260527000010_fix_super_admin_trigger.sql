-- Fix the sync trigger to map is_admin=true -> super_admin (not 'admin')
-- Run this in Supabase Dashboard -> SQL Editor if you want the DB value to match

create or replace function public.sync_profiles_app_role_from_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if NEW.is_admin then
        NEW.app_role := 'super_admin';
    else
        NEW.app_role := 'broker';
    end if;
    return NEW;
end;
$$;

-- Manually set hello@propai.live to super_admin
update public.profiles
set
    is_admin = true,
    app_role = 'super_admin',
    updated_at = now()
where email = 'hello@propai.live';
