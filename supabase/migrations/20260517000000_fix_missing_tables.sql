-- Migration: Fix all missing table schemas and columns
-- This ensures all tables used by the code exist properly

-- 1. public_listings (was created manually, no migration)
CREATE TABLE IF NOT EXISTS public_listings (
    source_message_id TEXT PRIMARY KEY,
    source_group_id TEXT,
    source_group_name TEXT,
    listing_type TEXT NOT NULL,
    area TEXT,
    sub_area TEXT,
    location TEXT NOT NULL DEFAULT 'Unknown',
    price NUMERIC,
    price_type TEXT,
    size_sqft NUMERIC,
    furnishing TEXT,
    bhk INTEGER,
    property_type TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    raw_message TEXT,
    cleaned_message TEXT,
    sender_number TEXT,
    primary_contact_name TEXT,
    primary_contact_number TEXT,
    primary_contact_wa TEXT,
    contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence NUMERIC,
    message_timestamp TIMESTAMPTZ,
    search_text TEXT NOT NULL DEFAULT '',
    embeddings_generated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. broker_activity (was created manually, no migration)
CREATE TABLE IF NOT EXISTS broker_activity (
    phone TEXT PRIMARY KEY,
    name TEXT,
    agency TEXT,
    localities JSONB DEFAULT '[]'::jsonb,
    listing_count INTEGER DEFAULT 0,
    requirement_count INTEGER DEFAULT 0,
    avg_price_listing NUMERIC,
    avg_price_requirement NUMERIC,
    groups JSONB DEFAULT '[]'::jsonb,
    last_active TIMESTAMPTZ,
    first_seen TIMESTAMPTZ DEFAULT now(),
    total_messages INTEGER DEFAULT 0,
    monthly_activity JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_broker_activity_name ON broker_activity (name);
CREATE INDEX IF NOT EXISTS idx_broker_activity_listing_count ON broker_activity (listing_count DESC);
CREATE INDEX IF NOT EXISTS idx_broker_activity_last_active ON broker_activity (last_active DESC);

-- 3. raw_dump (was created manually, missing columns)
CREATE TABLE IF NOT EXISTS raw_dump (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID,
    session_id TEXT,
    group_jid TEXT,
    sender_jid TEXT,
    raw_text TEXT,
    rejection_reason TEXT,
    gate_status TEXT NOT NULL DEFAULT 'pending',
    received_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Ensure public_listings has embeddings_generated column (was in a separate migration that might have failed)
ALTER TABLE public_listings ADD COLUMN IF NOT EXISTS embeddings_generated BOOLEAN DEFAULT FALSE;
