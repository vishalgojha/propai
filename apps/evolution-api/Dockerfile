FROM evoapicloud/evolution-api:latest

RUN apk add --no-cache postgresql

COPY <<"SCRIPT" /entrypoint.sh
#!/bin/bash
set -o pipefail
exec 2>&1

log() { echo "[$(date -Iseconds)] $*"; }

log "=== Evolution API startup ==="

export PGDATA=/data/pg
export PGUSER=postgres
mkdir -p "$PGDATA" /run/postgresql
chown postgres:postgres "$PGDATA" /run/postgresql

if [ ! -f "$PGDATA/PG_VERSION" ]; then
    log "Initializing PostgreSQL..."
    su postgres -c "initdb -D $PGDATA"
fi

echo "listen_addresses = '*'" >> "$PGDATA/postgresql.conf"

log "Starting PostgreSQL..."
su postgres -c "pg_ctl -D $PGDATA -l /tmp/pg.log start"

for i in 1 2 3 4 5 6 7 8 9 10; do
    su postgres -c "pg_isready" && break
    sleep 1
done

log "PostgreSQL is ready"

su postgres -c "psql -c \"CREATE USER evolution WITH PASSWORD 'evolution_pass';\"" 2>/dev/null || true
su postgres -c "psql -c \"CREATE DATABASE evolution OWNER evolution;\"" 2>/dev/null || true

export DATABASE_PROVIDER=postgresql
export DATABASE_CONNECTION_URI="postgresql://evolution:evolution_pass@localhost:5432/evolution"
export DATABASE_ENABLED=true
export DOCKER_ENV=true

log "DATABASE_PROVIDER=$DATABASE_PROVIDER"
log "DATABASE_CONNECTION_URI=$DATABASE_CONNECTION_URI"

cd /evolution

log "Running database deploy..."
if . ./Docker/scripts/deploy_database.sh 2>&1; then
    log "Database deploy SUCCESS"
else
    log "Database deploy FAILED"
    exit 1
fi

log "Starting production server..."
exec npm run start:prod
SCRIPT

ENTRYPOINT ["/bin/bash"]
CMD ["/entrypoint.sh"]
