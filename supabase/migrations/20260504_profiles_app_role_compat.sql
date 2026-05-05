alter table public.profiles
  add column if not exists app_role text not null default 'user';

update public.profiles
set app_role = case
  when coalesce(is_admin, false) then 'admin'
  else coalesce(nullif(app_role, ''), 'user')
end;

alter table public.profiles
  drop constraint if exists profiles_app_role_check;

alter table public.profiles
  add constraint profiles_app_role_check
  check (app_role in ('user', 'admin', 'broker', 'team_member'));

create or replace function public.sync_profiles_app_role_from_is_admin()
returns trigger
language plpgsql
as $$
begin
  if new.is_admin is true then
    new.app_role := 'admin';
  elsif new.app_role is null or new.app_role = '' then
    new.app_role := 'user';
  end if;
  return new;
end;
$$;

drop trigger if exists sync_profiles_app_role_from_is_admin on public.profiles;
create trigger sync_profiles_app_role_from_is_admin
before insert or update of is_admin, app_role on public.profiles
for each row execute function public.sync_profiles_app_role_from_is_admin();
