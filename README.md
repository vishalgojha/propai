# PropAI Sync - Multi-tenant WhatsApp AI for Real Estate

PropAI Sync is a high-performance workspace for real estate brokers to automate WhatsApp lead capture, listing parsing, and client qualification.

## 🏗 Monorepo Structure
- `apps/api`: Node.js + Express + Baileys (The Intelligence Engine)
- `apps/web`: Next.js + Tailwind + Framer Motion (The Inbox Workspace)
- `packages/database`: Shared Supabase client and types
- `supabase/`: SQL schema and RLS policies

## 🚀 Deployment via Coolify (Hetzner VPS)

This project is designed for a single-VPS deployment managed by Coolify to ensure zero-config SSL, automatic deployments, and isolated networking.

### 1. Server Setup
- Install Coolify on your Ubuntu 24 VPS.
- Ensure Docker is running.

### 2. Coolify Project Configuration
Create a new project in Coolify and add the following three services:

#### A. AI Engine (Ollama + Qwen3)
- **Image**: `ollama/ollama`
- **Volume**: `/root/.ollama`
- **Network**: `propai-network`
- **Port**: `11434`
- **Initial Setup**: Run `ollama pull qwen3:1.7b` via the Coolify terminal or post-deploy script.

#### B. Backend API
- **Source**: GitHub Repository $\rightarrow$ `apps/api`
- **Build**: Dockerfile
- **Env Vars**: 
  - `QWEN_BASE_URL=http://ollama:11434/api/chat`
  - `SUPABASE_URL` & `SUPABASE_ANON_KEY` (from your Supabase project)
- **Network**: `propai-network`

#### C. Frontend Web
- **Source**: GitHub Repository $\rightarrow$ `apps/web`
- **Build**: Dockerfile
- **Env Vars**:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Network**: `propai-network`

### 3. Database Setup
- Run the migrations in `supabase/schema.sql` in your Supabase SQL editor.
- Ensure RLS is enabled for all tables to maintain tenant isolation.

## 🛠 Local Development
1. Install pnpm: `npm install -g pnpm`
2. Install dependencies: `pnpm install`
3. Run dev environment: `pnpm dev` (via Turborepo)
