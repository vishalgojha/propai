#!/usr/bin/env bash
# =========================================
# WaBro V2 — Coolify / Hetzner Deploy
# =========================================
set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ──────────── Config ────────────
REPO="git@github.com:vishalgojha/wabro.git"
BRANCH="main"
DOMAIN="wabro.propai.live"
SERVER_PORT=8000

# ──────────── Prerequisites ────────────
check_deps() {
  for cmd in git docker curl; do
    if ! command -v "$cmd" &>/dev/null; then
      error "$cmd is required but not installed."
    fi
  done
  info "All dependencies found."
}

# ──────────── Coolify Deploy ────────────
deploy_coolify() {
  info "Pushing latest code to GitHub..."
  git push origin "$BRANCH"

  info "Coolify auto-deploys on push to origin/$BRANCH"
  info "Assuming Coolify webhook is configured:"
  info "  Repo: vishalgojha/wabro"
  info "  Branch: $BRANCH"
  info "  Dockerfile: Dockerfile"
  info "  Domain: $DOMAIN"
  info "  Port: $SERVER_PORT"
  echo ""
  info "Go to Coolify dashboard → Deployment → Deploy"
}

# ──────────── Manual Docker Deploy ────────────
deploy_manual() {
  local tag="wabro-landing:latest"

  info "Building Docker image..."
  docker build -t "$tag" -f Dockerfile .

  info "Removing old container (if any)..."
  docker rm -f wabro-landing 2>/dev/null || true

  info "Starting new container..."
  docker run -d \
    --name wabro-landing \
    --restart unless-stopped \
    -p "${PORT:-${SERVER_PORT}}:${SERVER_PORT}" \
    -e SERVER_PORT="${PORT:-${SERVER_PORT}}" \
    -e TZ=Asia/Kolkata \
    "$tag"

  info "Container started. Check logs with: docker logs -f wabro-landing"
}

# ──────────── Full Stack Deploy ────────────
deploy_stack() {
  info "Deploying full stack via docker-compose..."
  docker compose up -d --build
  info "Stack deployed. Check status: docker compose ps"
}

# ──────────── Health Check ────────────
health_check() {
  local url="http://localhost:${PORT:-${SERVER_PORT}}/"
  info "Checking health at $url ..."
  if curl -sf "$url" >/dev/null 2>&1; then
    info "Landing page is UP ($url)"
  else
    error "Landing page is DOWN ($url)"
  fi
}

# ──────────── Main ────────────
main() {
  check_deps

  case "${1:-help}" in
    coolify)
      deploy_coolify
      ;;
    manual)
      deploy_manual
      health_check
      ;;
    stack)
      deploy_stack
      health_check
      ;;
    health)
      health_check
      ;;
    logs)
      docker logs -f wabro-landing
      ;;
    *)
      echo ""
      echo "WaBro V2 — Coolify/Hetzner Deploy Script"
      echo ""
      echo "Usage:"
      echo "  ./scripts/deploy.sh coolify    Push to GitHub → Coolify auto-deploys"
      echo "  ./scripts/deploy.sh manual     Build & run Docker locally"
      echo "  ./scripts/deploy.sh stack      Deploy full stack (docker-compose)"
      echo "  ./scripts/deploy.sh health     Check if landing page is up"
      echo "  ./scripts/deploy.sh logs       Tail container logs"
      echo ""
      ;;
  esac
}

main "$@"
