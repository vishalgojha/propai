-- Fix missing broadcast_list_contacts table
-- Previous migration 20260517000001 may not have been applied in production

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

CREATE TABLE IF NOT EXISTS broadcast_list_contacts (
  list_id UUID NOT NULL REFERENCES broadcast_lists(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES broker_contacts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, contact_id)
);

CREATE TABLE IF NOT EXISTS broadcast_unsubscribes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  phone TEXT NOT NULL,
  reason TEXT,
  source TEXT DEFAULT 'manual',
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone)
);

-- Indexes (IF NOT EXISTS handles idempotency)
CREATE INDEX IF NOT EXISTS idx_broadcast_lists_tenant ON broadcast_lists(tenant_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_lists_areas ON broadcast_lists USING GIN(areas);
CREATE INDEX IF NOT EXISTS idx_broadcast_list_contacts_list ON broadcast_list_contacts(list_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_list_contacts_contact ON broadcast_list_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_unsubscribes_tenant ON broadcast_unsubscribes(tenant_id);

-- RLS
ALTER TABLE broadcast_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_list_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_unsubscribes ENABLE ROW LEVEL SECURITY;

-- RLS policies (DROP + CREATE to be idempotent)
DROP POLICY IF EXISTS broadcast_lists_tenant_access ON broadcast_lists;
CREATE POLICY broadcast_lists_tenant_access
  ON broadcast_lists
  FOR ALL
  USING (tenant_id = auth.uid());

DROP POLICY IF EXISTS broadcast_list_contacts_tenant_access ON broadcast_list_contacts;
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

DROP POLICY IF EXISTS broadcast_unsubscribes_tenant_access ON broadcast_unsubscribes;
CREATE POLICY broadcast_unsubscribes_tenant_access
  ON broadcast_unsubscribes
  FOR ALL
  USING (tenant_id = auth.uid());
