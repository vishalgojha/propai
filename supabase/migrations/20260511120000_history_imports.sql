CREATE TABLE IF NOT EXISTS history_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  filenames JSONB DEFAULT '[]'::jsonb,
  file_size_kb NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  total_messages INTEGER DEFAULT 0,
  parsed_listings INTEGER DEFAULT 0,
  parsed_requirements INTEGER DEFAULT 0,
  skipped_messages INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_history_imports_workspace ON history_imports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_history_imports_status ON history_imports(status);
