-- Allow multiple WhatsApp device labels per workspace
create unique index if not exists whatsapp_sessions_tenant_label_uidx
on public.whatsapp_sessions (tenant_id, label);
