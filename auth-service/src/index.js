'use strict';
/**
 * Process entrypoint. Boots Express, listens on PORT.
 */
const env = require('./lib/env');
const log = require('./lib/log');
const { createApp } = require('./app');

const app = createApp();
const server = app.listen(env.server.port, () => {
  log.info('auth_listening', { port: env.server.port, env: env.server.nodeEnv });
});

function shutdown(signal) {
  log.info('shutdown_begin', { signal });
  server.close(() => {
    log.info('shutdown_done');
    process.exit(0);
  });
  // Hard stop after 10s.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
