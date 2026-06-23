# PropAI Pulse — Company & Platform Context

## Documentation

System-level docs written for successor handoff. Read these before making changes:

| Doc | Location | Contents |
|-----|----------|----------|
| **Architecture** | `ARCHITECTURE.md` | Data pipeline, service boundaries, key tech decisions |
| **Backend API** | `apps/api/README.md` | Module map, routes, directory structure |
| **Deployment** | `DEPLOY.md` | Coolify services, env var master table, setup |
| **Database** | `DATABASE.md` | Schema overview, key tables, indexes, RLS pattern |
| **Runbook** | `RUNBOOK.md` | Troubleshooting, reset procedures, common scenarios |

**PropAI Pulse** is an AI-powered real estate platform for Indian brokers, built by **Vishal Ojha**.
- **Website**: propai.live
- **Founder**: Vishal Ojha — 15+ years of real estate brokerage experience in Mumbai/India.
- **Platform**: AI-driven WhatsApp ingestion, parsing, matching, and CRM for real estate brokers.

# Repo Notes

- After every completed task, push the relevant git branch/commit so the remote stays current.
- After each push, redeploy the relevant Coolify service(s) for the code you changed:

| Code Changed | Redeploy Service(s) | Coolify Name | Coolify UUID |
|-------------|-------------------|--------------|--------------|
| `apps/api/**` | **API** | `propai api` | `k12r72fxjn4dz0p5vo3uwrkq` |
| `apps/app/**` | App | `propai pulse` | `lburg4buwnc94z9hpx0walg5` |
| `apps/www/**` | WWW | `propai:web` | `x37zz4949pttnobai5ov9q3p` |
| `apps/mcp/**` | MCP | `propaiMCP` | `agr47ygipjbqgnyuw9pl5fc8` |
| `apps/evolution-api/**` | Evolution API | `evolution-api` | `m9eosll2dfd5lrh517yi2jvd` |
| `packages/**` | All that depend on it | — | — |

## Architecture: WhatsApp Cloud API

PropAI uses the official Meta WhatsApp Business Platform (WABA) only. The API service receives webhooks and sends replies through Cloud API; it does not run a Baileys socket or a linked-device worker.

- Keep `CLOUD_API_WEBHOOK_ENABLED=false` until the intended WABA number has been onboarded, verified, and its Meta webhook is configured.
- Do not run, revive, or deploy a linked-device/Baileys runtime for a WABA number.

## PropAI Status Handoff

### Current Branch

- Canonical branch: `main`
- Current local branch should be treated as the source of truth unless the user explicitly says otherwise.

### Pending Actions

- None — Baileys removed, WABA is the only WhatsApp integration. Webhook enabled by default.

### Backfill Status

- Embeddings now use Doubleword `Qwen/Qwen3-Embedding-8B` at 768 dimensions.
- Re-embed existing stream rows after provider changes; do not mix vectors from different providers.
- Use `POST /api/backfill-embeddings` with a long HTTP timeout from production infrastructure.
- The `is("embedding", null)` filter doesn't work on pgvector columns via PostgREST — the backfill re-processes ALL rows including existing embeddings, so it's idempotent but wasteful.

### Completed in This Session

