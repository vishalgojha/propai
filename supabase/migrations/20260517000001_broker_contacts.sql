-- Broker Contacts & Broadcast Lists
-- Extracted from WhatsApp group parsing

-- Broker contacts extracted from group participants
CREATE TABLE IF NOT EXISTS broker_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  phone TEXT NOT NULL,
  display_name TEXT,
  inferred_areas TEXT[] NOT NULL DEFAULT '{}',
  source_groups TEXT[] NOT NULL DEFAULT '{}',
  group_count INT NOT NULL DEFAULT 1,
  unsubscribed BOOLEAN NOT NULL DEFAULT false,
  unsubscribed_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone)
);

-- Broadcast lists (auto-generated + manual)
CREATE TABLE IF NOT EXISTS broadcast_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  areas TEXT[] NOT NULL DEFAULT '{}',
  contact_count INT NOT NULL DEFAULT 0,
  auto_generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Many-to-many: which contacts belong to which lists
CREATE TABLE IF NOT EXISTS broadcast_list_contacts (
  list_id UUID NOT NULL REFERENCES broadcast_lists(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES broker_contacts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, contact_id)
);

-- Unsubscribe log: contacts who opted out across all lists
CREATE TABLE IF NOT EXISTS broadcast_unsubscribes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  phone TEXT NOT NULL,
  reason TEXT,
  source TEXT DEFAULT 'manual',
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone)
);

-- Auto-update updated_at on broadcast_lists
CREATE OR REPLACE FUNCTION update_broadcast_list_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_broadcast_lists_updated_at ON broadcast_lists;
CREATE TRIGGER trigger_broadcast_lists_updated_at
  BEFORE UPDATE ON broadcast_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_broadcast_list_updated_at();

-- Auto-update updated_at on broker_contacts
CREATE OR REPLACE FUNCTION update_broker_contact_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_broker_contacts_updated_at ON broker_contacts;
CREATE TRIGGER trigger_broker_contacts_updated_at
  BEFORE UPDATE ON broker_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_broker_contact_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_broker_contacts_tenant ON broker_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_broker_contacts_areas ON broker_contacts USING GIN(inferred_areas);
CREATE INDEX IF NOT EXISTS idx_broker_contacts_phone ON broker_contacts(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_broker_contacts_unsubscribed ON broker_contacts(tenant_id, unsubscribed);
CREATE INDEX IF NOT EXISTS idx_broadcast_lists_tenant ON broadcast_lists(tenant_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_lists_areas ON broadcast_lists USING GIN(areas);
CREATE INDEX IF NOT EXISTS idx_broadcast_list_contacts_list ON broadcast_list_contacts(list_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_list_contacts_contact ON broadcast_list_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_unsubscribes_tenant ON broadcast_unsubscribes(tenant_id);

-- RLS
ALTER TABLE broker_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_list_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_unsubscribes ENABLE ROW LEVEL SECURITY;

CREATE POLICY broker_contacts_tenant_access
  ON broker_contacts
  FOR ALL
  USING (tenant_id = auth.uid());

CREATE POLICY broadcast_lists_tenant_access
  ON broadcast_lists
  FOR ALL
  USING (tenant_id = auth.uid());

CREATE POLICY broadcast_list_contacts_tenant_access
  ON broadcast_list_contacts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM broadcast_lists bl
      WHERE bl.id = broadcast_list_contacts.list_id
        AND bl.tenant_id = auth.uid()
    )
  );

CREATE POLICY broadcast_unsubscribes_tenant_access
  ON broadcast_unsubscribes
  FOR ALL
  USING (tenant_id = auth.uid());
