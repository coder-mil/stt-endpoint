'use strict';
/**
 * Double-submit cookie CSRF middleware.
 *
 * Strategy:
 *   - GET /csrf-mint: returns a token AND sets cookie `csrf_token` (NOT httpOnly).
 *   - All non-GET routes require either an `X-CSRF-Token` header that matches
 *     the cookie, OR (for server-rendered) the same value in body/form.
 *
 * Safe for cross-origin if SameSite=lax (default) but we require explicit
 * opt-in via X-CSRF-Token header.
 */
const crypto = require('crypto');
const env = require('../lib/env');

function mintToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function mintHandler(req, res) {
  const token = mintToken();
  res.cookie('csrf_token', token, {
    httpOnly: false, // must be JS-readable so the SPA can echo it
    secure: env.cookies.secure,
    sameSite: env.cookies.sameSite,
    domain: env.cookies.domain,
    path: '/',
    maxAge: 12 * 60 * 60 * 1000, // 12h
  });
  res.json({ csrfToken: token });
}

function requireCsrf(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  const fromCookie = req.cookies && req.cookies.csrf_token;
  const fromHeader = req.headers['x-csrf-token'];
  if (!fromCookie || !fromHeader) {
    return res.status(403).json({ error: 'csrf_missing' });
  }
  // Constant-time compare
  const a = Buffer.from(fromCookie);
  const b = Buffer.from(fromHeader);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'csrf_mismatch' });
  }
  next();
}

module.exports = { mintHandler, requireCsrf, mintToken };
