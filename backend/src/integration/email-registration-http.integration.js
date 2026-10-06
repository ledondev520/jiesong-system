/**
 * Input: actual registration HTTP routes, committed migrations and fake mail delivery only
 * Output: inactive SALES creation and replay rejection with independent safe-field SQL readback
 * Pos: test-only localhost registration acceptance; no activation, login or external provider
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

// Requires Node 20.19, Python 3 sqlite3 and the existing generated Prisma client.
// Credentials below are generated only in memory for this synthetic test.
test('HTTP/SQLite: email registration creates one inactive SALES account and rejects replay', async t => {
  // 0. Fail before loading configuration if a real environment file is present.
  const backend = path.resolve(__dirname, '../..');
  for (const file of [path.join(backend, '.env'), path.join(backend, 'backend.env'), path.join(backend, '../backend.env')]) {
    assert.equal(fs.existsSync(file), false, 'registration fixture refuses environment files');
  }
  assert.equal(process.env.NODE_ENV, 'test', 'registration fixture requires explicit NODE_ENV=test');
  assert.equal(Boolean(require.cache[require.resolve('../config')]), false, 'configuration must not be preloaded');
  assert.equal(Boolean(require.cache[require.resolve('../utils/prisma')]), false, 'database must not be preloaded');

  const previousEnvironment = { ...process.env };
  const previousUmask = process.umask(0o077);
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'jiesong-registration-http-'));
  const database = path.join(directory, 'synthetic.db');
  let db, server, allowedOrigin, deliveredCode;
  const realFetch = global.fetch;
  t.after(async () => {
    try {
      deliveredCode = undefined;
      if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
      if (db) await db.$disconnect();
      // Cleanup is limited to the private directory created by this test.
      assert.equal(fs.realpathSync(directory), directory);
      assert.equal(fs.lstatSync(directory).uid, process.getuid());
      fs.rmSync(directory, { recursive: true, force: true });
    } finally {
      global.fetch = realFetch;
      process.umask(previousUmask);
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, previousEnvironment);
    }
  });
  assert.equal(path.dirname(directory), temporaryRoot);
  assert.equal(fs.realpathSync(directory), directory);
  assert.equal(fs.lstatSync(directory).uid, process.getuid());
  fs.chmodSync(directory, 0o700);
  assert.equal(fs.lstatSync(directory).mode & 0o777, 0o700);
  fs.closeSync(fs.openSync(database, 'wx', 0o600));

  // Explicit allowlist: no inherited database/provider/credential or proxy config.
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, {
    PATH: previousEnvironment.PATH,
    NODE_ENV: 'test', TZ: 'UTC', TMPDIR: directory,
    DATABASE_URL: `file:${database}`, UPLOAD_DIR: path.join(directory, 'uploads'),
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  });
  // A guard, not a fake response: every allowed request uses the real HTTP transport.
  global.fetch = (input, options) => {
    const destination = new URL(typeof input === 'string' ? input : input.url);
    assert.equal(Boolean(allowedOrigin) && destination.origin === allowedOrigin, true,
      'registration fixture rejects unexpected external transport');
    return realFetch(input, { ...options, redirect: 'error' });
  };

  // 1. Apply only committed migrations to the newly created private SQLite file.
  const migrations = path.join(backend, 'prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database],
    { input: ddl, timeout: 10000, stdio: ['pipe', 'ignore', 'ignore'] });
  const databaseStat = fs.lstatSync(database);
  assert.equal(databaseStat.isFile(), true);
  assert.equal(databaseStat.nlink, 1);
  assert.equal(databaseStat.uid, process.getuid());
  assert.equal(databaseStat.mode & 0o777, 0o600);

  /**
   * 职责：independently read only ordinary user fields through a read-only SQL connection.
   * @returns {object[]} safe user rows; throws on SQL failure
   */
  const readUsers = () => JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
print(json.dumps([dict(row) for row in c.execute('SELECT username,email,name,role,isActive FROM users ORDER BY username')]))
c.close()`, database], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }));
  assert.deepEqual(readUsers(), []);

  // 2. Fake only the outgoing mail boundary; validators, hashing and transactions are real.
  const email = 'registration-http@example.com';
  const name = '合成邮箱注册';
  const password = crypto.randomBytes(24).toString('hex');
  const mail = require('../services/emailService');
  let deliveries = 0;
  t.mock.method(mail, 'isConfigured', () => true);
  t.mock.method(mail, 'sendRegistrationCode', async (recipient, code) => {
    assert.equal(recipient, email);
    assert.equal(typeof code === 'string' && /^\d{6}$/.test(code), true, 'mail receives one valid synthetic code');
    deliveries++;
    deliveredCode = code;
  });
  db = require('../utils/prisma');
  const express = require('express');
  const app = express();
  const { createApiRateLimiter, exposeApiRateLimitHeaders } = require('../middleware/apiRateLimit');
  app.use(createApiRateLimiter(), exposeApiRateLimitHeaders);
  app.use(express.json());
  app.use('/api/v1/auth', require('../routes/auth'));
  // Do not log or expose unexpected password-bearing ORM errors from the fixture.
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({
    code: error.statusCode || 500, message: 'Synthetic registration rejected', data: null,
  }));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  allowedOrigin = `http://127.0.0.1:${server.address().port}`;

  /**
   * 职责：send ordinary registration fields over actual localhost HTTP without auth storage.
   * @param {string} route registration endpoint
   * @param {object} body ordinary synthetic payload
   * @returns {Promise<object>} parsed response and status; no cookie values are read
   */
  const post = async (route, body) => {
    const response = await fetch(`${allowedOrigin}/api/v1/auth/${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.headers.has('set-cookie'), false, 'registration must not issue a cookie');
    return { status: response.status, body: await response.json() };
  };

  // 3. Real HTTP 200 code issuance, 201 registration, and independent persisted defaults.
  const sent = await post('email-code', { email });
  assert.equal(sent.status, 200);
  assert.deepEqual(Object.keys(sent.body).sort(), ['data', 'message', 'success']);
  assert.equal(sent.body.success, true);
  assert.deepEqual(sent.body.data, { retryAfter: 60 });
  assert.equal(deliveries, 1);
  assert.equal(typeof deliveredCode === 'string' && /^\d{6}$/.test(deliveredCode), true);
  const payload = { email, name, password, code: deliveredCode };
  const registered = await post('email-register', payload);
  assert.equal(registered.status, 201);
  assert.deepEqual(Object.keys(registered.body).sort(), ['code', 'data', 'message']);
  assert.equal(registered.body.code, 201);
  // Exact key allowlists reject token/credential output without printing its values.
  assert.deepEqual(Object.keys(registered.body.data).sort(), ['email', 'id', 'isActive', 'name']);
  assert.equal(registered.body.data.email, email);
  assert.equal(registered.body.data.name, name);
  assert.equal(registered.body.data.isActive, false);
  assert.equal(typeof registered.body.data.id, 'string');
  const expected = [{ username: email, email, name, role: 'SALES', isActive: 0 }];
  assert.deepEqual(readUsers(), expected);

  // 4. Replay the same in-memory code once; one inactive row remains, with no session.
  const replay = await post('email-register', payload);
  assert.equal(replay.status, 400);
  assert.deepEqual(Object.keys(replay.body).sort(), ['code', 'data', 'message']);
  assert.equal(replay.body.code, 400);
  assert.equal(replay.body.data, null);
  assert.deepEqual(readUsers(), expected);
  assert.equal(deliveries, 1);
});
