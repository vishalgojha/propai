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

create index if not exists workspace_files_workspace_id_idx
  on public.workspace_files (workspace_id, created_at desc);

