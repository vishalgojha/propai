-- Fix whatsapp_groups schema: add missing columns the code expects
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS participant_count integer DEFAULT 0;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS is_parsing boolean DEFAULT true;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS last_message_at timestamptz;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS normalized_name text NOT NULL DEFAULT '';
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS locality text;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS broadcast_enabled boolean DEFAULT true;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_groups_workspace_group_uidx ON public.whatsapp_groups(workspace_id, group_jid);

-- Fix whatsapp_message_mirror schema: add missing columns
ALTER TABLE public.whatsapp_message_mirror ADD COLUMN IF NOT EXISTS session_label text;
ALTER TABLE public.whatsapp_message_mirror ADD COLUMN IF NOT EXISTS message_key text;
ALTER TABLE public.whatsapp_message_mirror ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text';
ALTER TABLE public.whatsapp_message_mirror ADD COLUMN IF NOT EXISTS chat_type text NOT NULL DEFAULT 'group';
ALTER TABLE public.whatsapp_message_mirror ADD COLUMN IF NOT EXISTS is_revoked boolean NOT NULL DEFAULT false;
ALTER TABLE public.whatsapp_message_mirror ADD COLUMN IF NOT EXISTS raw_payload jsonb;
ALTER TABLE public.whatsapp_message_mirror ALTER COLUMN text SET DEFAULT '';
