do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_plan_check'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      drop constraint subscriptions_plan_check;
  end if;
end $$;

alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan in ('Free', 'Solo', 'Pro', 'Team'));
