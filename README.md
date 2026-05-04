# PropAI Sync - Multi-tenant WhatsApp AI for Real Estate

PropAI Sync is a high-performance workspace for real estate brokers to automate WhatsApp lead capture, listing parsing, and client qualification.

## 🏗 Monorepo Structure
- `apps/api`: Node.js + Express + Baileys (The Intelligence Engine)
- `apps/web`: Next.js + Tailwind + Framer Motion (The Inbox Workspace)
- `packages/database`: Shared Supabase client and types
- `supabase/`: SQL schema and RLS policies

## Deployment (Coolify)

1. In Coolify, create a new Project called 'PropAI Sync'
2. Add Service 1 — Backend API:
   - Type: Dockerfile
   - Repo: this repo
   - Branch: main
   - Dockerfile path: apps/api/Dockerfile
   - Build context: / (repo root)
   - Port: 3001
   - Add all env vars from apps/api/.env.example via Coolify UI

3. Add Service 2 — Frontend:
   - Type: Dockerfile
   - Repo: this repo
   - Branch: main
   - Dockerfile path: apps/web/Dockerfile
   - Build context: / (repo root)
   - Port: 3000
   - Add all env vars from apps/web/.env.example via Coolify UI
   - Set NEXT_PUBLIC_API_URL to your backend Coolify domain

4. Both services auto-deploy on push to main branch
5. SSL handled automatically by Coolify via Let's Encrypt
6. Ollama runs natively on the server — set OLLAMA_BASE_URL to server's internal IP

## 🛠 Local Development
1. Install pnpm: `npm install -g pnpm`
2. Install dependencies: `pnpm install`
3. Run dev environment: `pnpm dev` (via Turborepo)
