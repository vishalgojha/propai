# PropAI Pulse — Database Schema

**Database**: PostgreSQL on Supabase with `pgvector` and `pg_trgm` extensions.

---

## Key Tables

### Core Stream (Ingestion Pipeline)

```
whatsapp_groups
  ├── jid (PK), name, tenant_id, is_listening, group_config
  └── maps to group_configs (behavior, model_preference, etc.)

messages
  ├── id, tenant_id, remote_jid, text, sender, timestamp
  └── raw WhatsApp messages (before parsing)

raw_dump
  ├── id, message_id, raw_json, session_id, rejection_reason
  └── full original message payloads

stream_items  (PARENT — all parsed listings/requirements)
  ├── id (PK), tenant_id, message_id (unique per tenant)
  ├── raw_text, type (Sale/Rent/Lease), record_type (listing/requirement)
  ├── locality, city, property_category (residential/commercial)
  ├── configuration, bhk, price_numeric, price_label
  ├── area_sqft, furnishing, floor_number, total_floors, property_use
  ├── confidence_score, embedding vector(768), content_hash (unique)
  ├── parser_version, ingestion_status
  ├── canonical_record_id (FK → canonical_records)
  ├── source_group_id, source_phone
  ├── is_global (visible to all authenticated users)
  └── created_at

stream_items_residential  (CHILD — inherits stream_items structure)
  ├── all parent columns + residential-specific
  └── HSTORE for flexible parsed fields

stream_items_commercial  (CHILD — inherits stream_items structure)
  ├── all parent columns + commercial-specific
  ├── commercial_type (Office/Shop/Showroom/Warehouse/etc.)
  ├── fitout_status, workstations_count, cabins_count
  └── HSTORE for flexible parsed fields

stream_item_corrections
  └── tenant corrections to parsed stream items (user overrides)

search_reference  (autocomplete index)
  ├── term, term_type (locality/building/project/landmark), standard_form, city, popularity
  └── populated by triggers on stream_items_residential / _commercial
```

### Channels & Inbox (Broker Dashboard)

```
broker_channels
  ├── id (PK), tenant_id, name, slug (unique per tenant)
  ├── channel_type (listing/requirement/mixed)
  ├── filter criteria: localities[], keywords[], deal_types[], bhk_values[], etc.
  ├── budget_min, budget_max, confidence_min
  └── pinned, is_active

channel_items
  ├── id (PK), channel_id (FK → broker_channels), stream_item_id (FK → stream_items)
  ├── matched_by (rule/manual/ai), match_score, is_read
  └── unique (channel_id, stream_item_id)

inbox_items
  ├── id (PK), tenant_id
  ├── listing_id (FK → stream_items), requirement_id (FK → stream_items)
  ├── match_score, match_reasons[]
  └── unique (tenant_id, listing_id, requirement_id)
```

### Canonical Records (Deduplication)

```
canonical_records
  ├── id (PK)
  ├── record_kind (listing/requirement), deal_type, asset_class
  ├── property_category (residential/commercial)
  ├── locality, city, building_name, configuration, bhk
  ├── price_numeric, area_sqft, furnishing
  ├── status (active/stale/withdrawn/conflicted)
  ├── source_count, unique_broker_count, contradiction_count
  ├── best_stream_item_id, semantic_fingerprint_text
  └── first_seen_at, last_seen_at

canonical_record_evidence
  ├── id (PK)
  ├── canonical_record_id (FK), stream_item_id (FK), tenant_id (FK)
  ├── evidence_weight, match_confidence
  ├── merge_decision (matched/possible_match/conflict/rejected)
  ├── field_agreement jsonb, field_conflicts jsonb
  └── unique (canonical_record_id, stream_item_id)

source_reliability
  ├── id (PK), source_phone, tenant_id
  ├── sample_count, correction_count, duplicate_count, reliability_score
  └── unique (tenant_id, source_phone)
```

### WhatsApp Session State

```
whatsapp_sessions
  ├── id (PK), tenant_id (FK), label (default: 'Owner')
  ├── owner_name, session_data jsonb (full Baileys auth state)
  ├── status (disconnected/connecting/connected)
  └── unique (tenant_id, label)

whatsapp_event_logs
  ├── id (PK), session_label, event_type, description, metadata jsonb
  └── detailed connection lifecycle events

whatsapp_presence_events
  ├── id (PK), workspace_owner_id (FK), session_label
  ├── event_type, status, remote_jid, metadata jsonb
  └── presence tracking for live UI
```

