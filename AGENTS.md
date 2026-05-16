# Repo Notes

- After every completed task, push the relevant git branch/commit so the remote stays current.
- After each push, redeploy the relevant Coolify service for the code you changed:
  - `apps/api` -> backend API service
  - `apps/app` -> frontend app service
  - `apps/www` -> public website service
  - If a task affects multiple deployable surfaces, redeploy each affected Coolify service.

## PropAI Status Handoff

### Current Branch

- Canonical branch: `main`
- Current local branch should be treated as the source of truth unless the user explicitly says otherwise.
- Do not assume old `propai-intel` notes are still operational.

### Current Remote State

- At review time, `HEAD`, `origin/main`, and `origin/HEAD` point to:
  - `177003a` — `Add public_listings upsert to real-time ingestion pipeline + backfill script`

### Current Local Worktree

- Modified files:
  - `apps/api/src/controllers/whatsappController.ts`
  - `apps/api/src/routes/routePaths.ts`
  - `apps/api/src/routes/whatsappRoutes.ts`
  - `apps/api/src/services/workspaceMonitorService.ts`
  - `apps/app/src/pages/Monitor.tsx`
  - `apps/app/src/services/endpoints.ts`
- Untracked files:
  - `apps/app/public/wabro.apk`
  - `apps/wabro-android/`

### What The Current Uncommitted Work Does

- Monitor is being moved away from the transient mirror-first model.
- Backend monitor overview now reads from persisted workspace message history instead of the live mirror path.
- A dedicated lazy thread-history endpoint is being introduced for Monitor:
  - `GET /whatsapp/monitor/messages`
- Frontend Monitor is being refactored to:
  - use `/whatsapp/monitor` for the chat list / overview
  - lazy-load thread history per selected chat
  - page older messages on demand instead of relying on a hard global message cap
  - treat Monitor as a workspace-history console, not a post-QR debug mirror
- Additional untracked WaBro artifacts are present and intended for commit only if the user confirms they belong in the current push:
  - `apps/app/public/wabro.apk`
  - `apps/wabro-android/`

### Operational Rules

- Before pushing, inspect `git status` and verify whether untracked artifacts like APKs or Android app directories are meant for the same commit.
- Prefer selective staging when unrelated work is present.
- Use the user's normal terminal for:
  - `git push`
  - `pnpm build`
  - tests
  - redeploys

### Active Pending Work

- Finish validating the current Monitor refactor on `main`.
- Commit and push the Monitor changes if they are approved as ready.
- Commit and push `apps/app/public/wabro.apk` and `apps/wabro-android/` only if they are intentionally part of the current delivery.
- Redeploy affected Coolify services after push:
  - `apps/api`
  - `apps/app`

### Handoff Hygiene

- Remove or rewrite this section after pushes and redeploys are completed.
- Do not leave completed tasks listed as pending.
- Keep only current branch context, active worktree state, and truly pending actions here.
- Historical session detail belongs in git history, not in the active handoff.
