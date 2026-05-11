-- Add ai_keys column to workspace_settings so AI keys persist across restarts
alter table public.workspace_settings
  add column if not exists ai_keys jsonb default '{}'::jsonb;
