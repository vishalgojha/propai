alter table broker_activity add column if not exists id uuid unique default gen_random_uuid();
alter table broker_activity add column if not exists user_id uuid references profiles(id);
create index if not exists idx_broker_activity_user_id on broker_activity(user_id);
