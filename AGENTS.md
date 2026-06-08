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

### Completed in This Session

- Fixed embedding backfill: added `POST /api/backfill-embeddings` endpoint and scripts (`backfillEmbeddings.ts`, `backfillBatch.ts`, `backfillSlow.ts`)
- Fixed TypeScript errors in `embeddingService.ts` (cast) and `backfillEmbeddingsController.ts` (record_type select)
- Fixed MCP OAuth FK violation: auto-create missing `mcp_oauth_clients` row in `oauth.ts`
- Fixed `semantic_search` MCP tool: rewrote to query child tables (`stream_items_residential`/`stream_items_commercial`) directly with client-side cosine similarity instead of broken `match_listings` RPC
- Added embedding generation hooks at ingest time: `ingestController.ts` and `channelService.ts` now call `embedStreamItem()` before insert/upsert
- Resolved Ollama stuck state: model `nomic-embed-text` was missing after deploy (persistent volume not surviving redeploy). Recovery: `POST /api/pull` with `nomic-embed-text`
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

## Embedding Service (Ollama)

`semantic_search` (MCP tool) and `semanticSearchListings` (API workflow) depend on a self-hosted Ollama server that produces 768-dim vectors consumed by the `match_listings` pgvector RPC.

- **Coolify project**: `PropAi Pulse` (`cq4v70slt7on9vk2davp6f9q`)
- **Coolify app**: `ollama` (UUID `f60zbro04gyeig7xnkvck0zr`)
- **Endpoint**: `http://116.202.9.89:11434` (env var `HETZNER_EMBED_URL`, defaults match)
- **Model**: `nomic-embed-text` (768-dim, F16, ~274 MB, nomic-bert family)
- **Persistent volume**: `/data/coolify/applications/ollama-data/ollama` → container `/root/.ollama` (host fs_path bind mount, is_directory)
- **Image**: `ollama/ollama:latest` (Dockerfile marker in `apps/ollama/Dockerfile`)
- **Resource limits**: 2 GB RAM, 2 CPU, health check disabled (Ollama has no `GET /health`)
- **Restart**: Coolify default `unless-stopped`

### If Ollama goes down

The API `/health` route now reports `embedding: unreachable|no_model|connected` and flips the overall status to `degraded` (HTTP 503). `semanticSearchListings` automatically falls back to keyword `searchListings` with a `_Note: ... used keyword search instead._` annotation in the reply.

To recover:
1. Coolify UI → PropAI Pulse → `ollama` → check status, redeploy if `exited`
2. If the persistent volume is intact, the model survives — just restart
3. If the model is gone (e.g. volume wiped), exec into the container and run `ollama pull nomic-embed-text` (or call `POST /api/pull` from the host)

### Known Ollama Stability Issues

- After deploy/restart, Ollama must pull `nomic-embed-text` again if volume was wiped (validate via `curl /api/tags`)
- Node.js `fetch` to Ollama from local dev machine may time out while `curl` works — likely a network issue between dev machine and Hetzner
- After ~3-5 consecutive embedding requests, Ollama may hang (timeout on new requests). Recovery: wait ~30s or redeploy container
- Workaround for backfill: use `curl` via `child_process.execSync` instead of `fetch`; batch size of 1 with 1s delay between rows; health check before each batch; 30s wait on failure
- Production API container reaches Ollama fine (same Hetzner network) — only local dev has connectivity issues
- Backfill scripts at `apps/api/src/scripts/backfillBatch.ts` and `backfillSlow.ts` for bulk embedding generation
