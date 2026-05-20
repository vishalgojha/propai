alter table if exists public.whatsapp_groups
    add column if not exists participant_jids text[] not null default '{}',
    add column if not exists duplicate_overlap_score integer not null default 0,
    add column if not exists signal_score integer not null default 0,
    add column if not exists noise_score integer not null default 0,
    add column if not exists audit_recommendation text not null default 'review';

create index if not exists idx_whatsapp_groups_workspace_session_recommendation
    on public.whatsapp_groups (workspace_id, session_label, audit_recommendation);
