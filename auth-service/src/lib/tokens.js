'use strict';
/**
 * JWT helpers. Two tokens per session:
 *   - access (15 min) — sent on every API call
 *   - refresh (30 d) — exchanged for a new access when expired
 */
const jwt = require('jsonwebtoken');
const env = require('./env');

function signAccess(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, typ: 'access' },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessTtl, algorithm: 'HS256' }
  );
}

function signRefresh(user, jti) {
  return jwt.sign(
    { sub: user.id, jti, typ: 'refresh' },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshTtl, algorithm: 'HS256' }
  );
}

function verifyAccess(token) {
  return jwt.verify(token, env.jwt.accessSecret, { algorithms: ['HS256'] });
}

function verifyRefresh(token) {
  return jwt.verify(token, env.jwt.refreshSecret, { algorithms: ['HS256'] });
}

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh };
