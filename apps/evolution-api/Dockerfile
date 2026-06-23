FROM evoapicloud/evolution-api:latest

USER root
RUN apt-get update -qq && apt-get install -y -qq netcat-openbsd > /dev/null 2>&1

COPY <<"SCRIPT" /entrypoint-wrapper.sh
#!/bin/bash
set -o pipefail

: > /tmp/startup.log
exec 2>&1

log() { echo "[$(date +%T)] $*" | tee -a /tmp/startup.log; }

log "=== Starting Evolution API ==="
log "WORKDIR: $(pwd)"
log "USER: $(whoami)"
log "DATABASE_PROVIDER=$DATABASE_PROVIDER"
log "DATABASE_ENABLED=$DATABASE_ENABLED"
log "PORT=$PORT"

if [ "$DATABASE_ENABLED" = "true" ] && [ -n "$DATABASE_PROVIDER" ]; then
    log "Running: . ./Docker/scripts/deploy_database.sh"
    if . ./Docker/scripts/deploy_database.sh 2>&1 | tee -a /tmp/startup.log; then
        log "Database deploy SUCCESS"
    else
        rc=$?
        log "Database deploy FAILED (exit $rc)"
        log "--- Starting debug server on port $PORT ---"
        while true; do
            { echo -ne "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\n=== STARTUP LOG ===\n"; cat /tmp/startup.log; } | nc -l -p "$PORT" -q 1 2>/dev/null
        done
        exit $rc
    fi
fi

log "Starting production server..."
exec npm run start:prod
SCRIPT

RUN chmod +x /entrypoint-wrapper.sh
ENTRYPOINT ["/bin/bash"]
CMD ["/entrypoint-wrapper.sh"]
