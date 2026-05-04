create index if not exists agent_behavior_rules_tenant_id_idx
  on public.agent_behavior_rules (tenant_id);

create index if not exists agent_events_tenant_id_idx
  on public.agent_events (tenant_id);

create index if not exists group_configs_tenant_id_idx
  on public.group_configs (tenant_id);

create index if not exists messages_tenant_id_idx
  on public.messages (tenant_id);

create index if not exists raw_messages_tenant_id_idx
  on public.raw_messages (tenant_id);

create index if not exists leads_contact_id_idx
  on public.leads (contact_id);

create index if not exists listings_raw_message_id_idx
  on public.listings (raw_message_id);

create index if not exists outbound_message_queue_lead_id_idx
  on public.outbound_message_queue (lead_id);

create index if not exists site_visits_lead_id_idx
  on public.site_visits (lead_id);

create index if not exists stream_item_corrections_corrected_by_idx
  on public.stream_item_corrections (corrected_by);

create index if not exists canonical_record_evidence_stream_item_id_idx
  on public.canonical_record_evidence (stream_item_id);

create index if not exists channel_items_stream_item_id_idx
  on public.channel_items (stream_item_id);

drop index if exists public.whatsapp_groups_tenant_group_uidx;
