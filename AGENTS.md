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
| `apps/api/**` | **API** + **WhatsApp Worker** | `propai api` | `k12r72fxjn4dz0p5vo3uwrkq` |
| | (both use same Dockerfile) | `propai whatsapp worker` | `y33718hsvleeozw3m2mz2dl5` |
| `apps/app/**` | App | `propai pulse` | `lburg4buwnc94z9hpx0walg5` |
| `apps/www/**` | WWW | `propai:web` | `x37zz4949pttnobai5ov9q3p` |
| `apps/mcp/**` | MCP | `propaiMCP` | `agr47ygipjbqgnyuw9pl5fc8` |
| `packages/**` | All that depend on it | — | — |

## Architecture: Split WhatsApp Runtime

The API (`apps/api`) is deployed as **two separate Coolify services** sharing the same Dockerfile but with different entrypoints and `PROPAI_PROCESS_ROLE`:

1. **`propai api`** — `PROPAI_PROCESS_ROLE=api` → Express HTTP server only (no Baileys). Handles REST API, serves the frontend.
2. **`propai whatsapp worker`** — `PROPAI_PROCESS_ROLE=whatsapp` → `node dist/whatsapp-worker.js` (Baileys only, no HTTP server). Handles WebSocket connections to WhatsApp, session management, message ingestion.

Both share the same Supabase database. The API writes connection artifacts (QR, pairing code, session data) to DB; the worker picks them up and runs Baileys. This is why `apps/api` changes always need **both services redeployed**.

## Critical Single-Session Rule

- Only ONE Baileys socket per WhatsApp number may exist at any time.
- The WhatsApp **worker** service (`propai whatsapp worker`) is the single owner of live Baileys/linked-device sessions.
- Do not add, run, revive, or deploy a second Baileys socket for the same WhatsApp number from any surface (including `PROPAI_PROCESS_ROLE=all` on any service).
- Multiple session owners cause WhatsApp `conflict type="replaced"` disconnects.

## PropAI Status Handoff

### Current Branch

- Canonical branch: `main`
- Current local branch should be treated as the source of truth unless the user explicitly says otherwise.

### Pending Actions

- **propai-gras fix**: Live IGR fetch (`/api/igr/fetch`) times out on government portal (`igrmaharashtra.gov.in`). Needs Camoufox-based browser navigation instead of direct HTTP fetch. Full prompt at `.agents/prompts/propai-gras.md`.
- **official-whatsapp-cloud-migration**: Retire/delete the current linked-device WhatsApp number before onboarding the official Meta Cloud API number. Do not migrate Cloud API onto the same live Baileys owner session.

### Backfill Status

- Embeddings now use Doubleword `Qwen/Qwen3-Embedding-8B` at 768 dimensions.
- Re-embed existing stream rows after provider changes; do not mix vectors from different providers.
- Use `POST /api/backfill-embeddings` with a long HTTP timeout from production infrastructure.
- The `is("embedding", null)` filter doesn't work on pgvector columns via PostgREST — the backfill re-processes ALL rows including existing embeddings, so it's idempotent but wasteful.

### Completed in This Session

- Fixed embedding backfill: added `POST /api/backfill-embeddings` endpoint
- Fixed TypeScript errors in `embeddingService.ts` (cast) and `backfillEmbeddingsController.ts` (record_type select)
- Fixed MCP OAuth FK violation: auto-create missing `mcp_oauth_clients` row in `oauth.ts`
- Fixed `semantic_search` MCP tool: rewrote to query child tables (`stream_items_residential`/`stream_items_commercial`) directly with client-side cosine similarity instead of broken `match_listings` RPC
- Added embedding generation hooks at ingest time: `ingestController.ts` and `channelService.ts` now call `embedStreamItem()` before insert/upsert
- Deployed API, MCP, and www to Coolify (www has BHK fix, intent form, AI description, etc.)

### Current Remote State

- Latest local commits:
  - `9516e1c1` — `Update copy to match simplified Baileys-only connect flow` (pushed)

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
