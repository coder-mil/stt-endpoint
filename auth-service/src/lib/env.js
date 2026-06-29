/**
 * Centralized, validated environment loader.
 * Throws on startup if a critical value is missing (better than runtime errors).
 */
'use strict';

const path = require('path');
const fs = require('fs');

const envFile = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envFile)) {
  // Load synchronously; side-effect only.
  require('dotenv').config({ path: envFile });
}

function required(name) {
  const v = process.env[name];
  if (!v || v.startsWith('replace')) {
    throw new Error(
      `Missing or placeholder value for required env var ${name}. ` +
        `Copy .env.example to ${envFile} and fill it in.`
    );
  }
  return v;
}

function intEnv(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Env ${name} must be an integer`);
  return n;
}

const env = {
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: process.env.JWT_REFRESH_SECRET || required('JWT_ACCESS_SECRET'),
    accessTtl: intEnv('JWT_ACCESS_TTL', 900),
    refreshTtl: intEnv('JWT_REFRESH_TTL', 2_592_000),
  },
  csrf: {
    secret: required('CSRF_SECRET'),
  },
  cookies: {
    secure: process.env.COOKIE_SECURE === 'true',
    domain: process.env.COOKIE_DOMAIN || undefined,
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
  },
  server: {
    port: intEnv('PORT', 4000),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  stt: {
    endpoint: process.env.STT_ENDPOINT || 'http://localhost:8000',
    apiKey: process.env.STT_API_KEY || '',
  },
  cors: {
    origins: (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  rateLimit: {
    windowMin: intEnv('RATE_LIMIT_WINDOW_MIN', 15),
    max: intEnv('RATE_LIMIT_MAX', 100),
  },
  reset: {
    ttlMin: intEnv('RESET_TOKEN_TTL_MIN', 30),
    out: process.env.RESET_DELIVERY || 'log', // "log" | "webhook"
    webhook: process.env.RESET_WEBHOOK_URL || '',
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = env;
