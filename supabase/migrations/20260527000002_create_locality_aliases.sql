-- Create locality_aliases table for Teach Pulse feature
-- Stores user corrections that train the parser permanently

create table if not exists locality_aliases (
  id uuid primary key default gen_random_uuid(),
  raw_text_fragment text not null,
  standard_locality text not null,
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_locality_aliases_fragment on locality_aliases (raw_text_fragment);
