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

### Dated Handoff: 2026-05-15

This section reflects the state at the end of the current session on 2026-05-15.

### Pushed This Session

- `33185c6` — Route WhatsApp controllers through gateway abstraction

### What `33185c6` Changes

- Introduces a new WhatsApp transport boundary under:
  - `apps/api/src/channel-gateways/whatsapp/types.ts`
  - `apps/api/src/channel-gateways/whatsapp/WhatsAppGateway.ts`
  - `apps/api/src/channel-gateways/whatsapp/BaileysWhatsAppGateway.ts`
  - `apps/api/src/channel-gateways/whatsapp/whatsappGatewayRegistry.ts`
- `whatsappController.ts` no longer talks directly to `SessionManager` for:
  - connect
  - QR refresh
  - QR fetch
  - status
  - disconnect
  - group sync bootstrap
  - direct send
  - bulk direct send
  - group broadcast
- `authController.ts` verification sends now go through the gateway.
- `runtimeStatusService.ts` now reads live WhatsApp session state through the gateway.

### Local Commit Not Yet Pushed

- `348de71` — Fix gateway typing and controller test compatibility

### What `348de71` Changes

- Fixes the gateway broadcast result typing in `BaileysWhatsAppGateway.ts`.
- Fixes `whatsappController.ts` compatibility with existing tests by removing an extra read-after-write expectation and tightening live-session typing.
- Fixes the new `baileysWhatsAppGateway.test.ts` hoisting issue by switching to `vi.hoisted(...)`.

### Current Uncommitted Worktree

- Transport/runtime decoupling continued beyond `33185c6` and `348de71`.
- Modified files:
  - `apps/api/src/controllers/aiController.ts`
  - `apps/api/src/controllers/settingsController.ts`
  - `apps/api/src/services/AgentExecutor.ts`
  - `apps/api/src/services/agentToolService.ts`
  - `apps/api/src/services/whatsappHealthService.ts`
  - `apps/api/src/services/workspaceMonitorService.ts`
  - `apps/api/src/whatsapp/PropAISupabaseAdapter.ts`
  - `apps/api/src/whatsapp/WhatsAppClient.ts`
  - `apps/api/src/whatsapp/propaiRuntimeHooks.ts`
  - `apps/api/tests/agentExecutor.test.ts`
  - `apps/api/tests/agentRouterService.test.ts`
  - `apps/api/tests/aiController.test.ts`
  - `apps/api/tests/whatsappController.test.ts`
- Untracked files:
  - `apps/api/src/channel-events/processors/processWhatsAppGroupSyncEvent.ts`
  - `apps/api/src/channel-events/processors/processWhatsAppInboundMessage.ts`
  - `apps/api/src/channel-events/processors/processWhatsAppSessionEvent.ts`
  - `apps/api/tests/agentToolService.test.ts`
  - `apps/api/tests/propaiSupabaseAdapter.test.ts`
  - `apps/api/tests/settingsController.test.ts`
  - `apps/api/tests/whatsappMessagesController.test.ts`

### What The Uncommitted Work Does

- `agentToolService.ts` no longer imports or uses `SessionManager`; WhatsApp group/send operations now go through `getWhatsAppGateway()`.
- `AgentExecutor.ts` no longer imports `SessionManager`.
- `whatsappHealthService.ts` no longer reads live session snapshots directly from `SessionManager`; it now uses the gateway.
- `propaiRuntimeHooks.ts` has been thinned substantially:
  - `onMessage` now delegates to a shared inbound processor
  - `onConnectionUpdate` now delegates to shared session/group processors
  - direct runtime/session logic has been extracted out of the hook file
- New shared processors were created under `apps/api/src/channel-events/processors/` for:
  - inbound WhatsApp message handling
  - session lifecycle handling
  - group sync handling
- Test updates in progress are focused on stabilizing the new gateway/processor seams rather than fixing all older unrelated suite failures.

