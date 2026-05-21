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

### Current Remote State

- Latest local commits on `main` were not pushed from this environment because `git push` is blocked here by `ssh` execution permissions.
- Most recent local commits:
  - `d7089291` — `Connect group messages to broadcast parser`
  - `89de9a5a` — `Make agent chat capabilities production ready`
- Treat local `main` as the latest source of truth until the next successful push or a fresh `git fetch` proves otherwise.

### Operational Rules

- Prefer selective staging when unrelated work is present.
- Use the user's normal terminal for:
  - `git push`
  - `pnpm build`
  - tests
  - redeploys

### Handoff Hygiene

- Do not leave completed tasks listed as pending.
- Keep only current branch context, active worktree state, and truly pending actions here.
- Historical session detail belongs in git history, not in the active handoff.
