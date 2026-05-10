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

### Operational Notes

- Codex shell previously used Snap Git without `remote-https`; the user's machine Git is fixed, but Codex still does not see the same system Git path reliably.
- Use the user's normal terminal for:
  - `git push`
  - `pnpm build`
  - tests
  - redeploys
