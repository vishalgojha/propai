# PropAI Pulse

PropAI Pulse listens to WhatsApp real estate groups, extracts structured property data with a local Ollama model, stores records in MongoDB or JSONL, and provides a local Studio for review and monitoring.

## Features

- WhatsApp group listener powered by Baileys
- Local Ollama extraction for listings and requirements
- Schema normalization for location, prices, budgets, property type, and confidence
- Duplicate-safe message storage using WhatsApp message IDs
- MongoDB storage with JSONL fallback
- Review statuses: `processed`, `needs_review`, `no_entries`, `extraction_error`
- Queued WhatsApp group replies from Studio, sent by the live listener
- CLI review and summary reports
- Local Agentic Studio with an xterm-powered command console

## Requirements

- Node.js 20+
- Optional: Bun for faster CLI and Studio command startup
- npm
- Ollama running locally
- A pulled Ollama model matching the configured model names
- Optional: MongoDB running locally

Default Ollama endpoint:

```text
http://localhost:11434/api/generate
```

## Setup

```powershell
cd C:\propai-pulse
& npm.cmd install
& npm.cmd link
```

Run tests:

```powershell
pulse test
```

Optional Bun setup:

```powershell
bun --version
```

If Bun is installed, `pulse studio`, `pulse review`, `pulse summary`, and Studio console commands will prefer Bun automatically. `pulse start` stays on Node by default because the WhatsApp listener is the most compatibility-sensitive path.

## Run WhatsApp Listener

```powershell
pulse start
```

On first run, scan the WhatsApp QR code printed in the terminal.

The WhatsApp auth state is stored locally in:

```text
auth_info_baileys/
```

This folder is ignored by Git and must not be committed.

## Run Studio

```powershell
pulse studio
```

Open:

```text
http://localhost:4317
```

Studio includes:

- summary metrics
- review queue
- reply composer for any review card
- optimistic reply queue updates
- recent reply queue and send status
- group health view
- auto-refresh with sync status
- single-request dashboard refresh path
- allowlisted xterm command console

Reply workflow:

- Run the WhatsApp listener with `pulse start`
- Open Studio with `pulse studio`
- Queue a reply from a review card
- The reply appears immediately in the Replies panel
- The live listener sends pending replies when the WhatsApp socket is connected

Studio responsiveness:

- `pulse summary`, `pulse review`, and `pulse errors` run in-process inside Studio
- Dashboard refresh uses one aggregated API call instead of multiple parallel requests
- Auto-refresh runs every 15 seconds and pauses when the tab is hidden
- The header shows sync state and last successful update time

Set a custom port:

```powershell
$env:STUDIO_PORT=4320
pulse studio
```

## Review Commands

Show records needing review:

```powershell
pulse review
```

Show extraction errors:

```powershell
pulse review --status extraction_error
```

Show all recent records:

```powershell
pulse review --all --limit 50
```

Export JSON:

```powershell
pulse review --format json --limit 50
```

Export JSONL:

```powershell
pulse review --format jsonl --limit 50
```

## Summary Commands

```powershell
pulse summary
```

```powershell
pulse summary --format json --limit 100
```

## Storage

PropAI Pulse tries MongoDB first:

```text
mongodb://127.0.0.1:27017
```

Default database and collection:

```text
propai_pulse.messages
```

If MongoDB is unavailable, records are appended to:

```text
data/propulse.jsonl
```

The `data/` folder is ignored by Git because it may contain private leads and phone numbers.

## Configuration

Environment variables:

```text
PULSE_RUNTIME=auto
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=propai_pulse
MONGODB_TIMEOUT_MS=1500
REVIEW_CONFIDENCE_THRESHOLD=0.7
STUDIO_PORT=4317
```

Runtime notes:

- `PULSE_RUNTIME=auto` prefers Bun for utility commands when available
- `PULSE_RUNTIME=node` forces Node everywhere
- `PULSE_RUNTIME=bun` forces Bun for utility commands and errors if Bun is missing
- `pulse start` still uses Node unless you explicitly run the listener another way

## Useful Scripts

```text
pulse start        Run WhatsApp listener
pulse studio       Start local Studio
pulse review       Show review queue
pulse summary      Show extraction health summary
pulse test         Run tests
npm run dev        Run listener with node --watch
```

## Git Safety

Ignored local/private folders:

```text
node_modules/
auth_info_baileys/
data/
.env
.env.*
```

Do not commit WhatsApp auth files, captured WhatsApp data, or environment secrets.

## Deployment

### Hetzner + Coolify

PropAI Pulse is packaged for self-hosted deployment on any server via Coolify.

#### Prerequisites

- [Coolify](https://coolify.io) installed on a Hetzner VPS (or any Linux server)
- MongoDB (can run alongside in Docker Compose or use a managed instance)
- Ollama endpoint accessible from the server (local or remote)

#### Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Node 20 alpine build for the Studio |
| `docker-compose.yml` | Studio + MongoDB stack |
| `coolify.yml` | Coolify one-click deployment config |
| `.dockerignore` | Exclude dev artifacts from Docker build |

#### Deploy Steps

1. Add your Hetzner server to Coolify via SSH
2. Connect your GitHub repo to Coolify
3. Create a new application → choose **Dockerfile** build pack
4. Set the **port** to `4317`
5. Set **health check** path to `/api/health`
6. Add environment variables:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string (optional if using built-in MongoDB) |
| `MONGODB_DB` | Database name (`propai_pulse`) |
| `GOOGLE_API_KEY` | Gemini API key (optional) |

7. Configure persistent storage for `/app/data` and `/app/auth_info_baileys`
8. Deploy

The WhatsApp listener (`pulse start`) runs as a separate process — deploy it on a always-on container or SSH into the server and run `pulse start` in a tmux session.

#### Docker Compose (manual)

```bash
# Studio only
docker compose up -d studio

# Studio + MongoDB
docker compose up -d
```

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `4317` | Studio port |
| `NODE_ENV` | `production` | |
| `PULSE_RUNTIME` | `node` | Runtime for CLI commands |
| `MONGODB_URI` | _(empty)_ | MongoDB connection string |
| `MONGODB_DB` | `propai_pulse` | Database name |
| `GOOGLE_API_KEY` | _(empty)_ | Google Gemini API key |
| `REVIEW_CONFIDENCE_THRESHOLD` | `0.7` | Min confidence for auto-processed |
