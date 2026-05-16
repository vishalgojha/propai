-- 1. conversations table
create table if not exists conversations (
  id uuid default gen_random_uuid() primary key,
  phone_number text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);
alter table conversations add column if not exists phone_number text;
alter table conversations add column if not exists role text;
alter table conversations add column if not exists content text;
alter table conversations add column if not exists created_at timestamptz default now();
create index if not exists idx_conversations_phone on conversations(phone_number, created_at desc);

-- 2. workspace_files table
create table if not exists public.workspace_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  mime_type text,
  byte_size integer not null default 0,
  storage_bucket text not null default 'workspace-files',
  storage_path text not null,
  extracted_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspace_files_workspace_id_idx on public.workspace_files (workspace_id, created_at desc);

-- 3. extraction status columns
alter table if exists public.workspace_files add column if not exists extraction_status text not null default 'pending';
alter table if exists public.workspace_files add column if not exists extraction_error text;
update public.workspace_files set extraction_status = case when extracted_text is not null and length(extracted_text) > 0 then 'extracted' else 'not_supported' end where extraction_status is null or extraction_status = 'pending';

-- 4. chat_sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated ON chat_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
