-- One-time recovery: reset all suppressed stream items back to 'accepted'.
-- These items were originally accepted before the quality gate backfill
-- ran on May 22 and overwrote them with suppressed statuses.
--
-- After running this, items with genuinely low quality will be re-suppressed
-- as new messages come through the now-relaxed quality gate thresholds.
-- Run: psql "$SUPABASE_DB_URL" -f scripts/recover_suppressed_stream_items.sql

BEGIN;

UPDATE stream_items
SET
    ingestion_status = 'accepted',
    suppression_reason = NULL,
    suppressed_at = NULL
WHERE
    ingestion_status IN (
        'suppressed_low_effort',
        'suppressed_bulk_spam',
        'suppressed_unresolved_context'
    );

COMMIT;
