# PropAI Sync - Multi-tenant WhatsApp AI for Real Estate

PropAI Sync is a high-performance workspace for real estate brokers to automate WhatsApp lead capture, listing parsing, and client qualification.

## 🏗 Monorepo Structure
- `apps/api`: Node.js + Express + Baileys (The Intelligence Engine)
- `apps/app`: Broker portal app, including inbox, dashboard, leads, onboarding, and settings
- `apps/web`: Client-facing public website and listing pages
- `apps/mcp`: MCP server for read-only listings and intelligence access
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

3. Add Service 2 — Broker App:
   - Type: Dockerfile
   - Repo: this repo
   - Branch: main
   - Dockerfile path: apps/app/Dockerfile
   - Build context: / (repo root)
   - Port: 3000
   - Add broker app env vars via Coolify UI
   - Set NEXT_PUBLIC_API_URL to your backend Coolify domain

4. Add Service 3 — Client Web:
   - Type: Dockerfile
   - Repo: this repo
   - Branch: main
   - Dockerfile path: apps/web/Dockerfile
   - Build context: / (repo root)
   - Port: 3000
   - Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY via Coolify UI

5. Add Service 4 — Browser Automation:
   - Type: Git
   - Repo: https://github.com/vishalgojha/camofox-browser.git
   - Branch: main
   - Port: 9377
   - Attach it to the same Coolify network as the API
   - Manage the browser allowlist from your own `.env` / Coolify variables
   - This powers PropAI's browser agent for portal checks, listing comparisons, and form filling

6. App services auto-deploy on push to main branch
7. SSL handled automatically by Coolify via Let's Encrypt
8. Ollama runs natively on the server — set OLLAMA_BASE_URL to server's internal IP

## 🛠 Local Development
1. Install pnpm: `npm install -g pnpm`
2. Install dependencies: `pnpm install`
3. Run dev environment: `pnpm dev` (via Turborepo)
