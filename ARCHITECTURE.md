# PropAI Pulse — Architecture

## Overview

PropAI Pulse is an AI-powered real estate platform for Indian brokers. It ingests WhatsApp group messages, parses them into structured property listings/requirements, enriches them with market data, and exposes the result through a dashboard, public feed, and MCP tools for AI assistants.

```
WhatsApp Groups → Baileys → Parse → Enrich → Canonicalize → Publish
                                                              ├── Broker Dashboard (app.propai.live)
                                                              ├── Public Feed (propai.live)
                                                              └── MCP Tools (AI assistants)
```

## Services

| Service | Directory | Port | Purpose |
|---------|-----------|------|---------|
| **API** | `apps/api` | 3001 | Express backend: REST API, WhatsApp runtime, background jobs |
| **App** | `apps/app` | 3000 | Next.js broker dashboard (PWA, auth required) |
| **WWW** | `apps/www` | 3002 | Next.js public website (no auth, SEO) |
| **MCP** | `apps/mcp` | 3003 | Model Context Protocol server for AI assistants |

All services share a single **Supabase** (PostgreSQL + pgvector) database.

---

## Data Pipeline

### 1. Ingestion (WhatsApp → Stream)

```
WhatsApp Group
  ↓ (WebSocket)
Baileys Socket (WhatsAppClient.ts)
  ↓ messages.upsert event
PropAISupabaseAdapter.saveInboundMessage()
  ↓ persist raw message + price gate check
channelService.ingestMessage()
  ↓ split multi-listing text → extract fields (BHK, price, locality, etc.)
  ↓ classify residential/commercial
stream_items_residential OR stream_items_commercial
  ↓
embeddingService.generateEmbedding() → vector(768) stored on row
```

**Key files:**
- `apps/api/src/whatsapp/WhatsAppClient.ts` — Baileys socket, connection lifecycle
- `apps/api/src/whatsapp/PropAISupabaseAdapter.ts` — Raw message persistence + price gate
- `apps/api/src/channel-events/processors/processWhatsAppInboundMessage.ts` — Routes message to parsing or agent
- `apps/api/src/services/channelService.ts` — Core stream ingestion engine (~5000 lines)
- `apps/api/src/services/embeddingService.ts` — Doubleword embedding generation

### 2. Parsing (Text → Structured Data)

Each message segment is parsed by `channelService.ts` to extract:
- **Asset class**: residential / commercial
- **Type**: Sale / Rent / Requirement
- **Configuration**: BHK (1-5+), Studio, or commercial type (Office/Shop/Showroom/Warehouse/etc.)
- **Price**: parsed via `parsePrice()` → numeric value + unit (Cr/Lac/sqft)
- **Location**: locality → building name → micro-location
- **Area**: sqft (built-up, carpet, plot)
- **Furnishing**: Fully/Semi/Unfurnished
- **Broker contacts**: name + phone pairs extracted via `extractBrokerContacts()`

### 3. Enrichment

- **Location enrichment**: Matches locality names to canonical localities in `locality_aliases`
- **IGR data**: Optionally enriches with government registration transaction prices
- **Embeddings**: Doubleword `Qwen/Qwen3-Embedding-8B` (768-dim) for semantic search

### 4. Canonicalization

- Deduplicates similar listings across sources into `canonical_records`
- Links stream items to canonicals via `canonical_record_evidence`
- Not yet fully active in production (pending market-graph rollout)

### 5. Visibility (Stream → Channels → Frontend)

- **Stream items** are the base parsed feed
- **Broker channels** are user-created filtered views (by locality, type, budget)
- **Channel items** link stream items to channels
- **Inbox items** match listings to requirements
- Frontend consumes via REST API (`/api/channels/*`)

---

## WhatsApp Runtime

### Session Architecture

```
SessionManager (singleton)
  ├── Map<"tenantId:label", WhatsAppClient>
  ├── getSession() / createSession() / removeSession()
  └── rehydratePersistedSessions() — on startup, resume all DB-persisted sessions

WhatsAppClient (per session)
  ├── makeWASocket() — Baileys WebSocket
  ├── connect() — QR or pairing code auth
  ├── connection.update handler — open/close/reconnect
  ├── messages.upsert handler — inbound messages
  └── CircuitBreaker — prevents reconnect storms
```

