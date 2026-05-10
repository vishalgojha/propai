# Repo Notes

- After every completed task, push the relevant git branch/commit so the remote stays current.
- After each push, redeploy the relevant Coolify service for the code you changed:
  - `apps/api` -> backend API service
  - `apps/app` -> frontend app service
  - `apps/www` -> public website service
  - If a task affects multiple deployable surfaces, redeploy each affected Coolify service.

## PropAI Status Handoff

### Already Pushed

- WhatsApp QR flow was stabilized and then refactored to an explicit artifact contract.
  - Backend now returns `artifact: { mode, format: 'text', value }` for WhatsApp connect/QR polling.
  - Frontend `Sources.tsx` renders QR only from raw text via `qrcode`.
  - Earlier local commit mentioned in session: `b9e6419`.
- Concentrate/runtime UI mismatch was fixed and pushed as `6d3c2da`.
  - `concentrate` persists as the saved default model.
  - Agent runtime panel now includes Concentrate and uses backend provider order instead of a hardcoded Gemini-first chain.
  - Settings copy now reflects platform-backed Concentrate credit and optional broker key usage.

### Local Changes Not Yet Pushed

- Web chat stabilization/unification groundwork is in progress in these files:
  - `apps/api/src/controllers/aiController.ts`
  - `apps/api/src/controllers/voiceController.ts`
  - `apps/api/src/services/agentRouterService.ts`
  - `apps/api/src/services/igrQueryService.ts`
  - `apps/app/src/App.tsx`
  - `apps/app/src/components/Layout.tsx`
  - `apps/app/src/components/Sidebar.tsx`
- Current behavior of those local changes:
  - Removed deterministic `/ai/chat` pre-answer branches for product knowledge, browser tooling, IGR, and direct workflow shortcuts.
  - Added routed intents for browser and IGR actions in `agentRouterService`.
  - Added owner/super-admin context to the web-chat system prompt.
  - Improved IGR lookup with fuzzy building/locality token matching.
  - Removed fake demo property-search fallback data; search now returns truthful matches or empty results.
  - Voice endpoints now return explicit `501` disabled responses.
  - Intelligence entry was removed from visible navigation and `/intelligence` redirects to `/agent`.

### Verified Local State

- `git status --short` at handoff time showed these modified files:
  - `apps/api/src/controllers/aiController.ts`
  - `apps/api/src/controllers/voiceController.ts`
  - `apps/api/src/services/agentRouterService.ts`
  - `apps/api/src/services/igrQueryService.ts`
  - `apps/app/Dockerfile`
  - `apps/app/src/App.tsx`
  - `apps/app/src/components/Layout.tsx`
  - `apps/app/src/components/Sidebar.tsx`
  - `pnpm-lock.yaml`
- Do not revert unrelated existing changes in `apps/app/Dockerfile` or `pnpm-lock.yaml` unless explicitly requested.

### Still Pending

- The system still has two agent entrypoints:
  - web chat via `apps/api/src/controllers/aiController.ts`
  - WhatsApp via `apps/api/src/services/AgentExecutor.ts`
- Full unification is still pending:
  - extract one shared orchestration service used by both entrypoints
  - unify tool registry and intent taxonomy
  - remove the WhatsApp-side `TOOL:` parsing loop in favor of the shared routed execution path
  - unify conversation identity/memory keys across web and WhatsApp
  - wire MCP into the live shared tool registry
- Additional cleanup still pending:
  - dead-code audit (`channelServiceV2.ts`, `dataContributionService.ts`, legacy prompt artifacts)
  - decide whether Wabro stays enabled or is gated by schema checks
  - relabel or implement true RERA verification instead of search-based lookup

### Operational Notes

- Codex shell previously used Snap Git without `remote-https`; user machine Git is now fixed (`/usr/bin/git` with `/usr/lib/git-core/git-remote-https` present).
- Use the user's normal terminal for `git push`, builds, tests, and redeploys if Codex shell toolchain remains unreliable.
