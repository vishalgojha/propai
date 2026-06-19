-- Fix api_keys RLS: drop broken ALL-only policy, ensure per-command policies exist
-- Also add trigger to sync workspace_settings.ai_keys → api_keys automatically

do $$
declare
  pol record;
begin
  -- Drop the old ALL policy (no WITH CHECK = INSERT blocked)
  for pol in
    select policyname from pg_policies
    where schemaname = 'public'
      and tablename = 'api_keys'
      and policyname = 'Tenants can manage their own api keys'
  loop
    execute format('drop policy "Tenants can manage their own api keys" on public.api_keys');
  end loop;
end $$;

-- Recreate per-command policies (idempotent via if not exists)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'api_keys'
      and policyname = 'Tenants can select their own api keys'
  ) then
    create policy "Tenants can select their own api keys"
      on public.api_keys
      for select
      using ((select auth.uid()) = tenant_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'api_keys'
      and policyname = 'Tenants can insert their own api keys'
  ) then
    create policy "Tenants can insert their own api keys"
      on public.api_keys
      for insert
      with check ((select auth.uid()) = tenant_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'api_keys'
      and policyname = 'Tenants can update their own api keys'
  ) then
    create policy "Tenants can update their own api keys"
      on public.api_keys
      for update
      using ((select auth.uid()) = tenant_id)
      with check ((select auth.uid()) = tenant_id);
  end if;
end $$;

-- Sync trigger: when workspace_settings.ai_keys is updated, upsert individual rows into api_keys
-- This ensures keyService.getKeys() can find keys even if saveKey's DB write was skipped or failed.
create or replace function public.sync_ai_keys_to_api_keys()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  key_entry record;
  provider_name text;
  key_value text;
begin
  if NEW.ai_keys is null then
    return NEW;
  end if;

  for key_entry in select * from jsonb_each_text(NEW.ai_keys)
  loop
    key_value := trim(key_entry.value);
    if key_value = '' then
      continue;
    end if;

    provider_name := case key_entry.key
      when 'gemini' then 'Google'
      when 'groq' then 'Groq'
      when 'openrouter' then 'OpenRouter'
      when 'doubleword' then 'Doubleword'
      when 'nvidia' then 'Nvidia'
      when 'openai' then 'OpenAI'
      else key_entry.key
    end;

    insert into public.api_keys (tenant_id, provider, key, updated_at)
    values (NEW.tenant_id, provider_name, key_value, now())
    on conflict (tenant_id, provider)
    do update set key = excluded.key, updated_at = now();
  end loop;

  return NEW;
end;
$$;

drop trigger if exists trigger_sync_ai_keys_from_workspace_settings on public.workspace_settings;

create trigger trigger_sync_ai_keys_from_workspace_settings
  after insert or update of ai_keys on public.workspace_settings
  for each row
  execute function public.sync_ai_keys_to_api_keys();
