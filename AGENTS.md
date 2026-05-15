# Repo Notes

- After every completed task, push the relevant git branch/commit so the remote stays current.
- After each push, redeploy the relevant Coolify service for the code you changed:
  - `apps/api` -> backend API service
  - `apps/app` -> frontend app service
  - `apps/www` -> public website service
  - If a task affects multiple deployable surfaces, redeploy each affected Coolify service.

## PropAI Status Handoff

### Dated Handoff: 2026-05-10

This section reflects the state at the end of the current Codex session on 2026-05-10.

### Already Pushed

- `b9e6419`
  - WhatsApp QR flow was stabilized and then refactored to an explicit artifact contract.
  - Backend returns `artifact: { mode, format: 'text', value }` for WhatsApp connect/QR polling.
  - Frontend `Sources.tsx` renders QR only from raw text via `qrcode`.
- `6d3c2da`
  - Concentrate/runtime UI mismatch was fixed.
  - `concentrate` persists as the saved default model.
  - Agent runtime panel includes Concentrate and uses backend provider order instead of a hardcoded Gemini-first chain.
  - Settings copy reflects platform-backed Concentrate credit and optional broker key usage.

### Also Pushed

- `c06309f` with commit message: `Unify Pulse routing and disable broken surfaces`
- Local git now shows both `HEAD` and `origin/main` at `c06309f`.
- The earlier note that this commit was only local is stale.

### What `c06309f` Changes

- Web chat no longer short-circuits into deterministic pre-answers for:
  - product knowledge
  - browser tooling
  - IGR lookup
  - direct workflow shortcuts
- Web chat now routes browser and IGR actions through `agentRouterService` and `executeRoutedToolIntent`.
- Owner/super-admin context is injected into the web-chat system prompt so the app can answer operator/product questions more directly for the owner account.
- IGR lookup now has fuzzy building/locality token matching instead of only brittle literal matching.
- `propertySearch` no longer fabricates demo inventory. It now returns truthful matches from workspace data or an empty result.
- Voice endpoints now return explicit `501` disabled responses instead of pretending to be available.
- Intelligence was removed from visible app navigation and `/intelligence` now redirects to `/agent`.

### Build Verification

- The user ran `pnpm build` from the normal terminal after these changes.
- Build status:
  - `apps/api` build: passed
  - `apps/app` build: passed
  - `apps/mcp` build: passed
  - `apps/web` build: passed
  - `apps/www` build: passed
- Non-blocking warning seen during `apps/www` build:
  - `Missing Supabase public website env vars`
  - This did not fail the build.

### Files Included In `c06309f`

- `AGENTS.md`
- `apps/api/src/controllers/aiController.ts`
- `apps/api/src/controllers/voiceController.ts`
- `apps/api/src/services/agentRouterService.ts`
- `apps/api/src/services/igrQueryService.ts`
- `apps/app/src/App.tsx`
- `apps/app/src/components/Layout.tsx`
- `apps/app/src/components/Sidebar.tsx`

### Local Modifications Still Outside This Commit

- `apps/app/Dockerfile`
- `apps/web/next-env.d.ts`
- `apps/www/next-env.d.ts`
- `pnpm-lock.yaml`
- Do not revert these automatically. Treat them as separate or user-owned changes unless explicitly asked.

### Still Pending

- Confirm or perform redeploy for the affected services after `c06309f`:
  - `apps/api`
  - `apps/app`

### Larger Architecture Still Pending

- The system still has two agent entrypoints:
  - web chat via `apps/api/src/controllers/aiController.ts`
  - WhatsApp via `apps/api/src/services/AgentExecutor.ts`
- Full unification is still pending:
  - extract one shared orchestration service used by both entrypoints
  - unify tool registry and intent taxonomy
  - remove the WhatsApp-side `TOOL:` parsing loop in favor of the shared routed execution path
  - unify conversation identity and memory keys across web and WhatsApp
- wire MCP into the live shared tool registry

### Current Local Worktree After `c06309f`

- Uncommitted work is in progress for the shared agent unification:
  - new `apps/api/src/services/unifiedAgentService.ts`
  - new `apps/api/src/services/agentToolService.ts`
  - refactor of `apps/api/src/controllers/aiController.ts`
  - refactor of `apps/api/src/services/AgentExecutor.ts`
