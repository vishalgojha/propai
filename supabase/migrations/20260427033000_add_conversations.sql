create table if not exists conversations (
  id uuid default gen_random_uuid() primary key,
  phone_number text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

alter table conversations
  add column if not exists phone_number text,
  add column if not exists role text,
  add column if not exists content text,
  add column if not exists created_at timestamptz default now();

create index if not exists idx_conversations_phone
  on conversations(phone_number, created_at desc);
