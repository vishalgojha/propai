-- Stream quality fixes - v2
-- Prerequisite: 20260527000006_make_stream_items_global_for_all_auth.sql

ALTER TABLE stream_items
  ADD COLUMN IF NOT EXISTS broker_contact_valid BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS message_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_complete BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completeness_score SMALLINT DEFAULT 0;

-- Replace the old global unique hash constraint with tenant-scoped dedup.
ALTER TABLE stream_items
  DROP CONSTRAINT IF EXISTS stream_items_content_hash_key;

CREATE UNIQUE INDEX IF NOT EXISTS stream_items_tenant_message_hash_key
  ON stream_items (tenant_id, message_hash);

CREATE INDEX IF NOT EXISTS idx_stream_complete
  ON stream_items (is_complete, created_at DESC);

-- Backfill hashes for existing rows.
UPDATE stream_items
SET
  content_hash = COALESCE(content_hash, md5(COALESCE(raw_text, '') || COALESCE(source_phone, ''))),
  message_hash = COALESCE(message_hash, md5(COALESCE(raw_text, '') || COALESCE(source_phone, '')));

-- Backfill contact validity.
UPDATE stream_items
SET broker_contact_valid = (
  source_phone IS NOT NULL
  AND LENGTH(source_phone) = 12
  AND source_phone ~ '^91[6-9][0-9]{9}$'
);

-- Backfill completeness using the same minimums as the live parser.
UPDATE stream_items
SET
  completeness_score = (
    CASE WHEN locality IS NOT NULL AND BTRIM(locality) <> '' AND LOWER(BTRIM(locality)) <> 'unknown' THEN 1 ELSE 0 END +
    CASE WHEN bhk IS NOT NULL AND BTRIM(COALESCE(bhk, '')) <> '' AND LOWER(BTRIM(COALESCE(bhk, ''))) <> 'n/a' THEN 1 ELSE 0 END +
    CASE WHEN area_sqft IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN price_numeric IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN broker_contact_valid THEN 1 ELSE 0 END
  ),
  is_complete = (
    locality IS NOT NULL AND BTRIM(locality) <> '' AND LOWER(BTRIM(locality)) <> 'unknown'
    AND bhk IS NOT NULL AND BTRIM(COALESCE(bhk, '')) <> '' AND LOWER(BTRIM(COALESCE(bhk, ''))) <> 'n/a'
    AND price_numeric IS NOT NULL
    AND broker_contact_valid
  );