- **Evolution API batch parsing** — Webhook handler saves raw messages to `evolution_raw_messages` table (skips real-time ingest). New `evolutionBatchParserJob.ts` polls every 60s, batch of 10, calls `channelService.ingestMessage()`. Group management API (`GET/PATCH /whatsapp/groups`) with frontend route at `/whatsapp/groups` and sidebar nav item.
- **WABA duplicate replies fixed** — Added `claimed_at` column + `claim_webhook_events()` RPC with `FOR UPDATE SKIP LOCKED` on `cloud_api_webhook_events` (migration `20260623000005`). Worker now atomically claims events instead of raw SELECT.
- **WABA latency reduced** — `agentRouterService.route()` always uses Google (fast, free for tiny JSON) instead of inheriting conversation's `modelPreference: 'Doubleword'` — saves one heavy API call per message. Disabled Qwen thinking via `chat_template_kwargs: { enable_thinking: false }` in `callDoubleword()`.
- **Listing ref_no tracking** — `channelService.ingestMessage()` now returns `{ count, refNos }` with ref_nos from created stream items. WABA flow captures ref_nos, appends context to `agentInputText` so the AI can tell the user the code(s).
- **Bare media auto-attach** — When photo/video without caption arrives, `findRecentStreamItem()` queries for sender's stream items within 5 min. If found, `attachMediaToStreamItem()` updates `parsed_payload.files` on the stream item. AI prompt tells user media was attached.
- **Ref_no guaranteed in reply** — Added post-processing fallback: if AI reply omits ref_no, append "Saved as L-0001". Also fixed duplicate detection paths in channelService to capture ref_no.
- **Evolution API auth fix** — Changed `Authorization: Bearer` header to `apiKey` header in `EvolutionApiWhatsAppGateway.ts` — Evolution API doesn't accept Bearer prefix, was silently 401-ing all requests (QR generation timed out).
- **Property photo gallery** — New `GET /api/stream-items/:id/photos` endpoint returns signed URLs from Supabase Storage for files linked via `parsed_payload.files`. New `ListingGallery` component with PhotoSwipe 5 lightbox (zoom, swipe, fullscreen). 4-col thumbnail grid (hero 2x2 + tiles). Lazy-loaded on card expand.
- **Listing card redesign** — Price-first layout: price at top, BHK • Area • Parking inline, feature row (Furnished • Sea View), amenity chips (top 3 + N more), freshness badge (`⚡ Fresh broker signal`). Removed redundant description/chips block. Footer simplified.
- **Card visual hierarchy** — Increased collapsed card border from `white/[0.02]` to `rgba(34,255,170,0.06)`. Added dual glow orbs on hover (top-right + bottom-left).
- **DB-backed webhook queue** — Webhook handler now inserts raw events into `cloud_api_webhook_events` and returns immediately. New `WebhookQueueWorker` polls every 2s, batch of 10. Added index `(processed, created_at) WHERE processed = false`.
- **Stream plan gating removed** — `resolveStreamAccess()` always returns `canViewStream: true`. Removed all 403 access checks, `isSuperAdmin`/`canViewStreamPlan` memos, "Stream locked" card, Sidebar gate.
- **IGR removed from listing cards** — Removed all IGR badges, building intel, transaction display from `Listings.tsx`. ~176 lines deleted.
- **Provider order tenant-aware** — `buildProviderOrder()`: admin tenant gets Nvidia-first chain, regular users get Google-first.
- **Partner "Unknown" fix** — `enrichPartnerName()` shows "Revoked invite" / "Awaiting acceptance" instead of "Unknown" for unaccepted invites.
- **WABA sender recognition** — `resolveTenantFromPhone()` checks `profiles` as fallback. `AgentExecutor.ts` resolves sender by phone in else branch. `shouldGreetBrokerByName` compares normalized phones.
- **Pulse prompt rewrite** — Natural colleague tone, no capability bullets, no sales language, banned "unfortunately" / "we regret".
- **Conversation history fix** — `general_answer` shortcut removed. Main AI always runs with full history. Router prompt: "do NOT include a reply field".
- **Qwen thinking disabled** — `chat_template_kwargs: { enable_thinking: false }` on Doubleword.
- **Password login → WhatsApp magic link** — Replaced password auth with WhatsApp-based login link flow. Removed `authController.ts`, simplified `Login.tsx`, `authRoutes.ts`, `authSchemas.ts`.
- **`public_listings` live sync** — Added trigger `sync_stream_item_to_public_listings()` on both `stream_items_residential` and `stream_items_commercial`, with `ON CONFLICT (source_message_id) DO UPDATE`. Backfill uses `DISTINCT ON` + `ON CONFLICT DO NOTHING`.
- **Building name `-` → `"On Request"`** — `formatBuildingName()` helper in `Listings.tsx` and `ListingCard.tsx` treats `-`, empty, N/A, unknown as `"On Request"`. Applied in table cell, card view, card subtitle, WA share text, dedupe key, card title, IGR section.
- **`building_intel` MCP tool** — Queries `stream_items_residential`/`commercial` for: price/sqft benchmarks (sale + rent), locality supply snapshot (listing vs requirement counts + market label), configuration demand map. Params: `building_name` (req), `locality`, `days_back` (default 90). Token-level building matching, dedup via `source_message_id` Sets.
- **Evolution API deployed** — Custom Docker image with embedded PostgreSQL (`apk add postgresql`). Container-internal database at `localhost:5432`, no external DB dependency. Entrypoint inits PG, runs Prisma migrations, then starts Evolution API. Coolify app UUID: `m9eosll2dfd5lrh517yi2jvd`.

### Relevant Files

- `apps/api/src/services/channelService.ts` — `ingestMessage()` return type changed to `{ count, refNos }`. Updated `normalizeAndPersistStreamItems()` to capture and return ref_nos.
- `apps/api/src/services/whatsappCloudApiService.ts` — Captures ref_nos and appends to `agentInputText`. Added `attachMediaToStreamItem()` private method. Bare media auto-attach to recent listing.
- `apps/api/src/services/historyBatchService.ts` — Updated to use new `{ count, refNos }` return type.
- `apps/api/src/jobs/evolutionBatchParserJob.ts` — New batch parser for Evolution raw messages.
- `apps/api/src/runtime/backgroundJobService.ts` — Registers `evolutionBatchParserJob`.
- `apps/api/src/services/evolutionWebhookService.ts` — Saves raw webhook payloads, skips real-time ingest.
- `apps/api/src/services/aiService.ts` — `callDoubleword()` with `chat_template_kwargs: { enable_thinking: false }`; `buildProviderOrder()` uses task preference.
- `apps/api/src/services/conversationEngineService.ts` — Router call omits modelPreference.
- `apps/api/src/services/agentRouterService.ts` — Intent classifier always uses task-preferred model (Google).
- `supabase/migrations/20260623000004_create_evolution_raw_messages.sql`
- `supabase/migrations/20260623000005_webhook_queue_atomic_claim.sql`
- `apps/app/src/views/GroupMonitor.tsx` — Group management UI.
- `apps/app/app/(protected)/whatsapp/groups/page.tsx` — Group Monitor route.

