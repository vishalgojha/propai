CREATE TABLE IF NOT EXISTS flagged_parses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  raw_text TEXT NOT NULL,
  ai_extracted JSONB NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL DEFAULT 0,
  flag_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flagged_parses_status ON flagged_parses(status);
CREATE INDEX IF NOT EXISTS idx_flagged_parses_created ON flagged_parses(created_at DESC);