- Direction of this work:
  - route both web chat and WhatsApp broker flows through shared orchestration
  - centralize tool execution in one service
  - reduce duplicated browser/IGR/workflow handling logic

### Additional Cleanup Still Pending

- dead-code audit:
  - `channelServiceV2.ts`
  - `dataContributionService.ts`
  - legacy prompt/agent artifacts
- decide whether Wabro stays enabled or is gated by schema checks
- relabel or implement true RERA verification instead of search-based lookup
- improve structured CRM/listing search beyond naive token overlap

### Dated Handoff: 2026-05-11

This section reflects the state at the end of the current session on 2026-05-11.

### Pushed This Session

- `bb3fd52` — Guard recent_actions with Array.isArray to prevent .map crash on string values; add CONCENTRATE_API_KEY to .env.example

### What `bb3fd52` Changes

- `identityService.ts` `formatRecentActions()` now guards with `Array.isArray()` instead of assuming the input is always an array — prevents `recent.map is not a function` crash if `recent_actions` column returns as a string.
- `identityService.ts` `pushRecentAction()` uses `Array.isArray(raw) ? raw : []` instead of `(x as Type[]) || []` — same defense against string-typed recent_actions.
- `apps/api/.env.example` gains `CONCENTRATE_API_KEY=` entry so the global fallback key is documented alongside other provider keys.

### Also Pushed

- `9e7303c` — Add delayed group sync after WhatsApp connection to fix empty groups on restart
- `0b08749` — Persist AI keys in workspace_settings table (ai_keys jsonb column)

### What `9e7303c` Changes

- `WhatsAppClient.ts` `connection.update` handler now schedules a second `persistStatus('connected')` call 10 seconds after `connection: 'open'` fires.
- This re-triggers the `onConnectionUpdate` hook which calls `client.getGroups()` → `groupFetchAllParticipating()` — giving Baileys time to complete the MD history sync after a resume-mode reconnection.
- Fixes the "0 chats · 0 groups in Monitor despite UPLINK ACTIVE" bug after Coolify restarts.

### What `0b08749` Changes

- Adds `ai_keys jsonb` column to `workspace_settings` table (migration `20260511000001_workspace_ai_keys.sql`, already applied).
- `getWorkspaceSettingsRecord()` now reads `ai_keys` from the DB instead of hardcoding empty strings.
- `saveWorkspaceSettingsRecord()` now upserts `ai_keys` alongside settings to the DB.
- Fixes the "AI keys wiped on restart" bug — previously keys only saved to `data/workspace-settings.json` (container filesystem, wiped on every Coolify redeploy).

### Deployed

- `broker_identity` migration applied.
- `workspace_ai_keys` migration applied.
- Credentials used this session:
  - SUPABASE_URL: `https://mnqkcctegpqxjvgdgakf.supabase.co`
  - Service role key and PAT provided by user, not persisted.

### Bug Status Summary

| Bug | Status | Fix |
|-----|--------|-----|
| Monitor 0 chats/groups after restart | ✅ Fixed in `9e7303c` | Delayed group sync 10s after connection.open |
| `recent.map is not a function` crash | ✅ Fixed in `bb3fd52` | Array.isArray guard in identityService.ts |
| AI keys wiped on restart | ✅ Fixed in `0b08749` + migration | ai_keys column in workspace_settings table |
| Stream 0 items | ✅ Will fix automatically when groups repopulate | Direct consequence of monitor fix |
| IGR web fetch not wired | ⏸️ Already partially wired — local DB + web fallback work. GRAS scraper placeholder needs OCR migration. | Separate feature, not a bug | 

### Still Pending

- **Untracked files not yet pushed:**
  - `supabase/migrations/20260514000001_rls_diagnostic.sql`
  - `supabase/migrations/20260514000003_consolidated.sql`
- Trigger redeploy of backend API service in Coolify — includes all 3 commits (`bb3fd52`, `9e7303c`, `0b08749`) + 2 migrations.
- Fresh signup as broker #1 and test full flow after redeploy.
- Build verification for frontend (`apps/app`) — not yet tested this session.

### Operational Notes

- Codex shell previously used Snap Git without `remote-https`; the user's machine Git is fixed, but Codex still does not see the same system Git path reliably.
- Use the user's normal terminal for:
  - `git push`
  - `pnpm build`
  - tests
  - redeploys
