# PropAI Pulse - Agent Handoff

## Current Status

Prompt 1 through Prompt 4 are implemented in code.

- Prompt 1: Supabase-backed WhatsApp session persistence
- Prompt 2: `whatsapp_groups` schema compatibility and live migration
- Prompt 3: global stream RLS + Realtime
- Prompt 4: priced-listing gate enforcement before stream persistence

The codebase builds locally after the latest Prompt 4 pass.

## What Was Completed

### 1. WhatsApp sessions now survive redeployments

Baileys auth state was moved off local filesystem storage and into Supabase.

Files:
- [C:\propai-pulse\apps\api\src\whatsapp\SupabaseAuthState.ts](C:\propai-pulse\apps\api\src\whatsapp\SupabaseAuthState.ts)
- [C:\propai-pulse\apps\api\src\whatsapp\WhatsAppClient.ts](C:\propai-pulse\apps\api\src\whatsapp\WhatsAppClient.ts)
- [C:\propai-pulse\apps\api\src\whatsapp\SessionManager.ts](C:\propai-pulse\apps\api\src\whatsapp\SessionManager.ts)
- [C:\propai-pulse\apps\api\src\whatsapp\PropAISupabaseAdapter.ts](C:\propai-pulse\apps\api\src\whatsapp\PropAISupabaseAdapter.ts)
- [C:\propai-pulse\supabase\migrations\20260430022341_whatsapp_session_auth_state.sql](C:\propai-pulse\supabase\migrations\20260430022341_whatsapp_session_auth_state.sql)

Implementation notes:
- `whatsapp_sessions` stores Baileys `creds` and `keys`
- session id is workspace-scoped
- PropAI app code no longer relies on local auth files for session persistence

### 2. `whatsapp_groups` schema error was fixed

The missing `public.whatsapp_groups` table issue was resolved with a compatibility migration and live DB push.

Files:
- [C:\propai-pulse\apps\api\src\services\whatsappGroupService.ts](C:\propai-pulse\apps\api\src\services\whatsappGroupService.ts)
- [C:\propai-pulse\supabase\migrations\20260430023506_whatsapp_groups_schema_compat.sql](C:\propai-pulse\supabase\migrations\20260430023506_whatsapp_groups_schema_compat.sql)
- [C:\propai-pulse\supabase\migrations\20250001_broadcast_tables.sql](C:\propai-pulse\supabase\migrations\20250001_broadcast_tables.sql)

Live DB note:
- remote migration history was repaired
- `supabase db push --linked --include-all --yes` succeeded

### 3. Global stream is live

`stream_items` now supports cross-workspace global visibility through RLS and Realtime.

Files:
- [C:\propai-pulse\apps\api\src\controllers\channelController.ts](C:\propai-pulse\apps\api\src\controllers\channelController.ts)
- [C:\propai-pulse\apps\api\src\services\channelService.ts](C:\propai-pulse\apps\api\src\services\channelService.ts)
- [C:\propai-pulse\apps\app\src\pages\Listings.tsx](C:\propai-pulse\apps\app\src\pages\Listings.tsx)
- [C:\propai-pulse\apps\app\src\services\supabaseBrowser.ts](C:\propai-pulse\apps\app\src\services\supabaseBrowser.ts)
- [C:\propai-pulse\supabase\migrations\20260430024130_global_stream_rls.sql](C:\propai-pulse\supabase\migrations\20260430024130_global_stream_rls.sql)

Behavior:
- brokers can always read their own workspace rows
- paid active brokers can also read rows where `is_global = true`
- Realtime is enabled on `public.stream_items`

### 4. Prompt 4 price gate enforcement is now in place

Inbound listing-like messages must have a real price before they can persist into `stream_items`.

Files:
- [C:\propai-pulse\apps\api\src\whatsapp\PropAISupabaseAdapter.ts](C:\propai-pulse\apps\api\src\whatsapp\PropAISupabaseAdapter.ts)
- [C:\propai-pulse\apps\api\src\services\channelService.ts](C:\propai-pulse\apps\api\src\services\channelService.ts)

Current gate behavior:
- buyer requirements can still pass without price
- listing-like messages without a clear price fail closed
- gate AI failure also fails closed
- parsed listing candidates only persist if they have a real numeric price

This closes both layers:
- message-level gate in `PropAISupabaseAdapter`
- item-level persistence gate in `channelService`

### 5. Self-chat routing changed

Self-chat detection was moved away from the earlier strict `fromMe` dependency and now uses bot JID comparison.

File:
- [C:\propai-pulse\apps\api\src\whatsapp\propaiRuntimeHooks.ts](C:\propai-pulse\apps\api\src\whatsapp\propaiRuntimeHooks.ts)

### 6. Multi-session WhatsApp control work was added

The app now has shared active-session context and session-aware view filtering.

Files:
- [C:\propai-pulse\apps\app\src\components\Layout.tsx](C:\propai-pulse\apps\app\src\components\Layout.tsx)
- [C:\propai-pulse\apps\app\src\components\Sidebar.tsx](C:\propai-pulse\apps\app\src\components\Sidebar.tsx)
- [C:\propai-pulse\apps\app\src\pages\Sources.tsx](C:\propai-pulse\apps\app\src\pages\Sources.tsx)
- [C:\propai-pulse\apps\app\src\pages\Listings.tsx](C:\propai-pulse\apps\app\src\pages\Listings.tsx)
- [C:\propai-pulse\apps\app\src\pages\Monitor.tsx](C:\propai-pulse\apps\app\src\pages\Monitor.tsx)
- [C:\propai-pulse\apps\app\src\pages\Inbox.tsx](C:\propai-pulse\apps\app\src\pages\Inbox.tsx)
- [C:\propai-pulse\apps\api\src\controllers\whatsappController.ts](C:\propai-pulse\apps\api\src\controllers\whatsappController.ts)
- [C:\propai-pulse\apps\api\src\services\workspaceMonitorService.ts](C:\propai-pulse\apps\api\src\services\workspaceMonitorService.ts)

