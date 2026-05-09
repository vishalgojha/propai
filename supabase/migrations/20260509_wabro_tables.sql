-- WaBro Dashboard Tables
-- Requires: profiles table from parent schema

-- Web-created campaigns (control plane)
CREATE TABLE wabro_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  media_url TEXT,
  skills_config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','pending','running','paused','completed','cancelled')),
  schedule_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_contacts INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  skipped_count INT DEFAULT 0,
  pause_count INT DEFAULT 0,
  device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts managed from web (broadcast lists)
CREATE TABLE wabro_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  list_name TEXT NOT NULL DEFAULT 'default',
  phone TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  locality TEXT,
  budget TEXT,
  language TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, list_name, phone)
);

-- Campaign-contact link with per-contact status
CREATE TABLE wabro_campaign_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES wabro_campaigns(id) ON DELETE CASCADE NOT NULL,
  phone TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  sent_at TIMESTAMPTZ,
  error TEXT,
  UNIQUE(campaign_id, phone)
);

-- Send logs synced from device
CREATE TABLE wabro_send_logs (
  id BIGSERIAL PRIMARY KEY,
  campaign_id UUID REFERENCES wabro_campaigns(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Device registration
CREATE TABLE wabro_devices (
  device_id TEXT PRIMARY KEY,
  tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  device_model TEXT,
  android_version TEXT,
  app_version TEXT,
  last_poll_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_wabro_campaigns_tenant ON wabro_campaigns(tenant_id);
CREATE INDEX idx_wabro_campaigns_status ON wabro_campaigns(status);
CREATE INDEX idx_wabro_contacts_tenant ON wabro_contacts(tenant_id);
CREATE INDEX idx_wabro_contacts_list ON wabro_contacts(tenant_id, list_name);
CREATE INDEX idx_wabro_campaign_contacts_campaign ON wabro_campaign_contacts(campaign_id);
CREATE INDEX idx_wabro_campaign_contacts_status ON wabro_campaign_contacts(status);
CREATE INDEX idx_wabro_send_logs_campaign ON wabro_send_logs(campaign_id);
CREATE INDEX idx_wabro_send_logs_tenant ON wabro_send_logs(tenant_id);
CREATE INDEX idx_wabro_devices_tenant ON wabro_devices(tenant_id);
