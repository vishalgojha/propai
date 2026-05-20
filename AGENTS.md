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

- User said the latest work has already been pushed.
- New inbox-memory work may still be ahead locally until the next push.
- Treat local `main` as the latest source of truth until a fresh `git fetch` confirms otherwise.

### Current Local Worktree

- Modified files:
  - `apps/app/public/wabro-1.2.0.apk`
  - `apps/app/public/wabro.apk`
  - `apps/wabro-android/app/src/main/java/com/chaoscraft/wablaster/ui/SettingsScreen.kt`
  - `apps/wabro-android/app/src/main/java/com/chaoscraft/wablaster/util/AppUpdateManager.kt`
  - `apps/wabro-android/app/src/main/java/com/chaoscraft/wablaster/util/AuthManager.kt`
  - `supabase/.temp/cli-latest`

### What Was Just Completed

- Inbox governance foundation was built and committed:
  - `1a29c6a1` — `Refocus inbox as private intel workspace`
  - `eed348b8` — `Build inbox governance foundation`
- User-facing terminology now treats the old mirrored `Monitor` surface as deprecated.
- Sidebar label changed from `Threads` to `Inbox`.
- Inbox now has:
  - compact thread list
  - privacy reassurance in the thread header
  - personal outreach CTAs (`Call`, `Open WhatsApp`)
  - server-persisted thread governance states:
    - `allowed`
    - `held`
    - `ignored`
- New architecture doc added:
  - `docs/INBOX_INTELLIGENCE_ARCHITECTURE.md`
- Backend additions:
  - `apps/api/src/services/inboxGovernanceService.ts`
  - `GET /api/whatsapp/inbox/governance`
  - `POST /api/whatsapp/inbox/governance`
- Current persistence path for inbox governance is inside `workspace_settings.settings.inboxIntelligence`
  so the feature is server-owned without introducing new tables yet.
- Inbox memory slice has now been built locally:
  - `apps/api/src/services/inboxMemoryService.ts`
  - `workspaceMonitorService` now derives compact thread intel from recent messages
  - thread intel now persists into `workspace_settings.settings.inboxIntelligence.sessions[sessionKey].memories`
  - selected inbox threads now show:
    - compact thread summary
    - inferred contact role
    - recalled localities
    - budget and property-type signals
    - visibly redesigned split thread workspace

### Operational Rules

- Before pushing, inspect `git status` and verify whether untracked artifacts like APKs or Android app directories are meant for the same commit.
- Prefer selective staging when unrelated work is present.
- Use the user's normal terminal for:
  - `git push`
  - `pnpm build`
  - tests
  - redeploys

### Active Pending Work

- Redeploy affected Coolify services tomorrow after the already-completed push:
  - `apps/api`
  - `apps/app`
- Do a real browser smoke test after redeploy:
  - sidebar shows `Inbox`
  - inbox threads load
  - `allowed / held / ignored` tabs work
  - thread governance actions persist across refresh
  - `Call` and `Open WhatsApp` actions render correctly
- Build the next Inbox intelligence slice:
  - agent tools that join Inbox + Stream
  - proactive matching or follow-up suggestions on top of current thread intel
- Decide separately whether the dirty WaBro/APK files belong to a future commit.

### Handoff Hygiene

- Remove or rewrite this section after pushes and redeploys are completed.
- Do not leave completed tasks listed as pending.
- Keep only current branch context, active worktree state, and truly pending actions here.
- Historical session detail belongs in git history, not in the active handoff.
