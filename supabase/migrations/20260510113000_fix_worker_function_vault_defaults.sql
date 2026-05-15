create or replace function public.invoke_worker_function(function_name text, payload jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
as $$
declare
  request_id bigint;
  project_url text := null;
  anon_key text := null;
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

  if project_url is null or anon_key is null then
    raise exception 'Vault secrets project_url and anon_key must be configured';
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
