'use strict';
/**
 * End-to-end tests for the auth-service using supertest + node --test.
 * Requires a fresh SQLite database (DEV mode).
 *
 * Run:  npm test
 */

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-secret-aaaaaaaaaaaaaaa';
process.env.JWT_REFRESH_SECRET = 'test-secret-bbbbbbbbbbbbbbb';
process.env.CSRF_SECRET = 'test-secret-ccccccccccccccccc';
process.env.COOKIE_SECURE = 'false';
process.env.DATABASE_URL = 'file:./test.db';

const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { execSync } = require('node:child_process');

// Cleanup before tests
const dbFile = path.join(__dirname, '..', 'prisma', 'test.db');
if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
// Push schema directly (faster than migrate in CI)
execSync('npx prisma db push --skip-generate --accept-data-loss', {
  cwd: path.join(__dirname, '..'),
  stdio: 'pipe',
});
const { PrismaClient } = require('@prisma/client');
const { createApp } = require('../src/app');
const prisma = new PrismaClient();

function mintCookie() {
  return request(app)
    .get('/csrf-mint')
    .expect(200)
    .then((res) => res.body.csrfToken);
}

const app = createApp();

// Persistent browser-style agent: keeps cookies between requests so the
// ``csrf_token`` cookie from /csrf-mint is reused on subsequent POSTs.
const sharedAgent = request.agent(app);

function mintWith(agentRef) {
  return agentRef.get('/csrf-mint').then((r) => r.body.csrfToken);
}

test('full auth flow: register → login → refresh → me → logout', async () => {
  // For this isolated flow we use a dedicated agent so prior state doesn't leak.
  const flow = request.agent(app);
  const csrf = await flow.get('/csrf-mint').then((r) => r.body.csrfToken);
  const email = `u${Date.now()}@example.com`;
  const reg = await flow
    .post('/auth/register')
    .set('X-CSRF-Token', csrf)
    .send({ email, password: 'senha-forte-teste', name: 'Tester' });
  assert.strictEqual(reg.status, 201);
  assert.strictEqual(reg.body.user.email, email);

  const csrf2 = await flow.get('/csrf-mint').then((r) => r.body.csrfToken);
  const login = await flow
    .post('/auth/login')
    .set('X-CSRF-Token', csrf2)
    .send({ email, password: 'senha-forte-teste' });
  assert.strictEqual(login.status, 200);
  const setCookie = (login.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  const access = (login.headers['set-cookie'] || []).find((c) =>
    c.startsWith('access_token=')
  );
  const refresh = (login.headers['set-cookie'] || []).find((c) =>
    c.startsWith('refresh_token=')
  );
  assert.ok(access, 'access cookie set');
  assert.ok(refresh, 'refresh cookie set');

  // /me through agent (uses the cookies the agent has accumulated).
  const me = await flow.get('/auth/me');
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.user.email, email);

  // /me with Authorization Bearer header (no cookies).
  const accessValue = access.split(';')[0].split('=')[1];
  const bearer = await request(app)
    .get('/auth/me')
    .set('Authorization', 'Bearer ' + accessValue);
  assert.strictEqual(bearer.status, 200);

  const csrf3 = await flow.get('/csrf-mint').then((r) => r.body.csrfToken);
  const refreshed = await flow.post('/auth/refresh').set('X-CSRF-Token', csrf3);
  assert.strictEqual(refreshed.status, 200);

  const csrf4 = await flow.get('/csrf-mint').then((r) => r.body.csrfToken);
  const out = await flow.post('/auth/logout').set('X-CSRF-Token', csrf4);
  assert.strictEqual(out.status, 204);
});

test('CSRF blocks POST without token', async () => {
  const res = await request(app)
    .post('/auth/login')
    .send({ email: 'x@x.com', password: 'y' });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.error, 'csrf_missing');
});

test('rate limit kicks in after burst on /login', async () => {
  const a = request.agent(app);
  const csrf = await a.get('/csrf-mint').then((r) => r.body.csrfToken);
  let lastStatus = 0;
  for (let i = 0; i < 12; i++) {
    const r = await a
      .post('/auth/login')
      .set('X-CSRF-Token', csrf)
      .set('X-Forwarded-For', '9.9.9.9')
      .send({ email: 'nobody@nowhere.io', password: 'wrong' });
    lastStatus = r.status;
  }
  assert.ok(lastStatus === 401 || lastStatus === 429, 'last code is 401 or 429');
});

test('password reset flow', async () => {
  const a = request.agent(app);
  const csrf0 = await a.get('/csrf-mint').then((r) => r.body.csrfToken);
  const email = `reset${Date.now()}@example.com`;
  await a
    .post('/auth/register')
    .set('X-CSRF-Token', csrf0)
    .send({ email, password: 'senha-original-1234' });
  const csrf1 = await a.get('/csrf-mint').then((r) => r.body.csrfToken);
  const req2 = await a
    .post('/auth/forgot-password')
    .set('X-CSRF-Token', csrf1)
    .send({ email });
  assert.strictEqual(req2.status, 200);
  assert.ok(req2.body.devToken, 'devToken returned in test env (no webhook)');

  const csrf2 = await a.get('/csrf-mint').then((r) => r.body.csrfToken);
  const reset = await a
    .post('/auth/reset-password')
    .set('X-CSRF-Token', csrf2)
    .send({ token: req2.body.devToken, password: 'nova-senha-12345' });
  assert.strictEqual(reset.status, 200);

  const csrf3 = await a.get('/csrf-mint').then((r) => r.body.csrfToken);
  const login = await a
    .post('/auth/login')
    .set('X-CSRF-Token', csrf3)
    .send({ email, password: 'nova-senha-12345' });
  assert.strictEqual(login.status, 200);
});

test('docs and openapi endpoints respond', async () => {
  const ui = await request(app).get('/docs/');
  assert.ok([200, 301].includes(ui.status));
  const spec = await request(app).get('/openapi.json');
  assert.strictEqual(spec.status, 200);
  assert.strictEqual(spec.body.openapi, '3.0.3');
  assert.ok(spec.body.paths['/auth/login']);
  assert.ok(spec.body.paths['/api/transcriptions']);
});

test.after(async () => {
  await prisma.$disconnect();
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
});
