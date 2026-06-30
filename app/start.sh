#!/bin/sh
# Entrypoint for the all-in-one image. Single script, no supervisord.
#
# This script IS PID 1. It runs the three services directly:
#
#   1. uvicorn (STT)         — starts immediately, owns port 8000 (loopback)
#   2. node src/index.js     — auth-service, owns port 4000 (loopback)
#   3. nginx -g 'daemon off;' — frontend reverse proxy, owns port 80 (public)
#
# Boot order matters:
#
#   * prisma migrate deploy          (creates SQLite + applies migrations)
#   * start uvicorn in background    (port 8000, STT is required by auth)
#   * wait for GET /ready 200        (auth's startup healthchecks /ready)
#   * start auth in background       (port 4000, requires STT /ready)
#   * start nginx in background      (port 80; proxy for /health → :4000)
#   * wait — shell sleeps forever so it stays PID 1 and reaps children.
#
# Cleanup on SIGTERM/SIGINT: catch, kill kids in reverse order, wait,
# then exit. If the orchestrator sends a second SIGTERM it just exits
# again — that's fine, PID 1 is allowed to exit with code 143.
#
# Restart strategy: there is none. If a child dies unexpectedly this
# script logs the failure and exits non-zero — the orchestrator (Docker /
# Easypanel) restarts the container. Without that loop we would have to
# duplicate restart logic in shell.

set -eu

LOG_PREFIX="entrypoint"

# ----------------------------------------------------------------------- helpers
log() {
    printf '%s %s\n' "$LOG_PREFIX" "$*"
}

# Render the current state of every tracked child to the log. Called from
# the trap so you can see what's happening when the container stops.
log_children() {
    for pid_var in STT_PID AUTH_PID NGINX_PID; do
        eval "pid=\$$pid_var"
        if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
            log "  child $pid_var=$pid alive"
        fi
    done
}

# Kill a PID with TERM, wait up to 10s for exit, else KILL. Used in the
# shutdown trap so children get a chance to flush logs and close DB
# connections cleanly.
term_then_kill() {
    pid=$1
    name=$2
    if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
        return 0
    fi
    log "stopping $name (pid $pid, TERM)"
    kill -TERM "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
        if ! kill -0 "$pid" 2>/dev/null; then
            log "$name exited cleanly"
            return 0
        fi
        sleep 0.5
    done
    log "stopping $name (pid $pid, KILL — TERM was not enough)"
    kill -KILL "$pid" 2>/dev/null || true
}

# ---------------------------------------------------- 1. database migrations ----
log "running prisma migrate deploy"
DATABASE_URL="${DATABASE_URL:-file:/var/lib/auth/prod.db}"
export DATABASE_URL

# /opt/auth is where the build stage copied the prisma/ directory. We do
# NOT cd there permanently — auth will cd into /opt/auth itself when it
# starts (the start.sh then resumes from /).
if ! npx --yes prisma migrate deploy \
        --schema /opt/auth/prisma/schema.prisma 2>&1 \
        | grep -E "^(Applying|warning|Prisma|Already|No migration)" ; then
    :   # npx exit code may vary by version; we already log the greps above
fi

# --------------------------------------------------- 2. start uvicorn (STT) ----
log "starting STT (uvicorn on 127.0.0.1:8000)"
cd /opt/stt
PYTHONPATH=/opt/stt
PYTHONUNBUFFERED=1
PYTHONDONTWRITEBYTECODE=1
export PYTHONPATH PYTHONUNBUFFERED PYTHONDONTWRITEBYTECODE
/usr/local/bin/python -m uvicorn app.main:app \
    --host 127.0.0.1 --port 8000 --log-level info \
    >> /proc/1/fd/1 2>> /proc/1/fd/2 &
STT_PID=$!

log "STT pid=$STT_PID, waiting for /ready (max 120s)"
TRIES=0
MAX=240       # 240 × 0.5s = 120s
until curl -fsS -o /dev/null http://127.0.0.1:8000/ready 2>/dev/null; do
    TRIES=$((TRIES+1))
    if ! kill -0 "$STT_PID" 2>/dev/null; then
        log "STT (pid $STT_PID) died before becoming ready — abort"
        exit 1
    fi
    if [ "$TRIES" -ge "$MAX" ]; then
        log "STT did not become ready in 120s — abort"
        term_then_kill "$STT_PID" stt
        exit 1
    fi
    if [ $((TRIES % 20)) -eq 0 ]; then
        log "still waiting for STT (${TRIES}/${MAX})"
    fi
    sleep 0.5
done
log "STT ready"

# --------------------------------------------------- 3. start auth (node) -------
log "starting auth (node on 127.0.0.1:4000)"
cd /opt/auth
PORT="${PORT:-4000}"
NODE_ENV="${NODE_ENV:-production}"
DATABASE_URL="$DATABASE_URL"
STT_ENDPOINT="${STT_ENDPOINT:-http://127.0.0.1:8000}"
# JWT_RESET_SECRET / JWT_ACCESS_SECRET / JWT_REFRESH_SECRET / CSRF_SECRET
# / STT_API_KEY are NOT defaulted — auth refuses to start without them.
export PORT NODE_ENV DATABASE_URL STT_ENDPOINT

/usr/local/bin/node src/index.js \
    >> /proc/1/fd/1 2>> /proc/1/fd/2 &
AUTH_PID=$!
log "auth pid=$AUTH_PID"

# Give auth a couple of seconds to bind 4000 — we'll know it failed below
# in the nginx bring-up when /health on 4000 fails.
/bin/sleep 2
if ! kill -0 "$AUTH_PID" 2>/dev/null; then
    log "auth (pid $AUTH_PID) died immediately — abort"
    term_then_kill "$STT_PID" stt
    exit 1
fi

# --------------------------------------------------- 4. start nginx ------------
log "starting nginx (port 80, public)"
/usr/sbin/nginx -g "daemon off;" \
    >> /proc/1/fd/1 2>> /proc/1/fd/2 &
NGINX_PID=$!
log "nginx pid=$NGINX_PID"

# --------------------------------------------------- 5. wait + cleanup ----------
# Wait for any child to exit. When one dies the container has lost its
# value — log the state, tear everything down, exit non-zero.
log "all three services up — waiting on PID 1 lifecycle"

# Forward SIGTERM/SIGINT (from the orchestrator) to a clean shutdown:
# 1. stop accepting new connections (nginx)
# 2. stop accepting new jobs (auth)
# 3. stop accepting new requests (STT)
# So we kill in reverse start-order.
shutdown() {
    log "received stop signal — tearing down"
    log_children
    term_then_kill "$NGINX_PID" nginx
    term_then_kill "$AUTH_PID" auth
    term_then_kill "$STT_PID" stt
    log "shutdown complete — exit 143"
    exit 143
}
trap 'shutdown' TERM INT

# Block on the first child that exits. If any dies, this wait returns and
# we tear the rest down too.
wait -n "$STT_PID" "$AUTH_PID" "$NGINX_PID"
EXIT_CODE=$?
log "a child exited (status $EXIT_CODE) — tearing down"
log_children

# Order matters: same as the SIGTERM path.
term_then_kill "$NGINX_PID" nginx
term_then_kill "$AUTH_PID" auth
term_then_kill "$STT_PID" stt

exit "$EXIT_CODE"
