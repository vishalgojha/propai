# Changelog

## [0.2.0] - 2026-05-11

### Removed
- Dead page: `apps/app/src/pages/Intelligence.tsx` (unreferenced, route redirected to /agent)
- Dead page: `apps/app/src/pages/Messages.tsx` (unreferenced prototype)
- Dead page: `apps/app/src/pages/HomeSearch.tsx` (unreferenced prototype)
- Dead service: `apps/api/src/services/channelServiceV2.ts` (unreferenced)
- Dead service: `apps/api/src/services/dataContributionService.ts` (unreferenced, Kaggle export never operational)
- Dead test: `apps/api/tests/dataContributionService.test.ts`

### Added
- `apps/api/src/services/attachmentContextService.ts` — extracted from aiController
- `apps/api/src/services/structuredToolService.ts` — extracted from aiController
- `apps/api/src/services/analyticsService.ts` — extracted from channelController
- `apps/api/src/services/propertySearchService.ts` — extracted from aiController
- `apps/api/src/schemas/adminSchemas.ts` — Zod validation
- `apps/api/src/schemas/authSchemas.ts` — Zod validation
- `apps/api/src/middleware/validate.ts` — Zod validation middleware
- `apps/api/src/types/express.ts` — global Express Request augmentation
- `apps/api/src/utils/controllerHelpers.ts` — shared error/helper utilities
- Workspace profile card on Dashboard showing agency name, city, service areas
- History import result summary card (listings/leads/failed counts + link to Stream)
- Inbound WhatsApp messages now persisted to `messages` table (Monitor fix)
- 4s auto-polling on Monitor page with live indicator

### Changed
- `aiController.ts` — removed inline functions, delegated to extracted services
- `channelController.ts` — delegates analytics to `analyticsService`
- `adminController.ts` — all `any` eliminated (strict TypeScript)
- `whatsappController.ts` — all `any` eliminated
- `wabroController.ts` — all `any` eliminated
- `workspaceController.ts` — all `any` eliminated
- `historyController.ts` — fixed `(req as any).user`, typed catch blocks
- `adminRoutes.ts` — Zod validation wired
- `authRoutes.ts` — Zod validation wired
- `getBrokerProfile()` now queries `workspaces.agency_name` alongside `profiles`
- Agent system prompt now includes `Agency: {name}` in broker identity
- Monitor page auto-refreshes every 4s (tab-aware)

### Fixed
- Production Docker build failure (added `--ignore-scripts`)
- Dashboard data persistence (localStorage stale-while-revalidate)
- Silent stream item drop (persist all AI-parsed items)
- Supabase security definer views (migration applied)
- Monitor showing no data (inbound messages now written to `messages` table)

## [0.1.0] - legacy

Initial PropAI Pulse platform.
