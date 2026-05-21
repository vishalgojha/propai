-- GAP 2: Add expires_at column to stream_items for 30-day TTL
ALTER TABLE stream_items ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Set expires_at on existing rows: 30 days from created_at
UPDATE stream_items SET expires_at = created_at + INTERVAL '30 days' WHERE expires_at IS NULL;

-- Auto-set expires_at on new rows via trigger
CREATE OR REPLACE FUNCTION set_stream_item_expiry()
RETURNS TRIGGER AS $$
BEGIN
  NEW.expires_at := COALESCE(NEW.expires_at, now() + INTERVAL '30 days');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_stream_items_expiry ON stream_items;
CREATE TRIGGER trigger_stream_items_expiry
  BEFORE INSERT ON stream_items
  FOR EACH ROW
  EXECUTE FUNCTION set_stream_item_expiry();

-- Scheduled cleanup: expire stream_items older than 30 days
-- Runs daily via pg_cron
SELECT cron.schedule(
  'expire-stream-items',
  '0 3 * * *',
  $$UPDATE stream_items SET ingestion_status = 'expired' WHERE expires_at < now() AND ingestion_status != 'expired'$$
);

-- GAP 4: Add listing_count, bhk_types, price_range to broker_contacts
ALTER TABLE broker_contacts ADD COLUMN IF NOT EXISTS listing_count INT NOT NULL DEFAULT 0;
ALTER TABLE broker_contacts ADD COLUMN IF NOT EXISTS bhk_types TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE broker_contacts ADD COLUMN IF NOT EXISTS price_range_low NUMERIC;
ALTER TABLE broker_contacts ADD COLUMN IF NOT EXISTS price_range_high NUMERIC;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_broker_contacts_listing_count ON broker_contacts(tenant_id, listing_count DESC);
CREATE INDEX IF NOT EXISTS idx_broker_contacts_bhk_types ON broker_contacts USING GIN(bhk_types);
