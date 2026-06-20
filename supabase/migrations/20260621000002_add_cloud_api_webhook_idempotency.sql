-- Claim each inbound Meta message exactly once before AI calls or outbound sends.
create unique index if not exists cloud_api_webhook_events_tenant_message_id_key
    on public.cloud_api_webhook_events (tenant_id, meta_message_id)
    where meta_message_id is not null;
