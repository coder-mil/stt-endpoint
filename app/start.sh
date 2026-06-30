#!/bin/sh
# Entrypoint for the all-in-one image.
#
# Sequence:
#   1. Run prisma migrate deploy (idempotent). If migration fails, do NOT
#      continue — the whole container is broken at that point.
#   2. Wait for STT uvicorn to be ready (auth's startup healthchecks it).
#   3. Tell supervisord to start `auth` and `nginx` programs now.
#   4. supervisord takes over as PID 1 and reaps everything.

set -eu

LOG_PREFIX="entrypoint"

echo "$LOG_PREFIX: running prisma migrate deploy"
cd /opt/auth
# DATABASE_URL is injected by supervisord → program:auth environment, but here we
# run as PID 1 / the entrypoint process. Pull from container env instead.
if [ -z "${DATABASE_URL:-}" ]; then
    export DATABASE_URL="file:/var/lib/auth/prod.db"
fi
# --schema is required because /opt/auth has the prisma/ directory as expected
# by prisma v5. `deploy` is the production-safe variant: applies migrations
# without prompting.
npx --yes prisma migrate deploy --schema /opt/auth/prisma/schema.prisma

echo "$LOG_PREFIX: waiting for STT /ready at 127.0.0.1:8000"
# supervisord program:stt autostarts before this script runs; uvicorn
# usually comes up in 2-5 s. We give it 60 s before giving up.
TRIES=0
MAX=120
until wget -q -O- http://127.0.0.1:8000/ready >/dev/null 2>&1; do
    TRIES=$((TRIES+1))
    if [ "$TRIES" -ge "$MAX" ]; then
        echo "$LOG_PREFIX: STT did not become ready in $((MAX/2))s — bailing out"
        exit 1
    fi
    # Print progress every ~10s so the user sees we're alive.
    if [ $((TRIES % 20)) -eq 0 ]; then
        echo "$LOG_PREFIX: still waiting (${TRIES}/${MAX})"
    fi
    sleep 0.5
done
echo "$LOG_PREFIX: STT ready"

echo "$LOG_PREFIX: starting auth and nginx via supervisorctl"
supervisorctl -c /etc/supervisor/supervisord.conf start auth
supervisorctl -c /etc/supervisor/supervisord.conf start nginx

echo "$LOG_PREFIX: handover to supervisord (PID 1) — exec it"
exec supervisord -c /etc/supervisor/supervisord.conf
