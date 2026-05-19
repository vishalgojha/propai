# Repo Notes

- After every completed task, push the relevant git branch/commit so the remote stays current.
- After each push, redeploy the relevant Coolify service for the code you changed:
  - `apps/api` -> backend API service
  - `apps/app` -> frontend app service
  - `apps/www` -> public website service
  - If a task affects multiple deployable surfaces, redeploy each affected Coolify service.

## Critical WaBro Rule

- Treat the main PropAI WhatsApp runtime in `apps/api` as the single owner of any live Baileys/linked-device session.
- Do not add, run, revive, or deploy a second Baileys socket for the same WhatsApp number from WaBro or any other surface.
- In particular, do not use `apps/wabro-backend/baileys.js` as a second live session owner for a number that is already connected through `apps/api`.
- If WaBro needs WhatsApp capabilities, route them through the shared `apps/api` / `/api/wabro` path and the existing workspace session model instead of opening another linked-device session.
- If an AI agent touches WaBro and is unsure whether a change could create another WhatsApp session owner, stop and verify before shipping. Multiple session owners cause WhatsApp `conflict type="replaced"` disconnects.

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

- Monitor now uses persisted workspace message history as the source of truth.
- A dedicated lazy thread-history endpoint is being introduced for Monitor:
  - `GET /whatsapp/monitor/messages`
- Frontend Monitor is being refactored to:
  - use `/whatsapp/monitor` for the chat list / overview
  - lazy-load thread history per selected chat
  - page older messages on demand instead of relying on a hard global message cap
  - treat Monitor as a workspace-history console
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