### Architecture: Evolution API

Evolution API (`evoapicloud/evolution-api:latest`) runs as a Coolify Dockerfile app. It embeds PostgreSQL inside the container (Alpine `postgresql` package) to avoid Supabase IPv6/pooler issues.

- **Dockerfile**: `apps/evolution-api/Dockerfile` — installs postgresql, custom entrypoint that inits/starts PG, sets up `evolution` database, runs Prisma migrations, starts the API.
- **Data directory**: `/data/pg` inside container. Persistence requires Docker volume mount.
- **Port**: 8080 (internal), exposed via Coolify proxy at `http://m9eosll2dfd5lrh517yi2jvd.116.202.9.89.sslip.io`
- **Auth**: `AUTHENTICATION_API_KEY=propai-evo-9bd64c87537000524265e308d3213abd`
- **API service integration**: `EVOLUTION_API_URL=http://evolution-api:8080`, `EVOLUTION_API_KEY` on `propai api` service
- **Known limitation**: Supabase direct connection is IPv6-only; Supabase pooler not available for this project. Embedded PG is the working workaround.

### Current Remote State

- Latest commits:
  - `f5d32934` — `Embed PostgreSQL inside Evolution API container for local database`
  - `c875ebe7` — `Add building_intel MCP tool: price/sqft benchmarks, locality supply snapshot, configuration demand map`
  - `d5b3e5ac` — `Show 'On Request' instead of '-' for building name in all listing views`
  - `78b9e649` — `Fix: use ON CONFLICT DO NOTHING for public_listings backfill, add DISTINCT ON for dedup`
  - `9c8b814c` — `Replace password login with WhatsApp magic link`
  - `66800a82` — `Add DB-backed webhook queue with polling worker`
  - `549ae1b5` — `Remove stream plan gating (canViewStream always true)`
  - `04e10c33` — `Remove all IGR references from stream listing cards`
  - `c713dc15` — `Remove general_answer shortcut, set brokerProfile to null for unknown senders, disable Qwen thinking`

### Operational Rules

- Prefer selective staging when unrelated work is present.
- After each completed task, the agent should push the relevant branch/commit and redeploy the affected Coolify service(s) by default.

### Handoff Hygiene

- Do not leave completed tasks listed as pending.
- Keep only current branch context, active worktree state, and truly pending actions here.
- Historical session detail belongs in git history, not in the active handoff.

### Operational Rules

- Prefer selective staging when unrelated work is present.
- After each completed task, the agent should push the relevant branch/commit and redeploy the affected Coolify service(s) by default.

## Manual Setup Steps

### VAPID Keys for Push Notifications

Push notifications (FIX 4) require VAPID keys. Generate them once and add to Coolify env vars:

```bash
npx web-push generate-vapid-keys
```

Add these env vars to both `apps/api` and `apps/app` (app needs only the public key):
- `VAPID_PUBLIC_KEY` (app + api)
- `VAPID_PRIVATE_KEY` (api only)
- `VAPID_EMAIL` (api only, default: admin@propai.live)

For local dev, add to `apps/api/.env` and `apps/app/.env.local`.

### Supabase Dashboard

- **Leaked Password Protection**: Requires Supabase **Pro Plan or higher** (free Plan does not include HaveIBeenPwned integration). Enable via Dashboard → Authentication → Settings → toggle ON.

## Embedding Service (Doubleword)

`semantic_search` (MCP tool) and `semanticSearchListings` (API workflow) use Doubleword `Qwen/Qwen3-Embedding-8B` with `dimensions: 768`, consumed by the existing 768-dim pgvector columns and `match_listings` RPC.

- Set `DOUBLEWORD_EMBEDDING_API_KEY` on backend and MCP services. The code falls back to `DOUBLEWORD_API_KEY` only if the dedicated key is missing.
- Optional model override: `DOUBLEWORD_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B`
- Optional dimensions override: `DOUBLEWORD_EMBEDDING_DIMENSIONS=768`
- The API `/health` route reports `embedding: connected|unreachable` and flips overall status to `degraded` (HTTP 503) when embeddings are unavailable.
