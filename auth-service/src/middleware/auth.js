'use strict';
/**
 * Authentication middleware.
 * Reads the access JWT from:
 *   1) Authorization: Bearer <token>  (preferred for API clients)
 *   2) cookie `access_token`         (used by the React frontend)
 */
const { verifyAccess } = require('../lib/tokens');

function getToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  if (req.cookies && req.cookies.access_token) return req.cookies.access_token;
  return null;
}

function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'no token' });
  }
  try {
    const payload = verifyAccess(token);
    if (payload.typ !== 'access') throw new Error('wrong token type');
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized', message: err.message });
  }
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'forbidden', message: 'role mismatch' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, getToken };
