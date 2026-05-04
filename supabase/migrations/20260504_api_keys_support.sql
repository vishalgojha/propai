create table if not exists api_keys (
  tenant_id uuid references profiles(id) on delete cascade not null,
  provider text not null,
  key text not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (tenant_id, provider)
);

alter table api_keys enable row level security;

drop policy if exists "Tenants can manage their own api keys" on api_keys;
create policy "Tenants can manage their own api keys"
  on api_keys
  for all
  using (auth.uid() = tenant_id)
  with check (auth.uid() = tenant_id);
