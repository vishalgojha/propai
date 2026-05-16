create table ai_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  title text not null default 'New Chat',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_ai_sessions_user on ai_sessions(user_id, updated_at desc);

alter table conversations add column session_id text;
create index idx_conversations_session on conversations(phone_number, session_id, created_at desc);

insert into ai_sessions (user_id, title)
select distinct phone_number, 'Default'
from conversations
where phone_number is not null;

update conversations c
set session_id = s.id::text
from ai_sessions s
where s.user_id = c.phone_number
  and c.session_id is null;
