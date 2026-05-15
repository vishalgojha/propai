CREATE TABLE IF NOT EXISTS broker_profiles (
    phone TEXT PRIMARY KEY,
    name TEXT,
    agency TEXT,
    localities JSONB DEFAULT '[]'::jsonb,
    listing_count INT DEFAULT 0,
    requirement_count INT DEFAULT 0,
    avg_price_listing NUMERIC,
    avg_price_requirement NUMERIC,
    groups JSONB DEFAULT '[]'::jsonb,
    last_active TIMESTAMPTZ,
    first_seen TIMESTAMPTZ DEFAULT now(),
    total_messages INT DEFAULT 0,
    monthly_activity JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broker_profiles_name ON broker_profiles (name);
CREATE INDEX IF NOT EXISTS idx_broker_profiles_listing_count ON broker_profiles (listing_count DESC);
CREATE INDEX IF NOT EXISTS idx_broker_profiles_last_active ON broker_profiles (last_active DESC);
