# PropAI Pulse - Multi-tenant WhatsApp AI for Real Estate

PropAI Pulse is a high-performance workspace for real estate brokers to automate WhatsApp lead capture, listing parsing, and client qualification.

## Monorepo Structure
- `apps/api`: Node.js + Express + Baileys (the backend intelligence engine)
- `apps/app`: React + Vite + Framer Motion (the inbox workspace)
- `apps/www`: Next.js 14 public marketing + listings site
- `packages/agent`: Extension and agent UI/tooling
- `supabase/`: SQL schema and RLS policies

## Deployment (Coolify)

1. In Coolify, create a new project called `PropAI Pulse`.
2. Add Service 1 - Backend API:
   - Type: Dockerfile
   - Repo: this repo
   - Branch: main
   - Dockerfile path: `apps/api/Dockerfile`
   - Build context: `/` (repo root)
   - Port: `3001`
   - Add all env vars from `apps/api/.env.example` via Coolify UI
   - Keep `ENABLE_SYSTEM_WHATSAPP_SESSION=false` unless you explicitly want the legacy global verification session to auto-start
3. Add Service 2 - Frontend:
   - Type: Dockerfile
   - Repo: this repo
   - Branch: main
   - Dockerfile path: `apps/app/Dockerfile`
   - Build context: `/` (repo root)
   - Port: `3000`
   - Add all env vars from `apps/app/.env.example` via Coolify UI
   - Set `VITE_API_BASE_URL` to your backend Coolify domain with `/api` suffix (e.g. `https://api.propai.live/api`)
4. Add Service 3 - Public Website:
   - Type: Dockerfile
   - Repo: this repo
   - Branch: main
   - Dockerfile path: `apps/www/Dockerfile`
   - Build context: `/` (repo root)
   - Port: `3002`
   - Primary domain: `https://www.propai.live`
   - Required env vars:
     - `NEXT_PUBLIC_SITE_URL=https://www.propai.live`
     - `NEXT_PUBLIC_SUPABASE_URL=<your Supabase project URL>`
     - `SUPABASE_SERVICE_ROLE_KEY=<your Supabase service role key>`
   - This service reads public listing data server-side and writes unauthenticated lead captures into Supabase.
5. Apply the public lead capture migration before exposing the public form:
   - `supabase/migrations/20260503030000_add_public_property_leads.sql`
6. Gemini 2.5 Flash is the default AI path.
   - Set `GOOGLE_API_KEY` in the backend service
   - Optionally set `GOOGLE_MODEL=gemini-2.5-flash`
   - Add Groq, OpenRouter, or Doubleword keys only if you want extra fallbacks
   - Multiple keys per provider can be separated with newlines, commas, or semicolons
7. Add the Ollama service only if you still want an optional local provider:
8. All services auto-deploy on push to `main`.
9. SSL is handled automatically by Coolify via Traefik and Let's Encrypt.
10. Groq, OpenRouter, and Doubleword use simple OpenAI-compatible env settings:
   - `GROQ_BASE_URL=https://api.groq.com/openai/v1`
   - `GROQ_MODEL=llama3-8b-8192`
   - `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
   - `OPENROUTER_MODEL=openai/gpt-4o-mini`
   - `DOUBLEWORD_BASE_URL=https://api.doubleword.ai/v1`
   - `DOUBLEWORD_MODEL=qwen3-235b`

## Local Development
1. Install pnpm: `npm install -g pnpm`
2. Install dependencies: `pnpm install`
3. Run dev environment: `pnpm dev` (via Turborepo)

## Broadcast Parser API

PropAI now includes a protected broadcast parsing endpoint for broker WhatsApp blasts:

- `POST /api/broadcast/parse`

It accepts a raw WhatsApp broadcast, asks the AI to split it into actionable lines, classifies each line as a listing or requirement, and saves parsed rows into `public.listings` or `public.requirements`.

### Request body

```json
{
  "message": "*Bandra West:*\n2 BHK Kesar Kripa 3.55Cr\nNeed 3 BHK on rent in Khar West",
  "sender_phone": "919820056789",
  "sender_name": "Ramesh Mehta",
  "tenant_id": "optional-override"
}
```

### Curl example

```bash
curl -X POST "https://api.propai.live/api/broadcast/parse" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \
  -d '{
    "message": "*Bandra West:*\n2 BHK Kesar Kripa 3.55Cr\nNeed 3 BHK on rent in Khar West",
    "sender_phone": "919820056789",
    "sender_name": "Ramesh Mehta"
  }'
```

### Example response

```json
{
  "success": true,
  "total": 2,
  "parsed": 2,
  "skipped_duplicates": 0,
  "failed": 0,
  "ignored_lines": 0,
  "broker": {
    "name": "Ramesh Mehta",
    "phone": "919820056789"
  },
  "items": [
    {
      "text": "Bandra West — 2 BHK Kesar Kripa 3.55Cr",
      "intent": "listing",
      "status": "ok",
      "id": "uuid",
      "error": null
    },
    {
      "text": "Khar West — Need 3 BHK on rent",
      "intent": "requirement",
      "status": "ok",
      "id": "uuid",
      "error": null
    }
  ]
}
```

### Before applying the migration in production

Verify that `public.listings` and `public.requirements` do not already exist with incompatible schemas:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('listings', 'requirements');
```

If this query returns no rows, the migration at [C:\propai-pulse\supabase\migrations\20250001_broadcast_tables.sql](C:\propai-pulse\supabase\migrations\20250001_broadcast_tables.sql) is safe to apply from a naming-conflict perspective.
