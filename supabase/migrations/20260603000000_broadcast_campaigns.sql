-- Broadcast Campaigns & Recipients
-- Campaign tracking for OpenWA-powered broadcast service

-- Broadcast campaigns
CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  media_url TEXT,
  audience_type TEXT NOT NULL DEFAULT 'list', -- 'list', 'segment', 'custom', 'all'
  list_id UUID REFERENCES broadcast_lists(id),
  segment_criteria JSONB, -- { bhk: ['2BHK'], locality: ['Andheri'], budget_max: 2 }
  custom_phones TEXT[], -- for CSV upload
  total_recipients INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'scheduled', 'sending', 'completed', 'failed', 'cancelled'
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rate_limit_per_hour INT NOT NULL DEFAULT 100,
  delay_between_messages_ms INT NOT NULL DEFAULT 5000,
  accepted_risk BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-recipient tracking
CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  contact_id UUID REFERENCES broker_contacts(id),
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'queued', 'sent', 'delivered', 'read', 'failed', 'blocked'
  error_message TEXT,
  openwa_message_id TEXT, -- OpenWA message ID for webhook correlation
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaign analytics summary (materialized view for fast dashboard queries)
CREATE TABLE IF NOT EXISTS broadcast_campaign_stats (
  campaign_id UUID PRIMARY KEY REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  total INT NOT NULL DEFAULT 0,
  pending INT NOT NULL DEFAULT 0,
  queued INT NOT NULL DEFAULT 0,
  sent INT NOT NULL DEFAULT 0,
  delivered INT NOT NULL DEFAULT 0,
  read INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  blocked INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at triggers
CREATE OR REPLACE FUNCTION update_broadcast_campaign_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_broadcast_campaigns_updated_at ON broadcast_campaigns;
CREATE TRIGGER trigger_broadcast_campaigns_updated_at
  BEFORE UPDATE ON broadcast_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_broadcast_campaign_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_tenant ON broadcast_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_status ON broadcast_campaigns(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_scheduled ON broadcast_campaigns(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_campaign ON broadcast_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status ON broadcast_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_phone ON broadcast_recipients(phone);
CREATE INDEX IF NOT EXISTS idx_broadcast_campaign_stats_updated ON broadcast_campaign_stats(updated_at);

-- RLS
ALTER TABLE broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_campaign_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY broadcast_campaigns_tenant_access
  ON broadcast_campaigns
  FOR ALL
  USING (tenant_id = auth.uid());

CREATE POLICY broadcast_recipients_tenant_access
  ON broadcast_recipients
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM broadcast_campaigns bc
      WHERE bc.id = broadcast_recipients.campaign_id
        AND bc.tenant_id = auth.uid()
    )
  );

CREATE POLICY broadcast_campaign_stats_tenant_access
  ON broadcast_campaign_stats
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM broadcast_campaigns bc
      WHERE bc.id = broadcast_campaign_stats.campaign_id
        AND bc.tenant_id = auth.uid()
    )
  );

-- Helper function: update campaign stats from recipients
CREATE OR REPLACE FUNCTION update_broadcast_campaign_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO broadcast_campaign_stats (campaign_id, total, pending, queued, sent, delivered, read, failed, blocked)
  SELECT
    NEW.campaign_id,
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'queued'),
    COUNT(*) FILTER (WHERE status = 'sent'),
    COUNT(*) FILTER (WHERE status = 'delivered'),
    COUNT(*) FILTER (WHERE status = 'read'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*) FILTER (WHERE status = 'blocked')
  FROM broadcast_recipients
  WHERE campaign_id = NEW.campaign_id
  ON CONFLICT (campaign_id) DO UPDATE SET
    total = EXCLUDED.total,
    pending = EXCLUDED.pending,
    queued = EXCLUDED.queued,
    sent = EXCLUDED.sent,
    delivered = EXCLUDED.delivered,
    read = EXCLUDED.read,
    failed = EXCLUDED.failed,
    blocked = EXCLUDED.blocked,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_broadcast_recipients_stats ON broadcast_recipients;
CREATE TRIGGER trigger_broadcast_recipients_stats
  AFTER INSERT OR UPDATE ON broadcast_recipients
  FOR EACH ROW
  EXECUTE FUNCTION update_broadcast_campaign_stats();
