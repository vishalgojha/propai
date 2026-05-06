# PropAI - WhatsApp Broadcast Tool

A full-stack WhatsApp broadcast application built with Next.js frontend and Express.js backend using Baileys.

## Features

- **WhatsApp Integration**: Connect via QR code or phone number pairing
- **Bulk Messaging**: Send messages to multiple recipients with human-like delays
- **Multiple Recipient Sources**: Manual numbers, CSV upload, contacts, or groups
- **Rate Limiting**: Configurable speed modes (Fast/Safe/Ultra Safe) to avoid bans
- **Live Progress**: Real-time SSE updates during broadcast
- **Secure**: Password-protected web interface

## Tech Stack

- **Frontend**: Next.js 16+ (App Router), TypeScript, Tailwind CSS, Motion
- **Backend**: Express.js, @whiskeysockets/baileys, QRCode
- **Deployment**: Docker Compose, Coolify, Traefik

## Project Structure

```
propai/
├── frontend/          # Next.js frontend
│   ├── src/
│   ├── public/
│   ├── next.config.ts
│   └── Dockerfile
├── backend/           # Express.js backend
│   ├── server.js
│   ├── sessions/
│   └── Dockerfile
└── docker-compose.yml
```

## Local Development

### Backend
```bash
cd backend
npm install
cp .env.example .env  # Set WABRO_PASSWORD
npm start
```

### Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local  # Configure API URL
npm run dev
```

## Deployment with Coolify

1. Push this repo to GitHub
2. In Coolify, create new resource → Application
3. Select **Docker Compose** build pack
4. Point to `docker-compose.yml`
5. Set environment variable: `WABRO_PASSWORD`
6. Deploy

Traefik will automatically handle HTTPS and routing.

## Environment Variables

### Backend
- `PORT` - Backend port (default: 3001)
- `WABRO_PASSWORD` - Password for web interface

### Frontend
- `NEXT_PUBLIC_API_URL` - Backend API URL (internal: http://backend:3001)
- `PORT` - Frontend port (default: 3000)

## Rate Limits

| Mode | Delay | Break Every | Daily Max |
|------|-------|-------------|-----------|
| Fast | 4-8s | 30 msgs (1min) | 300 |
| Safe | 10-20s | 50 msgs (3min) | 600 |
| Ultra | 20-40s | 50 msgs (5min) | 1000 |
