# PropAI API

Express server (port 3001) — backend for PropAI Pulse.

## Quick Start

```bash
pnpm dev            # API server + Cloud API webhook
pnpm build          # Compile TypeScript
pnpm start          # Run compiled JS
pnpm test:run       # Run tests
```

## Entry Points

| File | Purpose |
|------|---------|
| `src/index.ts` | Main Express API and WhatsApp Cloud API webhook |

## Environment Variables

See `DEPLOY.md` for the full env var reference. Key ones:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | Yes | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | — | Service role key (bypasses RLS) |
| `PORT` | No | `3001` | HTTP port |
| `JWT_SECRET` | Yes | — | Auth token signing |
| `GROQ_API_KEY` | Yes | — | Primary LLM provider |
| `GEMINI_API_KEY` | No | — | Fallback LLM provider |
| `DOUBLEWORD_EMBEDDING_API_KEY` | No | — | Embedding provider |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | No | — | Web push notifications |

---

## Directory Map

```
src/
├── index.ts                 # Server entry point (Express + Cloud API webhook)
├── config/supabase.ts       # Supabase client singleton
│
├── routes/                  # Express route definitions (26 files)
│   ├── routePaths.ts        # Centralised path constants
│   ├── whatsappRoutes.ts    # WhatsApp session management, groups, health
│   ├── channelRoutes.ts     # Channel CRUD, inbox, stream, analytics
│   ├── authRoutes.ts        # Phone OTP, password, referral
│   ├── aiRoutes.ts          # Chat, model listing, usage tracking
│   ├── agentRoutes.ts       # Agent control, tool endpoints
│   ├── adminRoutes.ts       # Workspace admin, backfill triggers
│   ├── ingestRoutes.ts      # Manual listing ingestion
│   ├── streamRoutes.ts      # Stream item read endpoints
│   ├── broadcastRoutes.ts   # Broadcast campaign CRUD + dispatch
│   ├── igrRoutes.ts         # IGR price data routes
│   ├── ...                  # Analytics, settings, files, voice, etc.
│
├── controllers/             # Route handlers (19 files)
│   ├── whatsappController.ts
│   ├── channelController.ts
│   ├── aiController.ts
│   ├── authController.ts
│   ├── agentController.ts
│   ├── adminController.ts
│   ├── ingestController.ts
│   ├── backfillEmbeddingsController.ts
│   ├── ...
│
├── services/                # Business logic (67 modules)
│   ├── channelService.ts    # Core stream ingestion engine (largest file)
│   ├── embeddingService.ts  # Doubleword embedding generation
│   ├── aiService.ts         # LLM routing (Groq → Gemini → fallback)
│   ├── canonicalizationService.ts  # Deduplication engine
│   ├── searchService.ts     # Property search with filters
│   ├── propertySearchService.ts  # AI-powered property search
│   ├── whatsappHealthService.ts   # Session health monitoring
│   ├── runtimeStatusService.ts    # Stream ingestion stall tracking
│   ├── brokerContactSyncService.ts
│   ├── igrEnrichmentService.ts
│   ├── igrLiveFetchService.ts     # Camoufox IGR browser
│   ├── igrBrowserBridgeService.ts # Browser ↔ API bridge
│   ├── notificationService.ts
│   ├── whatsappCloudApiService.ts
│   ├── groupAuditService.ts
│   ├── historyBatchService.ts
│   ├── historySyncWorker.ts
│   ├── correctionService.ts
│   ├── workspaceAccessService.ts
│   ├── subscriptionService.ts
│   ├── ...
│
├── whatsapp/               # Baileys WhatsApp runtime
│   ├── WhatsAppClient.ts   # Per-session socket wrapper (connect, message handling, retry)
│   ├── SessionManager.ts   # Singleton session map, rehydration
│   ├── PropAISupabaseAdapter.ts  # Message persistence + price gate
│   ├── connectionStateMachine.ts
│   ├── authState.ts
│   ├── messageDeduplicator.ts
│
├── channel-events/         # Integration event handlers
│   ├── processors/
│   │   ├── processWhatsAppInboundMessage.ts
│   │   ├── processAgentResponse.ts
│   │   ├── processAgentResponseForBroadcast.ts
│   │   ├── processWorkspaceBroadcast.ts
│   │   ├── processCronFollowUp.ts
│   │   └── processCronMarketSummary.ts
│   └── registry.ts
│
├── channel-gateways/       # Transport-layer gateways (WhatsApp, web, etc.)
│
├── runtime/                # Process orchestration
│   ├── whatsappRuntimeService.ts   # WhatsApp runtime lifecycle
│   ├── backgroundJobService.ts     # Cron-like scheduled jobs
│   └── processRole.ts
│
├── jobs/                   # Background jobs
│   ├── followUpOverdueJob.ts
│   ├── generateMarketInsights.ts
│   ├── igrEnrichmentJob.ts
│   └── syndicationSyncJob.ts
│
├── apis/                   # External API integrations
│   ├── index.ts
│   ├── leads/              # Lead storage
│   ├── property/           # Property search
│   ├── stream/             # Stream access
│   └── waclick/            # WaClick analytics
│
├── intelligence/           # AI pipeline layer
│   ├── IntelligenceAPI.ts
│   └── IntelligenceRouter.ts
│
├── middleware/             # Express middleware
├── schemas/                # Zod validation schemas
├── utils/                  # Shared utilities
├── types/                  # TypeScript type definitions
├── memory/                 # In-memory stores
├── scrapers/               # Web scrapers
├── scripts/                # One-shot data operations (16 scripts)
└── gras/                   # GRAS target map data
```

---

## API Routing Convention

Routes defined in `src/routes/`, each exporting a Router. Handlers live in `src/controllers/`, business logic in `src/services/`. Validation schemas (Zod) in `src/schemas/`.

Example flow:
```
Request → route (routePaths.ts path) → controller (req/res) → service (business logic) → Supabase
```

---

## WhatsApp Runtime

WhatsApp traffic uses the official Meta Cloud API. The API receives Meta webhooks at `POST /api/whatsapp/cloud/webhook`; account onboarding is handled through WABA Embedded Signup at `/api/waba`.

---

## Test

```bash
pnpm test          # watch mode
pnpm test:run      # single run
```
