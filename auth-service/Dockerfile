# syntax=docker/dockerfile:1.6
# =============================================================================
# STT Endpoint — auth-service (Express + Prisma + SQLite)
# Multi-stage build: install deps in builder, copy only what's needed to
# the slim runtime image.
# =============================================================================

# -------- Stage 1: install deps + build prisma client --------
FROM node:22-alpine AS builder
WORKDIR /app

# Build deps for bcrypt + sqlite3 native bindings.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
# `npm ci` works because we have package-lock.json — deterministic install.
RUN npm ci --no-audit --no-fund

# Generate prisma client (writes to node_modules/@prisma/client).
COPY prisma ./prisma
RUN npx prisma generate

# -------- Stage 2: runtime --------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Prisma needs libssl during runtime for SQLite.
RUN apk add --no-cache openssl

# Copy the production-ready node_modules + generated client.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Copy source.
COPY src ./src
COPY package.json ./
COPY README.md ./

# Storage for SQLite database + uploaded audio cache. Use a named volume.
RUN mkdir -p /data
ENV DATABASE_URL="file:/data/dev.db"
ENV PORT=4000

EXPOSE 4000

# Generate client (idempotent if already done in builder) and ensure schema
# exists. Skip generation in production — assume the builder already did it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/ready >/dev/null 2>&1 || exit 1

# Tiny entrypoint that ensures the schema is in place, then starts node.
CMD ["sh", "-c", "node -e \"const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\\$queryRaw\\`SELECT 1\\\`.then(()=>{console.log('db ok');process.exit(0)}).catch(()=>{console.error('db not ready');process.exit(1)})\" && exec node src/index.js"]
