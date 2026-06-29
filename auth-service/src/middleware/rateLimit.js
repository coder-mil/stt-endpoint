'use strict';
/**
 * Persistent rate limiter (survives restart).
 * Buckets are stored in the RateLimitBucket table and auto-expire.
 *
 * Express middleware factory:
 *   const limiter = createRateLimiter({ windowMin, max, routeName });
 *   app.use('/login', limiter, loginHandler);
 */

const prisma = require('../lib/prisma');

function routeKey(req) {
  return `${req.baseUrl || ''}${req.path || ''}`;
}

function createRateLimiter({ windowMin = 15, max = 100, routeName = 'global' } = {}) {
  return async function rateLimit(req, res, next) {
    try {
      const ip =
        req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        'unknown';
      const minuteStart =
        Math.floor(Date.now() / 60000) * 60000; // aligned minute
      const id = `${routeName}:${ip}:${minuteStart}`;
      const expiresAt = new Date(minuteStart + windowMin * 60 * 1000);

      // Increment-or-create in one upsert.
      const bucket = await prisma.rateLimitBucket.upsert({
        where: { id },
        create: { id, count: 1, resetAt: expiresAt },
        update: { count: { increment: 1 } },
      });

      const remaining = Math.max(0, max - bucket.count);
      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(remaining));

      if (bucket.count > max) {
        const retryAfterSec = Math.max(
          1,
          Math.ceil((expiresAt.getTime() - Date.now()) / 1000)
        );
        res.set('Retry-After', String(retryAfterSec));
        return res
          .status(429)
          .json({ error: 'rate_limited', retryAfter: retryAfterSec });
      }
      next();
    } catch (err) {
      // Fail-open: don't block users on a transient DB hiccup. Log it.
      req.log?.('warn', { event: 'rate_limit_db_error', error: err.message });
      next();
    }
  };
}

async function purgeExpired() {
  await prisma.rateLimitBucket
    .deleteMany({ where: { resetAt: { lt: new Date() } } })
    .catch(() => {});
}

if (require.main === module) {
  // standalone cron: node middleware/rateLimit.js
  setInterval(purgeExpired, 5 * 60 * 1000);
  purgeExpired();
  // Keep alive
}

module.exports = { createRateLimiter, purgeExpired };
