create index if not exists wabro_device_registrations_created_by_idx
    on public.wabro_device_registrations (created_by);

create or replace function public.set_wabro_device_registration_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;
