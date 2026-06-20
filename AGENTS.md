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

- **Fixed api_keys RLS and NVIDIA key sync** — RLS policy was `ALL ... USING` (blocking INSERT), now proper per-command policies. Added DB trigger to auto-sync `workspace_settings.ai_keys` → `api_keys`. Fixed `saveKey()` error logic (returned silent success on file-write-only failure).
- **Fixed stream read paths (zero results bug)** — Two breaks found after Jun 9 wipe migration:
  1. `match_listings`/`market_stats` RPCs queried `stream_items` (empty parent table) instead of child tables (`stream_items_residential`/`commercial`) which have 21k+ rows. Rewrote both to UNION ALL child tables.
  2. `public_listings` remained empty despite 18k accepted items — schema columns missing, RLS blocking. Added all required columns, RLS policies (public read, service_role write), sync trigger from child tables, and backfill.
  3. Added sync trigger: child table INSERT/UPDATE → auto-inserts into `stream_items` parent.
- **Added NVIDIA Nemotron provider** — Full integration across `aiService.ts`, `aiUsageService.ts`, `keyService.ts`, `settingsController.ts`, `workspaceSettingsService.ts`, `Settings.tsx`, `Agent.tsx`, `ProviderLogo.tsx`.
- **Removed Groq from defaults/UI** — Taken out of default fallback chain and settings UI.
- **Fixed configuration/BHK column** — `mapStreamItem` returns `configuration`, DB upsert writes `configuration`, `sanitizeBuildingNameCandidate` backstop prevents area values becoming building names.
- **Updated NVIDIA to DeepSeek V4 Flash with reasoning** — Default model changed to `deepseek-ai/deepseek-v4-flash`, added `chat_template_kwargs: { thinking: true }` to enable thinking, extract `reasoning_content`/`reasoning` from response. Added proper NVIDIA SVG logo.
- **Gated Cloud API webhook** — Added `CLOUD_API_WEBHOOK_ENABLED` flag (disabled by default) to stop duplicate "AI provider unavailable" replies from deprecated Cloud API integration.
- **Fixed WABA JSON response + duplicate replies** — Rewrote `cleanWhatsAppReply` in both `AgentExecutor.ts` and `conversationEngineService.ts` to properly extract text from all JSON formats (code fences, bare JSON, escaped quotes, nested AgentResponse). Added message-level dedup (`Set<messageId>`) in Cloud API webhook handler to prevent duplicate replies from webhook retries.
- **Added WABA typing indicator + admin phone detection** — Typing indicator via Meta Cloud API before processing messages. `OWNER_SUPER_ADMIN_PHONES` set with `9820056180` and `7021045254`. `isOwnerSuperAdminPhone()` for admin detection.
- **Added PropAI founder context to system prompt** — Vishal Ojha as founder, super admin numbers, website/email info in Pulse prompt.
- **Removed IGR standalone page** — `/igr` route, view, and API service deleted. IGR transaction display preserved on listing cards.
- **Added WABA image upload support** — `extractText()` includes captions for image/video/document media. New helpers: `getMediaInfo()`, `getMediaDownloadUrl()`, `downloadMediaBuffer()`, `ensureMediaBucket()`, `storeIncomingMedia()` download from Meta API → upload to Supabase `waba-media` bucket → create `workspace_files` record.
- **Added image collection flow to Pulse prompt** — `pulseChatPrompt.ts` updated: Pulse offers to collect photos after parsing a listing, guides user to send photos, says "done" when finished, acknowledges each photo.
- **Fixed www BHK duplicate** — `ListingCard.tsx` removed `features.push(configurationLabel)` (BHK was rendered twice).
- **Fixed www price overflow** — `format.ts` added sanity caps: rent > ₹10Cr or sale > ₹1000Cr returns "Price on Request".
- **Added WhatsApp activation-code linking flow** — New DB table `whatsapp_activation_codes`, `activationCodeService.ts` (generate/validate/activate/link), webhook detects `PROP-XXXXXXXX` codes and short-circuits to activation, 24-hour window check in `sendTextMessage()`, API route `POST /api/whatsapp/cloud/activation-code`.
- **Added ref_no (visible ID) for listings/requirements** — Migration `20260621000001_add_ref_no.sql`: sequences `listing_ref_seq`/`requirement_ref_seq`, `ref_no text` column on child tables + parent + `public_listings`, before-insert trigger auto-generates `L-0001`/`R-0001` format, updated `sync_stream_item_to_parent()` function, backfill for existing records. www: `PublicListing.ref_no`, shown in `ListingCard`/`ListingDetail`. App: `StreamItem.refNo`, shown in `ListingCard`. Pulse prompt updated to include ref_no in match replies.

### Current Remote State

- Latest local commits:
  - `e0a91477` — `Fix JSON response and duplicate reply bugs in WABA webhook` (pushed)
  - `216df01d` — `Gate Cloud API webhook handler behind CLOUD_API_WEBHOOK_ENABLED flag` (pushed)
  - `ab6aa2c8` — `Update NVIDIA to DeepSeek V4 Flash with thinking/reasoning extraction` (pushed)
  - `0032a019` — `Add NVIDIA Nemotron provider, remove Groq, fix configuration column empty bug` (pushed)

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
