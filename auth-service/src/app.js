'use strict';
/**
 * Express application factory. Returns the app so tests can spin it up
 * with supertest without binding to a port.
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');

const env = require('./lib/env');
const log = require('./lib/log');
const prisma = require('./lib/prisma');
const { mintHandler, requireCsrf } = require('./middleware/csrf');
const { purgeExpired } = require('./middleware/rateLimit');
const authRoutes = require('./routes/auth');
const txRoutes = require('./routes/transcriptions');
const swaggerSpec = require('./lib/swagger');

function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  // Behind HTTPS proxy: serve via http so cookies still honor 'secure' flag.
  app.use(helmet());
  app.use(express.json({ limit: '128kb' }));
  app.use(cookieParser());

  // CORS: allow-all when configured; otherwise enforce allow-list.
  if (env.cors.origins.length === 0) {
    app.use(cors({ credentials: true, origin: true }));
  } else {
    app.use(
      cors({
        credentials: true,
        origin: (origin, cb) => {
          if (!origin || env.cors.origins.includes(origin)) return cb(null, true);
          return cb(new Error('cors_denied'));
        },
      })
    );
  }

  // ---- Docs & spec ----
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/openapi.json', (_req, res) => res.json(swaggerSpec));

  // ---- Health ----
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'ok' });
    } catch (e) {
      res.status(503).json({ status: 'degraded', error: e.message });
    }
  });

  // ---- CSRF mint endpoint (sets cookie, returns token) ----
  app.get('/csrf-mint', mintHandler);
  // All non-GET routes require matching X-CSRF-Token.
  app.use(requireCsrf);

  // ---- Auth routes ----
  app.use('/auth', authRoutes);
  app.use('/api', txRoutes);

  // ---- 404 + error handlers ----
  app.use((req, res) => res.status(404).json({ error: 'not_found' }));
  app.use((err, req, res, _next) => {
    log.error('server_error', { error: err.message, stack: err.stack });
    if (res.headersSent) return;
    res.status(500).json({ error: 'internal_error' });
  });

  // Best-effort cleanup.
  const cleanup = () => purgeExpired().catch(() => {});
  cleanup();
  const cleanupInterval = setInterval(cleanup, 60_000);
  if (typeof cleanupInterval.unref === 'function') cleanupInterval.unref();

  return app;
}

module.exports = { createApp };
