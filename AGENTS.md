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

- **Redeploy ALL services** after pushing — changes since last deploy touch API (activation code length 8→4), App (Login.tsx, McpAuthorize page, sidebar), MCP (HTML auth page, device authorize endpoint, smartSearch fix), WWW (broker contact card, AI description), Evolution API (needs restart).

### Backfill Status

- Embeddings now use Doubleword `Qwen/Qwen3-Embedding-8B` at 768 dimensions.
- Re-embed existing stream rows after provider changes; do not mix vectors from different providers.
- Use `POST /api/backfill-embeddings` with a long HTTP timeout from production infrastructure.
- The `is("embedding", null)` filter doesn't work on pgvector columns via PostgREST — the backfill re-processes ALL rows including existing embeddings, so it's idempotent but wasteful.

### Completed in This Session

- **MCP Device Code authorize endpoint + app authorize page** — Added `POST /device/authorize` handler in `oauth.ts` that lets an authenticated app user approve a device code by providing `user_code` + `Authorization: Bearer <token>`. Created `/mcp-authorize` page at `apps/app/src/views/McpAuthorize.tsx` — users enter their PROP-ABCD code, page sends their session JWT to authorize the device. Route mounted at `apps/app/app/(public)/mcp-authorize/page.tsx`. Commit `bf2c11ce`.
- **MCP GET /authorize now returns HTML page** — Instead of returning raw JSON, the endpoint now renders a full dark-themed HTML page showing the device code prominently with a "Authorize with PropAI App" button (opens app.propai.live/mcp-authorize) and an email/password fallback form. Commit `a9a978a7`.
- **MCP Authorize sidebar nav** — Added "MCP Authorize" entry to the app sidebar linking directly to `/mcp-authorize`. Commit `a9a978a7`.
- **www listing page broker contact + AI description** — Added broker contact card with name, phone, and wa.me link in the sidebar. Simplified "About this listing" fallback to remove robotic meta-commentary. Commit `888bf608`.

- **Project Hub (app.propai.live)** — New `Project Hub` sidebar nav item linking to `/projects` (search/browse) and `/projects/[slug]` (detail). B2B broker-facing platform with:
  - Supabase migration: `developer_projects`, `project_inventory`, `project_contacts`, `project_resources`, `project_updates`, `project_broker_resources` tables with RLS
  - API: `GET /api/projects/search` (public), `GET /api/projects/:id` (public), plus authenticated CRUD for inventory, contacts, resources, updates, broker resources
  - App view `ProjectHub.tsx`: search by name/developer/locality, results list with status badges, verified badges, config chips
  - App view `ProjectDetail.tsx`: full project detail with hero, stats, inventory grouped by BHK, amenities (show more), floor plans, sales contacts (primary + team), resources (brochure/sheets/plans via download links), broker-only resources, project updates timeline, mobile sticky contact bar
  - API service + controller + routes at `apps/api/src/services/projectService.ts`, `controllers/projectController.ts`, `routes/projectRoutes.ts`, `schemas/projectSchemas.ts`
- **www listing slug fix** — Improved slug format from `{bhk}-configuration-in-{locality}-{type}-{shortId}` (e.g. `3-configuration-in-bandra-east-sale-04b39f30`) to `{bhk}-{type}-{locality}-{shortId}` (e.g. `3-bhk-sale-bandra-east-04b39f30`) for better SEO. Handles BHK, RK, studio, and decimal configurations.

### Relevant Files

- `apps/api/src/services/projectService.ts` — Project CRUD service
- `apps/api/src/controllers/projectController.ts` — Project request handlers
- `apps/api/src/routes/projectRoutes.ts` — Project API routes
- `apps/api/src/schemas/projectSchemas.ts` — Zod validation schemas
- `supabase/migrations/20260624000001_create_project_hub.sql` — DB schema for 6 project tables
- `apps/app/src/views/ProjectHub.tsx` — Project search/browse view
- `apps/app/src/views/ProjectDetail.tsx` — Full project detail with contacts, inventory, resources
- `apps/app/app/(protected)/projects/page.tsx` — Project hub route
- `apps/app/app/(protected)/projects/[slug]/page.tsx` — Project detail route
- `apps/app/src/components/Sidebar.tsx` — Added Project Hub nav item
- `apps/www/app/explore/page.tsx` — SSR explore route
- `apps/www/src/views/LocalityExplore.tsx` — Map + panel + search + rankings
- `apps/www/src/components/LocalityDataMap.tsx` — MapLibre GL JS with polygon layers
- `apps/www/src/data/localityPolygons.ts` — GeoJSON for 20 Mumbai localities
- `apps/www/lib/explore.ts` — Aggregates stream data for map
- `apps/www/app/intelligence/page.tsx` — Market insights SSR route
- `apps/www/src/views/MarketIntelligence.tsx` — Locality data grid
- `apps/www/src/views/Home.tsx` — Mobile-first rewrite
- `apps/www/src/components/ListingCard.tsx` — Compact mobile prop
- `apps/www/src/views/Listings.tsx` — Sticky mobile filters
- `apps/www/src/components/PublicNav.tsx` — Bottom nav bar
- `apps/www/src/components/Footer.tsx` — `hidden md:block`

### Architecture: Evolution API

Evolution API (`evoapicloud/evolution-api:latest`) runs as a Coolify Dockerfile app. It embeds PostgreSQL inside the container (Alpine `postgresql` package) to avoid Supabase IPv6/pooler issues.

- **Dockerfile**: `apps/evolution-api/Dockerfile` — installs postgresql, custom entrypoint that inits/starts PG, sets up `evolution` database, runs Prisma migrations, starts the API.
- **Data directory**: `/data/pg` inside container. Persistence requires Docker volume mount.
- **Port**: 8080 (internal), exposed via Coolify proxy at `http://m9eosll2dfd5lrh517yi2jvd.116.202.9.89.sslip.io`
- **Auth**: `AUTHENTICATION_API_KEY=propai-evo-9bd64c87537000524265e308d3213abd`
- **API service integration**: `EVOLUTION_API_URL=http://evolution-api:8080`, `EVOLUTION_API_KEY` on `propai api` service
- **Known limitation**: Supabase direct connection is IPv6-only; Supabase pooler not available for this project. Embedded PG is the working workaround.

### Current Remote State

- Latest commit: `30e4fc36` — `Fix www listing slug format for SEO`

### Operational Rules

- Prefer selective staging when unrelated work is present.
- After each completed task, the agent should push the relevant branch/commit and redeploy the affected Coolify service(s) by default.

### Handoff Hygiene

- Do not leave completed tasks listed as pending.
- Keep only current branch context, active worktree state, and truly pending actions here.
- Historical session detail belongs in git history, not in the active handoff.

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
