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

- **Project detail pages** — New `/project/[slug]` and `/project/[slug]/units` routes. Hero image gallery, stats bar, overview grid, amenities (with show more), floor plan cards, nearby places, similar projects sidebar, available units with BHK filter pills. Units view has search, sort (price/area/latest), config filter pills, mobile sticky CTA. 10 seed projects with 30+ inventory items in `src/data/projects.ts`. Added `/project/[slug]` to sitemap.
- **Full-screen locality map** — Interactive MapLibre GL JS map at `/explore` with 5 data layers (avg sale, rental, active listings, yield, density), color-coded polygons, hover tooltips, click-to-fly, right-side panel with metrics/BHK mix/rankings.
- **Market intelligence page** — `/intelligence` with aggregated locality data grid, searchable/sortable, per-locality KPIs.
- **Mobile-first homepage redesign** — Property-first flow, removed hero animation/FAQ/chat/map tab, compact listing cards, sticky mobile filters on listings page.
- **Mobile bottom nav** — Search, Listings, Map, Insights tabs, hidden on `/explore`, footer hidden on mobile.
- **10 seed projects** — Lodha Marquise, Hiranandani Olivia, Runwal Bliss, Lodha Bellissimo, Piramal Mahalaxmi, Omkar Alta Monte, Rustomjee Evershine Global, Kanakia Silicon Valley, Oberoi Eucalyptus, Adani Esperanza.

### Relevant Files

- `apps/www/app/project/[slug]/page.tsx` — SSR project detail route
- `apps/www/app/project/[slug]/units/page.tsx` — SSR inventory route
- `apps/www/src/views/ProjectPage.tsx` — Project detail view (hero, stats, overview, amenities, floor plans, similar, units)
- `apps/www/src/views/ProjectUnits.tsx` — Full inventory list with search, sort, BHK filters
- `apps/www/src/lib/projects.ts` — Data-fetching layer (async wrappers around seed data)
- `apps/www/src/data/projects.ts` — 10 seed projects + 30+ inventory items
- `apps/www/app/sitemap.ts` — Added project pages
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

- Latest commit: `03b58e18` — `Add project detail pages with resale inventory`

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
