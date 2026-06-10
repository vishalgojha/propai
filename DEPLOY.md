# PropAI Pulse — Deployment Guide

## Infrastructure

- **Hosting**: Coolify (self-hosted on Hetzner VPS)
- **Domains**:
  - `app.propai.live` — Broker dashboard (Next.js)
  - `www.propai.live` — Public website (Next.js)
  - `api.propai.live` — Backend API (Express)
  - `mcp.propai.live` — MCP server (Express)
- **Database**: Supabase (PostgreSQL + pgvector)
- **SSL**: Automatic via Coolify (Traefik + Let's Encrypt)

---

## Services Overview

| Service | Directory | Port | Dockerfile | Domain | Type |
|---------|-----------|------|------------|--------|------|
| **API** | `apps/api` | 3001 | `apps/api/Dockerfile` | api.propai.live | Express backend |
| **App** | `apps/app` | 3000 | `apps/app/Dockerfile` | app.propai.live | Next.js dashboard |
| **WWW** | `apps/www` | 3002 | `apps/www/Dockerfile` | www.propai.live | Next.js public site |
| **MCP** | `apps/mcp` | 3003 | `apps/mcp/Dockerfile` | mcp.propai.live | Express MCP server |

All Dockerfiles use the repo root as build context.

---

## Environment Variables

### API (`apps/api`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | HTTP port |
| `SUPABASE_URL` | Yes | — | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | — | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | — | Service role key (bypasses RLS) |
| `JWT_SECRET` | Yes | — | Auth token secret |
| `ENABLE_SYSTEM_WHATSAPP_SESSION` | No | `false` | Auto-start legacy global session |
| `PROPAI_PROCESS_ROLE` | No | `all` | `all` / `api` / `whatsapp` |
| | | | |
| **LLM Providers** | | | |
| `GROQ_API_KEY` | Yes* | — | Primary LLM (recommended primary) |
| `GROQ_BASE_URL` | No | `https://api.groq.com/openai/v1` | — |
| `GROQ_MODEL` | No | `llama3-8b-8192` | — |
| `GEMINI_API_KEY` | No | — | Fallback LLM |
| `GOOGLE_API_KEY` | No | — | Alias for GEMINI_API_KEY |
| `GOOGLE_MODEL` | No | `gemini-2.5-flash` | — |
| `OPENAI_API_KEY` | No | — | OpenAI fallback |
| `OPENROUTER_API_KEY` | No | — | OpenRouter fallback |
| `OPENROUTER_BASE_URL` | No | `https://openrouter.ai/api/v1` | — |
| `OPENROUTER_MODEL` | No | `openai/gpt-4o-mini` | — |
| | | | |
| **Embeddings** | | | |
| `DOUBLEWORD_EMBEDDING_API_KEY` | No | — | Embedding provider (falls back to DOUBLEWORD_API_KEY) |
| `DOUBLEWORD_BASE_URL` | No | `https://api.doubleword.ai/v1` | — |
| `DOUBLEWORD_EMBEDDING_MODEL` | No | `Qwen/Qwen3-Embedding-8B` | 768-dim model |
| `DOUBLEWORD_EMBEDDING_DIMENSIONS` | No | `768` | Vector dimension |
| | | | |
| **Payments** | | | |
| `RAZORPAY_KEY_ID` | No | — | Razorpay payment gateway |
| `RAZORPAY_KEY_SECRET` | No | — | — |
| | | | |
| **Email** | | | |
| `RESEND_API_KEY` | No | — | Resend email provider |
| `EMAIL_FROM` | No | `hello@propai.live` | — |
| | | | |
| **Notifications** | | | |
| `VAPID_PUBLIC_KEY` | No | — | Web push public key |
| `VAPID_PRIVATE_KEY` | No | — | Web push private key |
| `VAPID_EMAIL` | No | `admin@propai.live` | — |
| | | | |
| **Other** | | | |
| `CAMOFOX_URL` | No | `http://camofox:9377` | For IGR scraping |
| `COQUI_TTS_URL` | No | `http://localhost:5002` | Text-to-speech |
| `KAGGLE_USERNAME` | No | — | Kaggle datasets |
| `KAGGLE_API_KEY` | No | — | — |

\* At least one LLM provider key required.

### App (`apps/app`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | Yes | e.g. `https://api.propai.live/api` |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `GEMINI_API_KEY` | No | For AI features in dashboard |
| `VAPID_PUBLIC_KEY` | No | Web push notifications |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | PostHog analytics |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | PostHog host |

Accepts legacy `VITE_*` prefixes as fallbacks for Coolify compatibility.

### WWW (`apps/www`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SITE_URL` | Yes | e.g. `https://www.propai.live` |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | For server-side public listing queries |

### MCP (`apps/mcp`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | — |
| `API_BASE_URL` | No | `https://api.propai.live` |
| `DOUBLEWORD_EMBEDDING_API_KEY` | No | For semantic search |
| `OPENROUTER_API_KEY` | No | For MCP LLM calls |
| `GROQ_API_KEY` | No | Fallback for MCP |
| `JWT_SECRET` | No | For OAuth token verification |

---

## Deployment Procedure

### Initial Setup (one-time)

1. In Coolify, create a project called `PropAI Pulse`.
2. Add each service:
   - **Source**: GitHub repo (`vishalgojha/propai`)
   - **Branch**: `main`
   - **Build pack**: Dockerfile
   - **Build context**: `/` (repo root)
   - **Port**: As listed in the table above
3. Add required env vars per service via Coolify UI.
4. Coolify auto-deploys on push to `main` (default).

### Redeploying After Changes

```bash
git push origin main
```

Then trigger a manual redeploy in Coolify for each affected service, OR visit the Coolify webhook URL if configured.

### Affected Service Map

| Code Changed | Redeploy |
|-------------|----------|
| `apps/api/**` | API |
| `apps/app/**` | App |
| `apps/www/**` | WWW |
| `apps/mcp/**` | MCP |
| `packages/**` | All that depend on it |
| `supabase/migrations/**` | Run migration manually via Supabase dashboard |

---

## Additional Setup Steps

### VAPID Keys

```bash
npx web-push generate-vapid-keys
```

Add to API: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`
Add to App: `VAPID_PUBLIC_KEY`

### Supabase

- Pro Plan or higher required for password leak detection (HaveIBeenPwned)
- Enable via Dashboard → Authentication → Settings

---

## Local Development

```bash
pnpm install
pnpm dev          # Turborepo — runs all services
pnpm --filter backend dev   # API only
pnpm --filter propai-app dev  # App only
```

Requires local `.env` files in each app directory.
