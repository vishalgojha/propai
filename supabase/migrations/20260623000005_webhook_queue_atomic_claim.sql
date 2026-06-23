-- Add claimed_at for atomic claim-and-process pattern
alter table cloud_api_webhook_events
  add column if not exists claimed_at timestamptz;

-- Index for finding unclaimed + stale events quickly
create index if not exists idx_webhook_events_claim
  on cloud_api_webhook_events (claimed_at nulls first, created_at)
  where processed = false;

-- RPC: atomically claim a batch of unprocessed webhook events
-- Uses FOR UPDATE SKIP LOCKED so concurrent workers never overlap
create or replace function claim_webhook_events(batch_size int)
returns setof cloud_api_webhook_events
language plpgsql
as $$
declare
  v_now timestamptz := now();
begin
  return query
    update cloud_api_webhook_events
    set claimed_at = v_now
    where id in (
      select id
      from cloud_api_webhook_events
      where processed = false
        and (claimed_at is null or claimed_at < v_now - interval '5 minutes')
      order by created_at asc
      limit batch_size
      for update skip locked
    )
    returning *;
end;
$$;