### Architecture Status After This Session

- Direct `SessionManager` usage is now mostly limited to:
  - `apps/api/src/index.ts` bootstrap / session rehydration
  - `apps/api/src/channel-gateways/whatsapp/BaileysWhatsAppGateway.ts`
- That means the transport boundary is largely in place for:
  - controller-facing operations
  - outbound tool sends
  - executor-facing transport usage
  - runtime hook delegation
  - health-service live session reads

### Test / Build Status

- The user ran `pnpm --filter backend test:run` and `pnpm --filter backend build` from the normal terminal during this session.
- Result:
  - backend test run: failed
  - backend build: failed at the time of that run
- Some failures were directly caused by the new gateway seam and were fixed during this session:
  - gateway broadcast typing mismatch
  - `baileysWhatsAppGateway.test.ts` hoisting issue
  - `whatsappController.ts` test compatibility issue
- Remaining failures still need a fresh rerun after the latest uncommitted fixes.
- Important: a large portion of the remaining failures are older / unrelated to the gateway refactor:
  - sanitizer behavior expectations
  - Supabase config-dependent suites
  - tests mocking `config/supabase` without `supabaseAdmin` or `serverClientOptions`
  - older async `pushRecentAction` side effects in tests

### Recommended Next Step

- First, rerun from the normal terminal:
  - `pnpm --filter backend build`
  - `pnpm --filter backend test:run`
- Then separate the results into:
  - gateway/processor seam regressions
  - older unrelated suite debt
- After that:
  - commit the uncommitted transport/runtime work
  - push
  - redeploy `apps/api`

### Dated Handoff: 2026-05-17

This section reflects the state at the end of the current session on 2026-05-17.

### Pushed This Session

- `18f9d7b` — Fix group sync bug + schema mismatches + backfill mirror & groups
- `08cf540` — Monitor hides DMs and non-RE groups; classify-groups script
- `e610a19` — DM contact tagging system (realtor/client) + Broker/Client Contacts pages

### What `18f9d7b` Changes

- **WhatsApp group sync was never saving groups**: `scheduleGroupSync()` in `WhatsAppClient.ts` called `getGroups()` but returned without calling `whatsappGroupService.syncGroups()`. Groups were fetched from WhatsApp on every reconnect but never persisted.
- **Schema mismatches fixed**: `whatsapp_groups` was missing 11 columns (`workspace_id`, `session_id`, `normalized_name`, `locality`, `city`, `tags`, `broadcast_enabled`, `is_archived`, `participant_count`, `is_parsing`, `last_message_at`). `whatsapp_message_mirror` was missing 6 columns (`session_label`, `message_key`, `message_type`, `chat_type`, `is_revoked`, `raw_payload`). Both fixed via ALTER TABLE + migration `20260517000001_fix_schema_mismatches.sql`.
- **Backfill scripts**: `scripts/backfill-mirror-and-groups.ts` populated `whatsapp_groups` (62 → 103 groups after sync ran) and `whatsapp_message_mirror` (0 → 1000 rows).
- **Unique index added**: `whatsapp_groups_workspace_group_uidx` on `(workspace_id, group_jid)`.

### What `08cf540` Changes

- **Monitor now hides DMs and non-RE groups**: `workspaceMonitorService.ts` filter drops non-`@g.us` messages entirely and only shows groups with `is_parsing = true`. Empty non-parsing groups also hidden.
- **Group classification script**: `scripts/classify-groups.ts` heuristically checks group names + last 50 messages against real-estate keywords. Marked 21 groups as non-RE (`is_parsing = false`, `category = 'other'`). 112 real estate groups remain. Removed: Diabetics, AI training, Socialise, SFG (x3), Smarties, Aashayein, Tree plantation, General, Test, Healing Together, Ok, macs, Ameet wadhwa, Lunair, unnamed JIDs, etc.
- Constraint note: `whatsapp_groups.category` only allows `'real_estate'`, `'family'`, `'work'`, `'other'`.

