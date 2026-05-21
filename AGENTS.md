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

- Latest local commits:
  - `0446e200` — `Remove WaBro Android app and port Base44 parser prompts` (pushed)
  - `d7089291` — `Connect group messages to broadcast parser` (pushed)

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

## Manual Supabase Dashboard Steps

- **Leaked Password Protection**: Enable via Supabase Dashboard → Authentication → Settings → toggle "Leaked password protection" ON. One-click, no migration needed.