### 7. Monitor / Inbox / Team pages were added

Files:
- [C:\propai-pulse\apps\app\src\pages\Monitor.tsx](C:\propai-pulse\apps\app\src\pages\Monitor.tsx)
- [C:\propai-pulse\apps\app\src\pages\Inbox.tsx](C:\propai-pulse\apps\app\src\pages\Inbox.tsx)
- [C:\propai-pulse\apps\app\src\pages\Team.tsx](C:\propai-pulse\apps\app\src\pages\Team.tsx)
- [C:\propai-pulse\supabase\migrations\20260429211000_add_workspace_team_and_activity.sql](C:\propai-pulse\supabase\migrations\20260429211000_add_workspace_team_and_activity.sql)

### 8. Admin tab and owner/super-admin recognition were added

Files:
- [C:\propai-pulse\apps\app\src\pages\Admin.tsx](C:\propai-pulse\apps\app\src\pages\Admin.tsx)
- [C:\propai-pulse\apps\api\src\controllers\adminController.ts](C:\propai-pulse\apps\api\src\controllers\adminController.ts)
- [C:\propai-pulse\apps\api\src\routes\adminRoutes.ts](C:\propai-pulse\apps\api\src\routes\adminRoutes.ts)

## Important Corrections To Older Handoffs

The following older claims are not accurate and should not be reused:

1. "Regex completely removed"
- false
- regex still exists in multiple backend files

2. "No more modals in Stream"
- false
- Stream still has modal/detail interaction in the current UI

3. "All four prompts are production-complete and fully verified"
- overstated
- the code and migrations are in place, but several live smoke tests are still pending

4. "Global stream routes to all personal channels across all workspaces"
- inaccurate wording
- global visibility is via `is_global` + RLS
- personal channel routing remains workspace scoped

## Current Pipeline

### Inbound listing / requirement flow

1. inbound WhatsApp message
2. save to `raw_dump`
3. price gate in [PropAISupabaseAdapter.ts](C:\propai-pulse\apps\api\src\whatsapp\PropAISupabaseAdapter.ts)
4. if allowed, save message record
5. AI-first parse in [channelService.ts](C:\propai-pulse\apps\api\src\services\channelService.ts)
6. only persist:
- requirements
- priced listings
7. set `is_global` automatically when:
- `price_numeric` is present and greater than `0`
- `confidence_score > 0.6`
8. route to workspace channels
9. expose global rows cross-workspace through RLS for paid brokers

### Self-chat flow

1. inbound self-chat message
2. [propaiRuntimeHooks.ts](C:\propai-pulse\apps\api\src\whatsapp\propaiRuntimeHooks.ts)
3. detect self-chat via JID comparison
4. route to agent executor
5. return assistant response through the matched session

## Pending Work

### Critical live verification

1. Redeploy latest API and web
- `propai-api`
- `propai-web`

2. Verify session persistence end to end
- connect WhatsApp once
- redeploy
- confirm no QR is required again

3. Verify Prompt 4 price gate live
- listing without price should not persist into `stream_items`
- requirement without price should still parse
- priced listing should parse and continue

4. Verify global stream live with two workspaces
- no-price listing must remain private
- priced confident listing must appear in another paid workspace
- realtime arrival must be confirmed in browser

### WhatsApp / session behavior

5. Verify self-chat in production
- current code changed
- live confirmation still needed

6. Verify assistant lane for `7021054254`
- routing logic changed
- live send/receive still needed

7. Verify multi-device connect UX
- second number QR path
- active number dropdown
- disconnect behavior

### Monitor / Inbox / view behavior

8. Verify Monitor and Inbox in production
- especially after schema compatibility fixes
- confirm fallback behavior is not masking real endpoint issues

9. Improve direct-message session attribution
- best next step is persisting `session_label` on each saved message row
- current direct-message session filtering is still limited by existing message metadata

### Parser quality

10. Tune AI parse quality on real broker samples
- building/project extraction
- road/landmark inheritance
- price interpretation edge cases
- multi-listing broker blast segmentation

### Mobile / UX follow-up

11. Re-check mobile channel visibility
- recent sidebar scroll fixes were added
- still needs real device validation

## Environment / Deployment Notes

Backend should be built and redeployed from the current `main` branch after:
- `c7f43a2` Prompt 1 session persistence
- `5cd360a` Prompt 2 whatsapp_groups compatibility
- `6af8558` Prompt 3 global stream RLS
- `3f7b981` Prompt 4 price gate enforcement

## Latest Key Commits

1. `c7f43a2` `feat: persist whatsapp auth state in supabase`
2. `5cd360a` `fix: add whatsapp groups schema compatibility`
3. `6af8558` `feat: add global stream access and realtime`
4. `3f7b981` `fix: enforce priced listing gate before global stream`

## Recommended Next Order

1. redeploy `propai-api`
2. redeploy `propai-web`
3. run the live verification checklist:
- session persistence
- self-chat
- assistant lane
- second-number QR flow
- Monitor
- Inbox
- no-price listing rejection
- priced listing acceptance
- global stream cross-workspace realtime
4. then tune parser quality using failing real broker examples

---

Status:
- Prompts 1 to 4 are implemented
- local backend build is green
- remaining work is primarily live validation and parser-quality refinement
