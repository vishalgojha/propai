-- Add content_hash column and unique constraint to stream_items
-- This enables ON CONFLICT DO NOTHING upserts to work correctly

ALTER TABLE stream_items ADD COLUMN IF NOT EXISTS content_hash text;

UPDATE stream_items
SET content_hash = md5(coalesce(raw_text, '') || coalesce(source_phone, ''))
WHERE content_hash IS NULL;

ALTER TABLE stream_items
ADD CONSTRAINT stream_items_content_hash_key UNIQUE (content_hash);