### What `e610a19` Changes

- **`dm_contacts` table** (migration `20260517000002_dm_contacts.sql`): stores `tenant_id`, `remote_jid`, `label` (none/realtor/client), `name`, `phone`, `tagged_by`. Unique on `(tenant_id, remote_jid)`.
- **Tag dropdown in Inbox**: every DM chat gets a tag button in the header. Three options: None / 🏠 Realtor / 👤 Client.
- **Broker Contacts page** (`/broker-contacts`): lists DMs tagged as realtor. These feed into the AI parse pipeline + `broker_activity` + wabro broadcast lists.
- **Client Contacts page** (`/client-contacts`): lists DMs tagged as client. **Never parsed** by AI (privacy guaranteed — pipeline explicitly skips them).
- **Pipeline guard**: `PropAISupabaseAdapter.ts` checks `dm_contacts` before parsing DMs. Only `label = 'realtor'` triggers `ingestMessage()`.
- **API endpoints**: `GET /api/intelligence/dm-contacts?label=filter`, `POST /api/intelligence/dm-contacts/tag` with body `{ remoteJid, label, name? }`.
- **Ameet Wadhwa pre-tagged** as realtor in DB for demo.

### Deployed

- Both API and frontend deployed to Coolify.
- Commit `e610a19` on `propai-intel` branch.
- Backend deploy UUID: `mqmn93im5yxzj6vw7l4x2124`
- Frontend deploy UUID: `gsfxqejgztk3dd3yqzslx967`

### Current State

- **Session**: connected (`vishal-ojha-919820056180`)
- **`whatsapp_groups`**: 133 total (112 RE, 21 non-RE)
- **`whatsapp_message_mirror`**: 1,000 rows (backfilled from messages table)
- **`messages` table**: 1,248 rows across 85 unique JIDs (62 groups + 23 DMs)
- **`broker_activity`**: 0 rows (populates forward-only as new DMs come in tagged as realtor)
- **`dm_contacts`**: 1 row (Ameet Wadhwa tagged as realtor)
- **`domain_knowledge`**: 119 entries
- **`flagged_parses`**: empty
- **`public_listings`**: 4 rows (test data)
- **All proxies**: returning 200

### Relevant New Files

- `apps/api/src/controllers/dmContactController.ts` — tag/list endpoints
- `apps/api/src/routes/dmContactRoutes.ts` — route registration
- `apps/api/scripts/classify-groups.ts` — heuristic group classification
- `supabase/migrations/20260517000002_dm_contacts.sql` — table + indexes + RLS
- `apps/app/src/pages/BrokerContacts.tsx` — broker contacts list view
- `apps/app/src/pages/ClientContacts.tsx` — client contacts list view with privacy notice

### Modified Files

- `apps/api/src/services/workspaceMonitorService.ts` — DM + non-RE group filter
- `apps/api/src/whatsapp/PropAISupabaseAdapter.ts` — DM realtor tag check before parsing
- `apps/api/src/index.ts` — dmContactRoutes registration
- `apps/app/src/pages/Inbox.tsx` — tag dropdown in chat header
- `apps/app/src/components/Sidebar.tsx` — Broker Contacts + Client Contacts nav items
- `apps/app/src/App.tsx` — new route registrations
- `apps/app/src/services/endpoints.ts` — dmContacts API endpoints

### Wabro Connection

DM contacts tagged as realtor flow through the parse pipeline → `updateBrokerProfile()` populates `broker_activity` with phone, localities, groups → those contacts can be used for area-specific wabro broadcast lists with minimal ban risk (they DM'd first = opt-in signal).

### Still Pending

- Build real wabro broadcast list from `broker_activity` phone numbers
- Tune confidence thresholds based on broker feedback
- More sophisticated group auto-classification (currently heuristic; user may want to correct some)
