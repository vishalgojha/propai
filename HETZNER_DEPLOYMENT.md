==========
PROPAI PULSE - HETZNER DEPLOYMENT GUIDE
==========
Created: 2026-05-01
Last Updated: 2026-05-01 14:45
Status: Code pushed to GitHub ✅, Ready to deploy!

==========
1. SSH KEY FOR HETZNER
==========
Public Key (add to Hetzner server):
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJL5C56BQV4DNzDXA7Bod5ByFMbbSHte7AYgEzfSOo9Q vishal@chaoscraftlabs.com

==========
2. ADD KEY TO HETZNER (Run on your Hetzner server)
==========
mkdir -p ~/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJL5C56BQV4DNzDXA7Bod5ByFMbbSHte7AYgEzfSOo9Q vishal@chaoscraftlabs.com" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys

==========
3. DEPLOYMENT (I'll do this once key is added)
==========
# Hetzner Server IP: 116.202.9.89 ✅

# Once you give me the IP, I'll run:
ssh root@116.202.9.89
cd /opt
git clone git@github.com:vishalgojha/propai.git
cd propai
cp .env.example .env
nano .env  # Add your actual API keys
docker-compose up -d

==========
4. ENVIRONMENT VARIABLES (from .env.example)
==========
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GOOGLE_API_KEY=your_google_api_key
GROQ_API_KEY=your_groq_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
JWT_SECRET=your_jwt_secret
WHATSAPP_SESSION_SECRET=your_session_secret
DOMAIN=your_domain_or_ip
API_URL=https://your_domain_or_ip:3001

==========
5. ACCESS AFTER DEPLOYMENT
==========
- PropAI App: http://116.202.9.89:3000
- PropAI API: http://116.202.9.89:3001
- Analytics: http://116.202.9.89:3000/analytics

==========
6. WHAT'S ALREADY DONE ✅
==========
- GitHub push: 6 commits pushed (09789d0 is latest)
- Circuit breaker: Auto-retry after WhatsApp failures
- Exponential backoff: 2s → 30s reconnection
- Health monitoring: /api/whatsapp/health/detailed
- Live analytics: /analytics page with charts
- Force refresh QR: POST /api/whatsapp/qr/force-refresh
- Docker configs: docker-compose.yml + Dockerfiles
- Build passing: npm run build ✅

==========
7. SSH KEY SETUP SCRIPT
==========
Download and run this script on your Hetzner server:

curl -O https://raw.githubusercontent.com/vishalgojha/propai/main/ADD_SSH_KEY_HETZNER.sh
bash ADD_SSH_KEY_HETZNER.sh

Or manually:
mkdir -p ~/.ssh && echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJL5C56BQV4DNzDXA7Bod5ByFMbbSHte7AYgEzfSOo9Q vishal@chaoscraftlabs.com" >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys && echo "SUCCESS: Key added!"

==========
8. NEXT STEPS
==========
1. Add SSH key (copy from section 1, run on Hetzner)
2. Tell me: "Key added"
3. I'll deploy automatically to 116.202.9.89!

Your move: 
1. Copy Section 1 key → Add to Hetzner
2. Say "Key added"
3. I'll deploy PropAI Pulse!

==========
END OF GUIDE
==========
