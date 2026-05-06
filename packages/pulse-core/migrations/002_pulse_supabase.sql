-- PropAI Pulse - Supabase Migration
-- Run this in your Supabase SQL editor

-- ─── Pulse Users ──────────────────────────────────────────────────────────────

create table if not exists public.pulse_users (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  password text not null,
  name text,
  settings jsonb default '{}',
  whatsapp_session jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.pulse_users enable row level security;

create policy "Users can read own data" on public.pulse_users
  for select using (auth.uid() = id);

create policy "Service role can manage users" on public.pulse_users
  for all using (auth.role() = 'service_role');

-- ─── WhatsApp Messages ─────────────────────────────────────────────────────────

create table if not exists public.whatsapp_messages (
  id uuid default gen_random_uuid() primary key,
  message_id text unique,
  whatsapp_message_id text,
  group_id text,
  group_name text,
  sender_number text,
  message text,
  cleaned_message text,
  status text check (status in ('processed', 'needs_review', 'extraction_error', 'no_entries')) default 'processed',
  type text check (type in ('listing_rent', 'listing_sale', 'requirement', 'unknown')) default 'unknown',
  model text,
  entries jsonb default '[]',
  contacts jsonb default '[]',
  confidence numeric,
  extraction_error text,
  review_required boolean default false,
  review_reasons jsonb default '[]',
  timestamp timestamptz,
  processed_at timestamptz default now()
);

alter table public.whatsapp_messages enable row level security;

create index if not exists whatsapp_messages_message_id_idx on public.whatsapp_messages(message_id);
create index if not exists whatsapp_messages_timestamp_idx on public.whatsapp_messages(timestamp desc);
create index if not exists whatsapp_messages_group_id_timestamp_idx on public.whatsapp_messages(group_id, timestamp desc);
create index if not exists whatsapp_messages_status_timestamp_idx on public.whatsapp_messages(status, timestamp desc);

-- Allow anon read for public listings app
create policy "Anyone can read processed messages" on public.whatsapp_messages
  for select using (status = 'processed');

create policy "Service role can manage messages" on public.whatsapp_messages
  for all using (auth.role() = 'service_role');

-- ─── WhatsApp Replies ─────────────────────────────────────────────────────────

create table if not exists public.whatsapp_replies (
  id uuid default gen_random_uuid() primary key,
  reply_id text unique not null,
  group_id text not null,
  group_name text,
  text text not null,
  status text check (status in ('pending', 'sending', 'sent', 'failed')) default 'pending',
  source_message_id text,
  claimed_at timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.whatsapp_replies enable row level security;

create index if not exists whatsapp_replies_reply_id_idx on public.whatsapp_replies(reply_id);
create index if not exists whatsapp_replies_status_created_idx on public.whatsapp_replies(status, created_at);

create policy "Service role can manage replies" on public.whatsapp_replies
  for all using (auth.role() = 'service_role');

-- ─── WhatsApp Scheduled Replies ───────────────────────────────────────────────

create table if not exists public.whatsapp_scheduled_replies (
  id uuid default gen_random_uuid() primary key,
  scheduled_id text unique not null,
  group_id text not null,
  group_name text,
  source_message_id text,
  text text not null,
  scheduled_for timestamptz not null,
  status text check (status in ('scheduled', 'cancelled', 'sent', 'failed')) default 'scheduled',
  error text,
  sent_at timestamptz,
  whatsapp_message_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.whatsapp_scheduled_replies enable row level security;

create index if not exists whatsapp_scheduled_replies_scheduled_id_idx on public.whatsapp_scheduled_replies(scheduled_id);
create index if not exists whatsapp_scheduled_replies_status_scheduled_idx on public.whatsapp_scheduled_replies(status, scheduled_for);

create policy "Service role can manage scheduled replies" on public.whatsapp_scheduled_replies
  for all using (auth.role() = 'service_role');
