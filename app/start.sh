#!/bin/sh
# Entrypoint for the all-in-one image.
#
# Boot order (this script is PID 1):
#
#   1. Run Prisma migrations.
#   2. Start supervisord in the background — its `program:stt` has
#      autostart=true and uvicorn comes up in 2-5s.
#   3. Wait for STT to answer HTTP 200 at /ready.
#   4. Issue supervisorctl start for `auth` (needs STT) and `nginx`
#      (needs auth for /health proxy).
#   5. Wait on supervisord (it traps SIGTERM inside its own config).
#
# When the orchestrator (Easypanel/Docker) sends SIGTERM to PID 1, we forward
# it to the supervisord child so it can shut down programs in order.

set -eu

LOG_PREFIX="entrypoint"

# ---------------------------------------------------------- 1. migrations ----------
echo "$LOG_PREFIX: running prisma migrate deploy"
cd /opt/auth
if [ -z "${DATABASE_URL:-}" ]; then
    export DATABASE_URL="file:/var/lib/auth/prod.db"
fi
npx --yes prisma migrate deploy --schema /opt/auth/prisma/schema.prisma

# ---------------------------------------------------------- 2. start supervisord ---
echo "$LOG_PREFIX: starting supervisord (program:stt autostarts immediately)"
supervisord -c /etc/supervisor/supervisord.conf &
SUPERVISORD_PID=$!

# Forward SIGTERM/SIGINT to supervisord so the whole stack shuts down cleanly
# when the orchestrator stops the container.
trap 'kill -TERM "$SUPERVISORD_PID" 2>/dev/null || true; exit 143' TERM INT

# ---------------------------------------------------------- 3. wait STT ready ------
echo "$LOG_PREFIX: waiting for STT /ready at 127.0.0.1:8000 (max 120s)"
TRIES=0
MAX=240       # 240 × 0.5s = 120s
until curl -fsS -o /dev/null http://127.0.0.1:8000/ready 2>/dev/null; do
    TRIES=$((TRIES+1))
    if ! kill -0 "$SUPERVISORD_PID" 2>/dev/null; then
        echo "$LOG_PREFIX: supervisord exited unexpectedly — bailing out"
        exit 1
    fi
    if [ "$TRIES" -ge "$MAX" ]; then
        echo "$LOG_PREFIX: STT did not become ready in 120s — bailing out"
        exit 1
    fi
    if [ $((TRIES % 20)) -eq 0 ]; then
        echo "$LOG_PREFIX: still waiting (${TRIES}/${MAX})"
    fi
    sleep 0.5
done
echo "$LOG_PREFIX: STT ready"

# ---------------------------------------------------------- 4. start auth + nginx --
echo "$LOG_PREFIX: starting auth and nginx via supervisorctl"
supervisorctl -c /etc/supervisor/supervisord.conf start auth
supervisorctl -c /etc/supervisor/supervisord.conf start nginx

# ---------------------------------------------------------- 5. wait ----------------
echo "$LOG_PREFIX: handing over — waiting on supervisord (PID $SUPERVISORD_PID)"
wait "$SUPERVISORD_PID"
EXIT_CODE=$?
echo "$LOG_PREFIX: supervisord exited with $EXIT_CODE"
exit "$EXIT_CODE"