### Process Modes

Controlled by `PROPAI_PROCESS_ROLE`:
- **`all`** (default): API server + WhatsApp runtime in one process
- **`api`**: API surface only, no Baileys (for separate worker deployment)
- **`whatsapp`**: WhatsApp runtime only, no API (dedicated worker)

### Connection Lifecycle

1. **Initiation**: User provides phone number via UI → `POST /api/whatsapp/connect`
2. **Auth**: QR code (desktop) or pairing code (mobile) generated
3. **Linked**: User links via WhatsApp mobile app
4. **Connected**: Socket opens, history sync begins, groups registered
5. **Reconnection**: Automatic with exponential backoff (10 attempts, 1s → 18s)
6. **Conflict**: If replaced by another device → blocked from auto-reconnect
7. **Stall detection**: If no inbound messages for threshold → push notification alert

---

## Database

**PostgreSQL** with **pgvector** extension, hosted on Supabase.

Key schemas:
- **`stream_items`** (parent table with inheritance-like pattern) + **`stream_items_residential`** + **`stream_items_commercial`** (child tables)
- **`whatsapp_sessions`** — session state, auth creds, connection artifacts in `session_data` jsonb
- **`canonical_records`** — deduplicated property records
- **`channels`** / **`channel_items`** — user filtered views
- **`messages`** / **`raw_dump`** — message persistence
- **`profiles`** / **`subscriptions`** / **`workspace_members`** — identity & billing
- **`group_configs`** — per-group parsing behavior
- **`whatsapp_groups`** — managed group directory

See `DATABASE.md` for full schema reference.

---

## AI Providers

| Provider | Use | Model | Key Env Var |
|----------|-----|-------|-------------|
| Groq | Primary agent/default LLM | llama-3.3-70b / mixtral-8x7b | `GROQ_API_KEY` |
| Gemini | Fallback LLM | gemini-2.0-flash | `GEMINI_API_KEY` |
| Doubleword | Embeddings | Qwen/Qwen3-Embedding-8B (768d) | `DOUBLEWORD_EMBEDDING_API_KEY` |
| OpenRouter | MCP LLM calls | gpt-4o-mini → groq fallback | `OPENROUTER_API_KEY` |
| NVIDIA | Future primary (pending) | nemotron-3-ultra-550b-a55b | `NVIDIA_API_KEY` |
| OpenAI | Optional fallback | gpt-4o | `OPENAI_API_KEY` |

---

## MCP Server

The MCP server (`apps/mcp`) exposes 26 tools for AI assistants (Claude Desktop, etc.):

```
search_listings, search_requirements, get_igr_price, match_listing_to_requirement,
semantic_search, get_fresh_stream, broker_activity, triage_hot_leads,
extract_thread_actions, save_thread_requirement, save_thread_listing,
create_thread_follow_up, buyer_to_inventory_match, match_requirement_to_broker,
pricing_negotiation_brief, stale_lead_reactivation, draft_growth_asset,
create_requirement, draft_broadcast, market_summary, price_estimate,
qualify_lead, save_listing, set_follow_up, summarise_thread
```

Auth: Bearer token (JWT or static API key) or OAuth 2.0 with PKCE.

---

## Embedding Pipeline

1. **`POST /api/backfill-embeddings`** — One-shot re-embed of all stream items
2. **At ingest time**: `embedStreamItem()` called in `channelService.ts` after insert
3. **Semantic search**: MCP tool queries child tables directly with client-side cosine similarity; API uses `match_listings` pgvector RPC
4. **Provider**: Doubleword only (768 dimensions). Mixing providers breaks search.

---

## Key Tech Decisions

- **Baileys** (`@whiskeysockets/baileys`) for WhatsApp WebJS — not Meta Cloud API (except WABA Embedded Signup)
- **Supabase** for auth, DB, realtime, storage — no separate backend for auth
- **PostgREST** for some DB queries via Supabase JS client
- **Tailwind CSS v4** throughout all frontend apps
- **Next.js 16 App Router** for both app and www
- **Standalone Docker output** for all services (Coolify deploys these)
- **Opt-IN parsing default**: groups without `group_configs` row parse by default
