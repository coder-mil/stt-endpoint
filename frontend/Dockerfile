# syntax=docker/dockerfile:1.6
# =============================================================================
# STT Endpoint — frontend (React + Vite, served by nginx)
# Multi-stage build keeps the runtime image minimal.
# =============================================================================

# -------- Stage 1: build the static bundle --------
FROM node:22-alpine AS builder
WORKDIR /app

# Install deps separately for cache friendliness.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Inject the production API base into Vite at build time.
# Override with --build-arg VITE_API_BASE=/api if you front the auth service
# behind an nginx location.
ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE

COPY . .
RUN npm run build

# -------- Stage 2: serve via nginx --------
FROM nginx:1.27-alpine AS runtime

# Strip the default config.
RUN rm /etc/nginx/conf.d/default.conf

# Custom nginx config — SPA fallback + reverse-proxy to auth-service.
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Static assets from the build.
COPY --from=builder /app/dist /usr/share/nginx/html

# Healthcheck (used by compose to gate downstream).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80/ >/dev/null 2>&1 || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
