#!/usr/bin/env bash
# =========================================
# Connect GitHub → Coolify Auto-Deploy
# =========================================
# This script sets up GitHub secrets so
# every git push redeploys on Coolify.
#
# Prerequisites: gh CLI authenticated
#   gh auth status
#
# You need two values from your Coolify dashboard:
#   1. Deploy Webhook URL
#      Application → Webhooks tab → "Deploy webhook" field
#   2. API Token
#      Settings → Keys & Tokens → API Tokens → Create
#      (enable at least "Deploy" permission)
# =========================================
set -euo pipefail
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }

check_gh() {
  if ! gh auth status &>/dev/null; then
    echo "❌ gh CLI not authenticated. Run: gh auth login"
    exit 1
  fi
}

set_secret() {
  local name="$1"
  local prompt="$2"
  local val
  if [ -n "${!name:-}" ]; then
    info "$name already set (using env)"
    return
  fi
  echo ""
  read -r -p "➡️  $prompt: " val
  if [ -n "$val" ]; then
    echo "$val" | gh secret set "$name"
    info "✅ GitHub secret $name set"
  else
    warn "⚠️  Skipped $name — auto-deploy won't work until set"
  fi
}

main() {
  check_gh

  echo ""
  echo "┌─────────────────────────────────────────────┐"
  echo "│  GitHub → Coolify Auto-Deploy Setup         │"
  echo "│  Repo: vishalgojha/wabro                     │"
  echo "│  Domain: wabro.propai.live                   │"
  echo "│  Coolify: http://116.202.9.89:8000           │"
  echo "└─────────────────────────────────────────────┘"

  set_secret "COOLIFY_WEBHOOK" "Coolify Deploy Webhook URL (from Application → Webhooks)"
  set_secret "COOLIFY_TOKEN" "Coolify API Token (from Settings → Keys & Tokens → API Tokens)"

  echo ""
  info "Done! Secrets configured."
  info "Now every push to main will auto-deploy via GitHub Actions."
  info "Manual trigger: gh workflow run deploy-coolify.yml"
}
main
