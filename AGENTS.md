# PropAI Pulse — Company & Platform Context

**PropAI Pulse** is an AI-powered real estate platform for Indian brokers, built by **Vishal Ojha**.
- **Website**: propai.live
- **Founder**: Vishal Ojha — 15+ years of real estate brokerage experience in Mumbai/India.
- **Platform**: AI-driven WhatsApp ingestion, parsing, matching, and CRM for real estate brokers.

# Repo Notes

- After every completed task, push the relevant git branch/commit so the remote stays current.
- After each push, redeploy the relevant Coolify service for the code you changed:
  - `apps/api` -> backend API service
  - `apps/app` -> frontend app service
  - `apps/www` -> public website service
  - If a task affects multiple deployable surfaces, redeploy each affected Coolify service.

## Critical Single-Session Rule

- Treat the main PropAI WhatsApp runtime in `apps/api` as the single owner of any live Baileys/linked-device session.
- Do not add, run, revive, or deploy a second Baileys socket for the same WhatsApp number from any surface.
- Multiple session owners cause WhatsApp `conflict type="replaced"` disconnects.

## PropAI Status Handoff

### Current Branch

- Canonical branch: `main`
- Current local branch should be treated as the source of truth unless the user explicitly says otherwise.

### Pending Actions

- **propai-gras fix**: Live IGR fetch (`/api/igr/fetch`) times out on government portal (`igrmaharashtra.gov.in`). Needs Camoufox-based browser navigation instead of direct HTTP fetch. Full prompt at `.agents/prompts/propai-gras.md`.
- **official-whatsapp-cloud-migration**: Retire/delete the current linked-device WhatsApp number before onboarding the official Meta Cloud API number. Do not migrate Cloud API onto the same live Baileys owner session.

### Backfill Status

- Embeddings now use Google `gemini-embedding-001` at 768 dimensions.
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
  - `da10cea6` — `Add resilient backfill scripts, fix TS errors in embedding pipeline` (pushed)

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

## Embedding Service (Google)

`semantic_search` (MCP tool) and `semanticSearchListings` (API workflow) use Google `gemini-embedding-001` with `output_dimensionality: 768`, consumed by the existing 768-dim pgvector columns and `match_listings` RPC.

- Set `GOOGLE_API_KEY` or `GEMINI_API_KEY` on backend and MCP services.
- Optional model override: `GOOGLE_EMBEDDING_MODEL=gemini-embedding-001`
- Listing/document vectors use `RETRIEVAL_DOCUMENT`; user search prompts use `RETRIEVAL_QUERY`.
- The API `/health` route reports `embedding: connected|unreachable` and flips overall status to `degraded` (HTTP 503) when embeddings are unavailable.