### Identity & Profile

```
profiles
  ├── id (PK, FK → auth.users), phone (unique), email (unique)
  ├── full_name, timezone, phone_verified
  ├── trial_started_at, trial_used
  ├── history_processed, history_message_count, history_total_count
  └── is_admin (deprecated in favor of app_role)

workspace_members
  ├── id (PK), tenant_id (FK), member_id (FK → profiles)
  ├── role (admin/member/viewer)
  └── unique (tenant_id, member_id)

subscriptions
  ├── tenant_id (PK, FK), plan (Free/Pro/Team), status (trial/active/cancelled/past_due)
  ├── renewal_date, razorpay_subscription_id
  └──

group_configs
  ├── group_id (PK), tenant_id (FK)
  ├── model_preference, behavior, reply_timing, tone, language
  └── per-group parsing/agent settings
```

### Public Feed

```
public_listings
  ├── id (PK), title, description, price, locality, city, bhk, area_sqft
  ├── broker_name, broker_phone, source_group_name
  └── publicly visible listings on propai.live

public_property_leads
  ├── id (PK), listing_id (FK → public_listings)
  ├── name, phone, email, message
  └── lead capture form submissions from public site
```

### Market Data

```
igr_transactions
  ├── id (PK), locality, city, property_type
  ├── transaction_price, area_sqft, registration_date
  └── government registration data for price validation

locality_aliases
  ├── id (PK), canonical_name, aliases text[], city
  └── maps variant spellings to canonical locality names

location_cache
  ├── id (PK), query, result jsonb, cached_at
  └── cached geocoding/location lookups
```

### AI & Agent

```
ai_usage_tracking
  ├── id (PK), tenant_id, provider, model, tokens_in, tokens_out
  ├── duration_ms, endpoint
  └── per-request LLM usage logging

chat_sessions
  ├── id (PK), tenant_id, user_id, title, messages jsonb
  └── persistent AI chat history

api_keys (per-tenant AI provider keys)
  ├── tenant_id + provider (composite PK)
  └── encrypted provider API keys
```

### Auxiliary

```
follow_up_tasks, lead_records, broker_contacts, conversations
whatsapp_threads, agent_behavior_rules, agent_events
broadcast_campaigns, push_subscriptions
workspace_activity_events, workspace_settings, workspace_metadata
mcp_oauth_clients, mcp_oauth_codes, mcp_sessions
syndication_outbox, market_insights, contact_submissions
```

---

## Extensions

| Extension | Purpose |
|-----------|---------|
| `pgvector` | Embedding similarity search (HNSW index on `stream_items.embedding`) |
| `pg_trgm` | Fuzzy text matching for locality/building autocomplete |
| `hstore` | Flexible parsed field storage on child tables |

---

## Key Indexes

- `idx_stream_items_embedding` — HNSW index on `embedding vector_cosine_ops` (m=16, ef_construction=200)
- `idx_stream_items_tenant_created` — `(tenant_id, created_at desc)` for feed queries
- `idx_stream_items_configuration` — `(tenant_id, configuration)` for filtered queries
- `idx_canonical_records_kind_seen` — `(record_kind, last_seen_at desc)`
- `idx_channel_items_channel_unread` — `(channel_id, is_read)` for unread counts

---

## RLS Pattern

Most tenant-scoped tables use `auth.uid() = tenant_id` for row-level security.
- `canonical_records` and `stream_items` (when `is_global = true`) are readable by all authenticated users.
- `agent_events` allows service-role insert via `with check (true)` policy.
- Public tables (`public_listings`, `igr_transactions`) are readable by anon.

---

## Migration Workflow

Migrations are plain SQL files in `supabase/migrations/`, named `YYYYMMDDHHMMSS_description.sql`. Apply them manually via Supabase Dashboard SQL Editor or the Supabase CLI.

```bash
supabase migration up
```

**Important**: The migration history table (`supabase_migrations.schema_migrations`) may have duplicates due to manual SQL Editor runs. Check before applying new migrations.

---

## pgvector Notes

- `embedding` column is `vector(768)` — must match provider (Doubleword `Qwen/Qwen3-Embedding-8B`)
- `match_listings()` function filters by tenant, locality, configuration, type
- `market_stats()` function aggregates price data by locality
- Re-embedding after changing providers requires backfill (`POST /api/backfill-embeddings`)
