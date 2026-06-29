'use strict';
/**
 * Authentication routes: register, login, logout, refresh, me,
 * forgot-password, reset-password.
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const prisma = require('../lib/prisma');
const env = require('../lib/env');
const log = require('../lib/log');
const { signAccess, signRefresh, verifyRefresh } = require('../lib/tokens');
const { requireAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { mintToken } = require('../middleware/csrf');
const { issueReset, consumeReset } = require('../lib/reset');

const router = express.Router();

const authLimiter = createRateLimiter({
  windowMin: 15,
  max: 10,
  routeName: 'auth',
});

const REFRESH_COOKIE = 'refresh_token';
const ACCESS_COOKIE = 'access_token';

function setAuthCookies(res, accessToken, refreshToken) {
  const cookieBase = {
    secure: env.cookies.secure,
    sameSite: env.cookies.sameSite,
    domain: env.cookies.domain,
    httpOnly: true,
    path: '/',
  };
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...cookieBase,
    maxAge: env.jwt.accessTtl * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieBase,
    maxAge: env.jwt.refreshTtl * 1000,
  });
  // Helper CSRF token cookie (already set by /csrf-mint in middleware order,
  // but refresh re-issues so cookies stay fresh after long sessions).
  const csrfToken = mintToken();
  res.cookie('csrf_token', csrfToken, {
    ...cookieBase,
    httpOnly: false,
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    verified: u.verified,
    createdAt: u.createdAt,
  };
}

// ------------------- POST /auth/register -------------------
/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [auth]
 *     summary: Create a new account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 10 }
 *               name: { type: string }
 *     responses:
 *       201:
 *         description: User created (not auto-logged-in).
 *       409: { description: Email already in use. }
 *       400: { description: Validation failed. }
 */
router.post(
  '/register',
  authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 10 }).withMessage('min 10 chars'),
  body('name').optional().isString().isLength({ min: 1, max: 80 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res
        .status(400)
        .json({ error: 'validation', details: errors.array() });

    const { email, password, name } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'email_in_use' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name: name || null },
    });
    log.info('user_registered', { userId: user.id, email: user.email });
    return res.status(201).json({ user: publicUser(user) });
  }
);

// ------------------- POST /auth/login -------------------
/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [auth]
 *     summary: Exchange email+password for tokens
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Tokens set as httpOnly cookies + JSON body. }
 *       401: { description: Invalid credentials. }
 *       429: { description: Rate limit hit. }
 */
router.post(
  '/login',
  authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ error: 'validation' });

    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    const jti = uuidv4();
    const accessToken = signAccess(user);
    const refreshToken = signRefresh(user, jti);
    const expiresAt = new Date(Date.now() + env.jwt.refreshTtl * 1000);
    await prisma.session.create({
      data: {
        id: jti,
        userId: user.id,
        refreshToken: await bcrypt.hash(refreshToken, 10),
        userAgent: req.headers['user-agent']?.slice(0, 256) || null,
        ip:
          (req.headers['x-forwarded-for']?.toString().split(',')[0].trim()) ||
          req.socket?.remoteAddress ||
          null,
        expiresAt,
      },
    });
    setAuthCookies(res, accessToken, refreshToken);
    log.info('user_login', { userId: user.id });
    return res.json({ user: publicUser(user) });
  }
);

// ------------------- POST /auth/refresh -------------------
/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [auth]
 *     summary: Rotate the refresh token and get a new access token
 *     responses:
 *       200: { description: New tokens issued. }
 *       401: { description: Invalid or expired refresh. }
 */
router.post(
  '/refresh',
  authLimiter,
  async (req, res) => {
    let token =
      req.cookies && req.cookies[REFRESH_COOKIE]
        ? req.cookies[REFRESH_COOKIE]
        : null;
    if (!token) {
      const auth = req.headers.authorization || '';
      if (auth.startsWith('Bearer ')) token = auth.slice(7);
    }
    if (!token) return res.status(401).json({ error: 'no_refresh' });
    let payload;
    try {
      payload = verifyRefresh(token);
    } catch (e) {
      return res.status(401).json({ error: 'invalid_refresh' });
    }
    const session = await prisma.session.findUnique({
      where: { id: payload.jti },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'session_expired' });
    }
    const stored = await bcrypt.compare(token, session.refreshToken);
    if (!stored) return res.status(401).json({ error: 'invalid_refresh' });

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: 'invalid_refresh' });

    // Rotate: revoke old, issue new.
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    const newJti = uuidv4();
    const newAccess = signAccess(user);
    const newRefresh = signRefresh(user, newJti);
    await prisma.session.create({
      data: {
        id: newJti,
        userId: user.id,
        refreshToken: await bcrypt.hash(newRefresh, 10),
        expiresAt: new Date(Date.now() + env.jwt.refreshTtl * 1000),
      },
    });
    setAuthCookies(res, newAccess, newRefresh);
    return res.json({ user: publicUser(user) });
  }
);

// ------------------- POST /auth/logout -------------------
/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [auth]
 *     summary: Revoke the current session
 *     responses:
 *       204: { description: Logged out. }
 */
router.post('/logout', async (req, res) => {
  const token =
    (req.cookies && req.cookies[REFRESH_COOKIE]) ||
    (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (token) {
    try {
      const payload = verifyRefresh(token);
      await prisma.session.updateMany({
        where: { id: payload.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      /* ignore — best-effort logout */
    }
  }
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
  res.clearCookie('csrf_token', { path: '/' });
  return res.status(204).end();
});

// ------------------- GET /auth/me -------------------
/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [auth]
 *     summary: Current user
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     responses:
 *       200: { description: User object. }
 *       401: { description: Not authenticated. }
 */
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'not_found' });
  return res.json({ user: publicUser(user) });
});

// ------------------- POST /auth/forgot-password -------------------
/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     tags: [auth]
 *     summary: Request a password reset token (always returns ok)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Token generated (in dev the token is in the response). }
 */
router.post(
  '/forgot-password',
  authLimiter,
  body('email').isEmail().normalizeEmail(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ error: 'validation' });
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    // Always return success (no enumeration).
    const response = { ok: true };
    if (user) {
      const { token, tokenHash, expiresAt } = await issueReset(user.id);
      log.info('password_reset_requested', {
        userId: user.id,
        tokenPreview: token.slice(0, 6) + '...',
      });
      if (env.reset.out === 'webhook' && env.reset.webhook) {
        try {
          await fetch(env.reset.webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, token, expiresAt }),
          });
        } catch (e) {
          log.error('reset_webhook_failed', { error: e.message });
        }
      } else {
        // In dev, expose the token in the response (caller controls delivery).
        response.devToken = token;
      }
    }
    return res.json(response);
  }
);

// ------------------- POST /auth/reset-password -------------------
/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     tags: [auth]
 *     summary: Consume the reset token and set a new password
 */
router.post(
  '/reset-password',
  authLimiter,
  body('token').isString().isLength({ min: 20 }),
  body('password').isString().isLength({ min: 10 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ error: 'validation' });
    const { token, password } = req.body;
    const result = await consumeReset(token);
    if (!result) return res.status(400).json({ error: 'invalid_or_expired_token' });
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: result.userId },
        data: { passwordHash },
      }),
      // Invalidate all sessions on password change.
      prisma.session.updateMany({
        where: { userId: result.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    log.info('password_reset_completed', { userId: result.userId });
    return res.json({ ok: true });
  }
);

module.exports = router;
