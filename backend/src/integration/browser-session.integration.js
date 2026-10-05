/** Real HTTP + additive SQLite migration; synthetic accounts and ephemeral secrets only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

test('fixed-expiry opt-in browser sessions and CSRF boundaries', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-browser-session-'));
  fs.chmodSync(directory, 0o700);
  const file = path.join(directory, 'test.db');
  process.env.DATABASE_URL = `file:${file}`;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.JWT_EXPIRES_IN = '2h';
  process.env.CORS_ORIGIN = 'http://127.0.0.1:3004';
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const names = fs.readdirSync(migrations).filter((name) => fs.statSync(path.join(migrations, name)).isDirectory()).sort();
  const apply = (sql) => execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', file], { input: sql });
  apply(names.filter((name) => !name.endsWith('_browser_sessions')).map((name) => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n'));
  apply("INSERT INTO users(id,username,password,name,updatedAt) VALUES('legacy','legacy','synthetic-unused','Synthetic',CURRENT_TIMESTAMP); INSERT INTO operation_logs(id,userId,action,entity) VALUES('history','legacy','CREATE','User');");
  fs.copyFileSync(file, path.join(directory, 'before.db')); fs.chmodSync(path.join(directory, 'before.db'), 0o600);
  apply(fs.readFileSync(path.join(migrations, names.find((name) => name.endsWith('_browser_sessions')), 'migration.sql'), 'utf8'));
  const db = require('../utils/prisma');
  const auth = require('../services/authService');
  const browser = require('../services/browserSessionService');
  const password = crypto.randomBytes(18).toString('hex');
  const user = await db.user.create({ data: { username: 'synthetic-browser', password: await require('bcrypt').hash(password, 4), name: 'Synthetic', role: 'ADMIN' } });
  const express = require('express'); const app = express(); app.use(express.json());
  const routes = require('../routes/auth'); app.use('/api/v1/auth', routes);
  const { authenticate } = require('../middleware/auth');
  app.post('/write', authenticate, (_req, res) => res.json({ code: 200 }));
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.message }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  t.after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); await db.$disconnect(); fs.rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const origin = process.env.CORS_ORIGIN;
  const request = async (route, { method = 'GET', body, cookie, csrf, headers = {} } = {}) => {
    const response = await fetch(base + route, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie'), cache: response.headers.get('cache-control') };
  };
  const login = async (extra = {}, options = {}) => {
    // Keep rate limiting intact but reset this synthetic test user's counter between cases.
    require('../middleware/rateLimit').resetLimit(`127.0.0.1:${user.username}`);
    return request('/api/v1/auth/login', { method: 'POST', body: { username: user.username, password, ...extra }, headers: { origin }, ...options });
  };
  const session = async () => {
    const result = await login({ rememberMe: true }); assert.equal(result.status, 200);
    return { cookie: result.cookie.split(';')[0], csrf: result.body.data.csrfToken, expiresAt: result.body.data.expiresAt, result };
  };
  await t.test('migration preserves historical users and logs', async () => {
    assert.equal(await db.operationLog.count({ where: { id: 'history' } }), 1);
    assert.equal((await db.user.findUnique({ where: { id: 'legacy' } })).sessionVersion, 0);
  });
  await t.test('opt in only, HttpOnly, exact existing expiry, no bearer credential returned or renewal', async () => {
    const ordinary = await login(); assert.equal(typeof ordinary.body.data.token, 'string');
    assert.match(ordinary.cookie, /Expires=Thu, 01 Jan 1970/); assert.equal(await db.browserSession.count(), 0);
    const s = await session(); assert.equal(s.result.body.data.token, null); assert.match(s.result.cookie, /HttpOnly/); assert.match(s.result.cookie, /SameSite=Strict/); assert.match(s.result.cookie, /Path=\//); assert.ok(!s.result.cookie.includes('Domain='));
    assert.ok(Math.abs(Date.parse(s.expiresAt) - Date.now() - 7200000) < 2000);
    const row = await db.browserSession.findFirst(); assert.notEqual(row.tokenHash, s.cookie.split('=')[1]); assert.match(row.tokenHash, /^[a-f0-9]{64}$/);
    const restored = await request('/api/v1/auth/session', s); assert.equal(restored.status, 200); assert.equal(restored.body.data.csrfToken, s.csrf); assert.equal(restored.body.data.expiresAt, s.expiresAt); assert.equal(restored.cookie, null); assert.match(restored.cache, /no-store/);
    const flags = JSON.parse(execFileSync(process.execPath, ['-e', "const s=require('./src/services/browserSessionService');console.log(JSON.stringify({name:s.COOKIE_NAME,...s.cookieOptions()}))"], { cwd: path.resolve(__dirname, '../..'), env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8' }));
    assert.equal(flags.name, '__Host-jiesong_session'); assert.equal(flags.secure, true); assert.equal(flags.httpOnly, true); assert.equal(flags.sameSite, 'strict');
  });
  await t.test('login CSRF, malformed option and missing origin fail closed', async () => {
    for (const headers of [{}, { origin: 'null' }, { origin: 'https://evil.example' }, { origin, 'sec-fetch-site': 'cross-site' }]) assert.equal((await login({ rememberMe: true }, { headers })).status, 403);
    assert.equal((await login({ rememberMe: 'true' })).status, 400);
    assert.equal((await login({}, { headers: {} })).status, 200); // Existing machine bearer-login API.
  });
  await t.test('cookie writes including multipart/SSE require trusted origin and correct session-bound proof', async () => {
    const a = await session(), b = await session();
    for (const headers of [{}, { origin: 'null' }, { origin: 'https://evil.example' }]) assert.equal((await request('/write', { method: 'POST', ...a, headers })).status, 403);
    for (const csrf of [undefined, 'bad', b.csrf]) assert.equal((await request('/write', { method: 'POST', cookie: a.cookie, csrf, headers: { origin } })).status, 403);
    for (const contentType of ['application/json', 'multipart/form-data; boundary=test']) {
      assert.equal((await request('/write', { method: 'POST', ...a, headers: { origin, 'content-type': contentType, accept: 'text/event-stream' } })).status, 200);
      assert.equal((await request('/write', { method: 'POST', cookie: a.cookie, headers: { origin, 'content-type': contentType } })).status, 403);
    }
    assert.equal((await request('/api/v1/auth/session', { ...a, headers: { origin: 'https://sibling.example', 'sec-fetch-site': 'same-site' } })).status, 403);
    assert.equal((await request('/api/v1/auth/session', { ...a, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
    assert.equal((await request('/api/v1/auth/session', { ...a, headers: { 'sec-fetch-site': 'same-origin' } })).status, 200);
  });
  await t.test('bearer takes precedence; explicit invalid bearer never falls back; empty legacy header allows cookie', async () => {
    const s = await session(); const bearer = (await login()).body.data.token;
    assert.equal((await request('/write', { method: 'POST', cookie: s.cookie, headers: { authorization: `Bearer ${bearer}` } })).status, 200);
    for (const authorization of ['Bearer invalid', 'Basic invalid', 'Bearer ']) assert.equal((await request('/api/v1/auth/session', { ...s, headers: { authorization } })).status, 401);
    assert.equal((await request('/api/v1/auth/session', { ...s, headers: { authorization: '' } })).status, 200);
  });
  await t.test('logout revokes only this browser, requires CSRF even with bearer and supports BOSS', async () => {
    const a = await session(), b = await session(); const bearer = (await login()).body.data.token;
    assert.equal((await request('/api/v1/auth/logout', { method: 'POST', cookie: a.cookie, headers: { origin, authorization: `Bearer ${bearer}` } })).status, 403);
    const result = await request('/api/v1/auth/logout', { method: 'POST', ...a, headers: { origin } }); assert.equal(result.status, 200); assert.equal(result.cookie, null);
    assert.equal((await request('/api/v1/auth/session', a)).status, 401); assert.equal((await request('/api/v1/auth/session', b)).status, 200);
    assert.equal((await request('/api/v1/auth/me', { headers: { authorization: `Bearer ${bearer}` } })).status, 200);
    await db.user.update({ where: { id: user.id }, data: { role: 'BOSS' } });
    assert.equal((await request('/api/v1/auth/session', b)).status, 200); assert.equal((await request('/api/v1/auth/logout', { method: 'POST', ...b, headers: { origin } })).status, 200);
    await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  });
  await t.test('logout proof supports bearer/cookie coexistence and disabled-session revocation without auth bypass', async () => {
    const s = await session(); const bearer = (await login()).body.data.token;
    assert.equal((await request('/api/v1/auth/logout-csrf', { ...s, headers: { origin: 'https://evil.example', 'sec-fetch-site': 'same-site' } })).status, 403);
    assert.equal((await request('/api/v1/auth/logout-csrf', { ...s, headers: {} })).status, 403);
    let proof = await request('/api/v1/auth/logout-csrf', { ...s, headers: { origin, authorization: `Bearer ${bearer}` } });
    assert.deepEqual(Object.keys(proof.body.data), ['csrfToken']); assert.equal(proof.body.data.csrfToken, s.csrf); assert.match(proof.cache, /no-store/);
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });
    proof = await request('/api/v1/auth/logout-csrf', { ...s, headers: { 'sec-fetch-site': 'same-origin' } }); assert.equal(proof.status, 200);
    const result = await request('/api/v1/auth/logout', { method: 'POST', cookie: s.cookie, csrf: proof.body.data.csrfToken, headers: { origin } }); assert.equal(result.status, 200);
    await db.user.update({ where: { id: user.id }, data: { isActive: true } }); assert.equal((await request('/api/v1/auth/session', s)).status, 401);
  });
  await t.test('logout proof reveals no credential, supports invalid sessions, and fails if another tab replaces the cookie', async () => {
    for (const cookie of [undefined, `${browser.COOKIE_NAME}=bad`, `${browser.COOKIE_NAME}=bad; ${browser.COOKIE_NAME}=duplicate`]) {
      const result = await request('/api/v1/auth/logout-csrf', { cookie, headers: { origin } }); assert.equal(result.status, 200); assert.deepEqual(result.body.data, { csrfToken: null });
    }
    for (const kind of ['expired', 'version']) {
      const s = await session();
      if (kind === 'expired') await db.browserSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      else await db.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
      const proof = await request('/api/v1/auth/logout-csrf', { ...s, headers: { origin } }); assert.equal(proof.body.data.csrfToken, s.csrf);
      assert.equal((await request('/api/v1/auth/logout', { method: 'POST', ...s, headers: { origin } })).status, 200);
    }
    const old = await session(); const replacement = await login({ rememberMe: true }, { cookie: old.cookie });
    const current = { cookie: replacement.cookie.split(';')[0], csrf: replacement.body.data.csrfToken };
    assert.equal((await request('/api/v1/auth/logout', { method: 'POST', cookie: current.cookie, csrf: old.csrf, headers: { origin } })).status, 403);
    const lateLogout = await request('/api/v1/auth/logout', { method: 'POST', ...old, headers: { origin } }); assert.equal(lateLogout.status, 200); assert.equal(lateLogout.cookie, null);
    assert.equal((await request('/api/v1/auth/session', current)).status, 200);
  });
  await t.test('unchecked new login revokes old browser only; failed login preserves existing session; malformed cookie recoverable', async () => {
    const a = await session(), b = await session();
    assert.equal((await login({ password: crypto.randomBytes(18).toString('hex') }, { cookie: a.cookie })).status, 401);
    assert.equal((await request('/api/v1/auth/session', a)).status, 200);
    assert.equal((await login({}, { cookie: a.cookie })).status, 200);
    assert.equal((await request('/api/v1/auth/session', a)).status, 401); assert.equal((await request('/api/v1/auth/session', b)).status, 200);
    assert.equal((await login({ rememberMe: true }, { cookie: `${browser.COOKIE_NAME}=invalid` })).status, 200);
  });
  await t.test('expiry, disabled account, password and sessionVersion revoke live without renewal', async () => {
    let s = await session(); await db.browserSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    let result = await request('/api/v1/auth/session', s); assert.equal(result.status, 401); assert.equal(result.cookie, null);
    s = await session(); assert.equal(await db.browserSession.count(), 1); // Prunes expired records.
    await db.user.update({ where: { id: user.id }, data: { isActive: false } }); assert.equal((await request('/api/v1/auth/session', s)).status, 401);
    await db.user.update({ where: { id: user.id }, data: { isActive: true, sessionVersion: { increment: 1 } } }); assert.equal((await request('/api/v1/auth/session', s)).status, 401);
    s = await session(); const bearer = (await login()).body.data.token;
    const changed = await request('/api/v1/auth/change-password', { method: 'POST', ...s, headers: { origin }, body: { oldPassword: password, newPassword: crypto.randomBytes(18).toString('hex') } }); assert.equal(changed.status, 200);
    assert.equal((await request('/api/v1/auth/session', s)).status, 401); assert.equal((await request('/api/v1/auth/me', { headers: { authorization: `Bearer ${bearer}` } })).status, 401);
  });
  await t.test('database failures are sanitized and fail closed', async () => {
    await db.$executeRawUnsafe('ALTER TABLE browser_sessions RENAME TO unavailable_browser_sessions');
    const fake = `${browser.COOKIE_NAME}=${crypto.randomBytes(32).toString('base64url')}`;
    const result = await request('/api/v1/auth/session', { cookie: fake }); assert.equal(result.status, 503); assert.ok(!JSON.stringify(result).includes('credential-hash-must-not-leak')); assert.equal(result.cookie, null); await db.$executeRawUnsafe('ALTER TABLE unavailable_browser_sessions RENAME TO browser_sessions');
  });
});
