FROM evoapicloud/evolution-api:latest

RUN echo "BUILD_TIME=$(date -u +%s)" > /build-info.txt

COPY <<"SCRIPT" /entrypoint.sh
#!/bin/bash
set -o pipefail

exec 2>&1

echo "[$(date -Iseconds)] === Evolution API wrapper started ==="
echo "[$(date -Iseconds)] WORKDIR: $(pwd)"
echo "[$(date -Iseconds)] DATABASE_PROVIDER=$DATABASE_PROVIDER"
echo "[$(date -Iseconds)] DATABASE_ENABLED=$DATABASE_ENABLED"
echo "[$(date -Iseconds)] PORT=$PORT"

if [ "$DATABASE_ENABLED" = "true" ] && [ -n "$DATABASE_PROVIDER" ]; then
    echo "[$(date -Iseconds)] Running . ./Docker/scripts/deploy_database.sh..."
    if . ./Docker/scripts/deploy_database.sh; then
        echo "[$(date -Iseconds)] Database deploy SUCCESS"
    else
        rc=$?
        echo "[$(date -Iseconds)] Database deploy FAILED (exit $rc)"
        echo "[$(date -Iseconds)] Starting fallback server on 0.0.0.0:$PORT..."
        node -e "
const fs = require('fs');
require('http').createServer((q, s) => {
  s.writeHead(200, {'Content-Type': 'text/plain'});
  s.end('/tmp/startup.log: ' + (fs.existsSync('/tmp/startup.log') ? fs.readFileSync('/tmp/startup.log','utf8') : 'N/A'));
}).listen(+process.env.PORT||8080, '0.0.0.0');
"
        exit $rc
    fi
fi

echo "[$(date -Iseconds)] Starting production server..."
exec npm run start:prod
SCRIPT

ENTRYPOINT ["/bin/bash"]
CMD ["/entrypoint.sh"]
