create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$
begin
  if exists (
    select 1
    from pg_available_extensions
    where name = 'vault'
  ) then
    create extension if not exists vault;
  end if;
end $$;

alter table public.leads
  add column if not exists score integer,
  add column if not exists lead_temperature text check (lead_temperature in ('hot', 'warm', 'cold', 'dead')),
  add column if not exists last_scored_at timestamp with time zone,
  add column if not exists last_lead_message_at timestamp with time zone,
  add column if not exists last_broker_response_at timestamp with time zone,
  add column if not exists response_rate numeric,
  add column if not exists sentiment_score numeric,
  add column if not exists site_visit_status text,
  add column if not exists last_reengaged_at timestamp with time zone;

create table if not exists public.site_visits (
  id uuid default gen_random_uuid() primary key,
  broker_id uuid references public.profiles(id) on delete cascade not null,
  lead_id uuid references public.leads(id) on delete cascade not null,
  scheduled_for timestamp with time zone not null,
  location text,
  notes text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  reminder_24h_sent boolean not null default false,
  reminder_2h_sent boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.outbound_message_queue (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references public.leads(id) on delete set null,
  broker_id uuid references public.profiles(id) on delete cascade not null,
  recipient_phone text,
  message text not null,
  scheduled_at timestamp with time zone not null default timezone('utc'::text, now()),
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'failed', 'cancelled')),
  tag text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.worker_logs (
  id uuid default gen_random_uuid() primary key,
  worker_name text not null,
  ran_at timestamp with time zone not null default timezone('utc'::text, now()),
  records_processed integer not null default 0,
  errors jsonb not null default '[]'::jsonb
);

create index if not exists leads_tenant_temperature_idx on public.leads (tenant_id, lead_temperature);
create index if not exists leads_last_lead_message_idx on public.leads (last_lead_message_at);
create index if not exists site_visits_broker_schedule_idx on public.site_visits (broker_id, scheduled_for);
create index if not exists outbound_message_queue_status_schedule_idx on public.outbound_message_queue (status, scheduled_at);
create index if not exists outbound_message_queue_broker_idx on public.outbound_message_queue (broker_id, scheduled_at desc);
create index if not exists worker_logs_worker_name_idx on public.worker_logs (worker_name, ran_at desc);

alter table public.site_visits enable row level security;
alter table public.outbound_message_queue enable row level security;
alter table public.worker_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'site_visits' and policyname = 'Tenants can manage their own site visits'
  ) then
    create policy "Tenants can manage their own site visits"
      on public.site_visits
      for all
      using ((select auth.uid()) = broker_id)
      with check ((select auth.uid()) = broker_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'outbound_message_queue' and policyname = 'Tenants can view their own outbound queue'
  ) then
    create policy "Tenants can view their own outbound queue"
      on public.outbound_message_queue
      for select
      using ((select auth.uid()) = broker_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'outbound_message_queue' and policyname = 'Service role can manage outbound queue'
  ) then
    create policy "Service role can manage outbound queue"
      on public.outbound_message_queue
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'worker_logs' and policyname = 'Service role can manage worker logs'
  ) then
    create policy "Service role can manage worker logs"
      on public.worker_logs
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

create or replace function public.invoke_worker_function(function_name text, payload jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
as $$
declare
  request_id bigint;
  project_url text := 'https://wnrwntumacbirbndfvwg.supabase.co';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InducndudHVtYWNiaXJibmRmdndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTgwNjcsImV4cCI6MjA4OTgzNDA2N30.ub1zIhw1535oPMY9io07BPTgTfWiNdivAkfTerjeoYQ';
begin
  if exists (
    select 1
    from pg_extension
    where extname = 'vault'
  ) then
    select decrypted_secret
      into project_url
    from vault.decrypted_secrets
    where name = 'project_url'
    limit 1;

    select decrypted_secret
      into anon_key
    from vault.decrypted_secrets
    where name = 'anon_key'
    limit 1;
  end if;

  select net.http_post(
    url := project_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := payload,
    timeout_milliseconds := 5000
  ) into request_id;

  return request_id;
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'lead-scorer-every-6-hours') then
    perform cron.schedule(
      'lead-scorer-every-6-hours',
      '0 */6 * * *',
      $cron$select public.invoke_worker_function('lead-scorer', '{"source":"pg_cron"}'::jsonb);$cron$
    );
  end if;

  if not exists (select 1 from cron.job where jobname = 'follow-up-scheduler-hourly') then
    perform cron.schedule(
      'follow-up-scheduler-hourly',
      '0 * * * *',
      $cron$select public.invoke_worker_function('follow-up-scheduler', '{"source":"pg_cron"}'::jsonb);$cron$
    );
  end if;

  if not exists (select 1 from cron.job where jobname = 'site-visit-reminder-hourly') then
    perform cron.schedule(
      'site-visit-reminder-hourly',
      '0 * * * *',
      $cron$select public.invoke_worker_function('site-visit-reminder', '{"source":"pg_cron"}'::jsonb);$cron$
    );
  end if;

  if not exists (select 1 from cron.job where jobname = 'market-pulse-monday-ist') then
    perform cron.schedule(
      'market-pulse-monday-ist',
      '30 3 * * 1',
      $cron$select public.invoke_worker_function('market-pulse', '{"source":"pg_cron","timezone":"Asia/Kolkata"}'::jsonb);$cron$
    );
  end if;

  if not exists (select 1 from cron.job where jobname = 'lead-reengagement-daily-ist') then
    perform cron.schedule(
      'lead-reengagement-daily-ist',
      '30 4 * * *',
      $cron$select public.invoke_worker_function('lead-reengagement', '{"source":"pg_cron","timezone":"Asia/Kolkata"}'::jsonb);$cron$
    );
  end if;
end $$;
