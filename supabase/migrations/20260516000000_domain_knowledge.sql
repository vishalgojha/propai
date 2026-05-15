CREATE TABLE IF NOT EXISTS domain_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_type TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  confidence REAL DEFAULT 1.0,
  source TEXT DEFAULT 'seed',
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_domain_knowledge_type ON domain_knowledge(knowledge_type);
CREATE INDEX IF NOT EXISTS idx_domain_knowledge_key ON domain_knowledge(key);

ALTER TABLE public_listings ADD COLUMN IF NOT EXISTS embeddings_generated BOOLEAN DEFAULT FALSE;
