/** Real HTTP + SQLite, synthetic users only. Covers migration, anti-abuse, atomic consumption and JWT revocation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');

test('isolated password recovery security boundaries', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-recovery-'));
  fs.chmodSync(directory, 0o700);
  const file = path.join(directory, 'test.db');
  process.env.DATABASE_URL = `file:${file}`;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  const root = path.resolve(__dirname, '../..');
  const migrationDir = path.join(root, 'prisma/migrations');
  const oldDdl = fs.readdirSync(migrationDir).filter((name) => name < '20261002113919' && fs.statSync(path.join(migrationDir, name)).isDirectory())
    .map((name) => fs.readFileSync(path.join(migrationDir, name, 'migration.sql'), 'utf8')).join('\n');
  // Preserve an actual pre-migration account and historical row while applying additive DDL.
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', file], {
    input: oldDdl + "\nINSERT INTO users (id, username, password, name, updatedAt) VALUES ('legacy', 'legacy', 'synthetic-old-hash', 'Synthetic', CURRENT_TIMESTAMP);\nINSERT INTO operation_logs (id, userId, action, entity) VALUES ('historical', 'legacy', 'CREATE', 'User');\n",
  });
  const backup = path.join(directory, 'before.db'); fs.copyFileSync(file, backup); fs.chmodSync(backup, 0o600);
  const migration = fs.readFileSync(path.join(migrationDir, '20261002113919_email_password_recovery/migration.sql'), 'utf8');
  execFileSync('python3', ['-c', 'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', file], { input: migration });
  fs.chmodSync(file, 0o600);
  const db = require('../utils/prisma');
  const bcrypt = require('bcrypt');
  const jwt = require('jsonwebtoken');
  const service = require('../services/passwordResetService');
  const mail = require('../services/emailService');
  const auth = require('../services/authService');
  const { authenticate } = require('../middleware/auth');
  let server;
  t.after(async () => { if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); } await db.$disconnect(); fs.rmSync(directory, { recursive: true, force: true }); });
  assert.equal((await db.user.findUnique({ where: { id: 'legacy' } })).password, 'synthetic-old-hash');
  assert.equal((await db.user.findUnique({ where: { id: 'legacy' } })).sessionVersion, 0);
  assert.equal(await db.operationLog.count({ where: { id: 'historical' } }), 1);
  assert.equal(await db.passwordResetLock.count(), 1);
  const email = 'recovery@example.com';
  const initialPassword = crypto.randomBytes(18).toString('hex');
  const user = await db.user.create({ data: { username: 'synthetic-recovery', email, name: 'Synthetic', password: await bcrypt.hash(initialPassword, 12) } });
  const disabled = await db.user.create({ data: { username: 'synthetic-disabled', email: 'disabled@example.com', name: 'Synthetic', password: 'synthetic-unused-hash', isActive: false } });
  await db.user.createMany({ data: ['duplicate-a', 'duplicate-b'].map((username) => ({ username, email: 'duplicate@example.com', name: 'Synthetic', password: 'synthetic-unused-hash' })) });
  const delivered = new Map();
  t.mock.method(mail, 'isConfigured', () => true);
  t.mock.method(mail, 'sendPasswordResetCode', async (recipient, code, id) => { delivered.set(id, { recipient, code }); });
  const latest = () => db.passwordResetChallenge.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } });
  async function waitReady() {
    for (let i = 0; i < 200; i++) { const c = await latest(); if (c?.ready) return c; await new Promise((r) => setTimeout(r, 10)); }
    throw new Error('synthetic delivery did not activate');
  }
  async function issue() {
    await db.passwordResetChallenge.updateMany({ where: { email }, data: { createdAt: new Date(Date.now() - 61000) } });
    await service.sendCode(email, 'synthetic-ip'); const c = await waitReady(); return { challenge: c, code: delivered.get(c.id).code };
  }
  const payload = (code) => ({ email, code, newPassword: crypto.randomBytes(18).toString('hex') });
  const check = (token) => new Promise((resolve, reject) => authenticate({ headers: { authorization: `Bearer ${token}` } }, {}, (error) => error ? reject(error) : resolve()));
  const express = require('express'); const app = express(); app.use(express.json()); app.use('/auth', require('../routes/auth'));
  app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ code: err.statusCode || 500, message: err.message, data: null }));
  server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/auth`;
  const post = async (route, body, token) => {
    const res = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  await t.test('unknown, disabled, duplicate and legacy accounts have the same send response', async () => {
    let reference;
    for (const address of [email, 'unknown@example.com', disabled.email, 'duplicate@example.com', 'legacy@example.com']) {
      const response = await post('/reset-password-code', { email: address.toUpperCase() });
      assert.equal(response.status, 200); if (!reference) reference = response; else assert.deepEqual(response, reference);
    }
    await waitReady();
    assert.equal(delivered.size, 1);
    const challenges = await db.passwordResetChallenge.findMany(); assert.equal(challenges.length, 5);
    assert.equal(challenges.filter((c) => c.userId === null).length, 4);
    for (const c of challenges) { assert.notEqual(c.requesterHash, 'synthetic-ip'); assert.notEqual(c.codeHash, delivered.get(c.id)?.code); }
    assert.equal((await post('/reset-password', { username: user.username, phone: 'synthetic-phone', newPassword: initialPassword })).status, 400);
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).sessionVersion, 0);
    await db.passwordResetChallenge.deleteMany();
  });
  await t.test('wrong, expired, exhausted, superseded and replayed codes cannot reset', async () => {
    let issued = await issue(); const wrong = issued.code === '000000' ? '999999' : '000000';
    for (let i = 0; i < 5; i++) await assert.rejects(service.resetPassword(payload(wrong)), { statusCode: 400 });
    assert.equal((await latest()).attempts, 5);
    await assert.rejects(service.resetPassword(payload(issued.code)), { statusCode: 400 });
    issued = await issue(); await db.passwordResetChallenge.update({ where: { id: issued.challenge.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    await assert.rejects(service.resetPassword(payload(issued.code)), { statusCode: 400 });
    issued = await issue(); const previous = issued; issued = await issue();
    assert.equal((await db.passwordResetChallenge.findUnique({ where: { id: previous.challenge.id } })).codeHash, '');
    // Inject a registration code's keyed digest; reset codes are domain-separated.
    const registrationHash = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${issued.challenge.id}:${issued.code}`).digest('hex');
    await db.passwordResetChallenge.update({ where: { id: issued.challenge.id }, data: { codeHash: registrationHash } });
    await assert.rejects(service.resetPassword(payload(issued.code)), { statusCode: 400 });
    await db.passwordResetChallenge.deleteMany();
  });
  await t.test('concurrent requests across processes consume only once; old and legacy JWTs revoke immediately', async () => {
    const login = await auth.login(user.username, initialPassword);
    const legacyToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
    await check(login.token); await check(legacyToken); // Warm authentication before reset.
    const issued = await issue(); const reset = payload(issued.code);
    const consumer = () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, 'src/testHelpers/reset-consumer.js')], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', (chunk) => { output += chunk; }); child.on('error', reject);
      child.on('exit', (exit) => exit === 0 ? resolve(output) : reject(new Error('synthetic consumer failed'))); child.stdin.end(JSON.stringify(reset));
    });
    const outcomes = await Promise.all([consumer(), consumer()]);
    assert.equal(outcomes.filter((result) => result === '200').length, 1); assert.ok(outcomes.every((result) => ['200', '400', '503'].includes(result)));
    await assert.rejects(check(login.token), { statusCode: 401 }); await assert.rejects(check(legacyToken), { statusCode: 401 });
    await assert.rejects(service.resetPassword(reset), { statusCode: 400 });
    const updated = await db.user.findUnique({ where: { id: user.id } }); assert.equal(updated.sessionVersion, 1);
    assert.equal(await bcrypt.compare(reset.newPassword, updated.password), true);
    await assert.rejects(auth.login(user.username, initialPassword), { statusCode: 401 });
    const fresh = await auth.login(user.username, reset.newPassword); await check(fresh.token);
    const logs = await db.operationLog.findMany({ where: { action: 'RESET_PASSWORD' } }); assert.equal(logs.length, 1);
    for (const log of logs) { assert.equal(log.oldValue, null); assert.equal(log.newValue, null); assert.equal(log.ipAddress, null); }
    await db.passwordResetChallenge.deleteMany();
  });
  await t.test('late delivery receipts cannot revive superseded challenges', async () => {
    let acknowledge;
    let sent = false;
    const delayed = t.mock.method(mail, 'sendPasswordResetCode', async () => {
      sent = true; await new Promise((resolve) => { acknowledge = resolve; });
    });
    await service.sendCode(email, 'synthetic-ip');
    for (let i = 0; i < 100 && !sent; i++) await new Promise((r) => setTimeout(r, 10));
    const old = await latest(); assert.equal(old.ready, false);
    delayed.mock.restore();
    await issue(); acknowledge();
    await new Promise((r) => setTimeout(r, 50));
    const stale = await db.passwordResetChallenge.findUnique({ where: { id: old.id } });
    assert.equal(stale.ready, false); assert.equal(stale.codeHash, '');
    await db.passwordResetChallenge.deleteMany();
  });
  await t.test('account disabled or email rebound after issuance fails closed', async () => {
    let issued = await issue(); await db.user.update({ where: { id: user.id }, data: { isActive: false } });
    await assert.rejects(service.resetPassword(payload(issued.code)), { statusCode: 400 });
    await db.user.update({ where: { id: user.id }, data: { isActive: true } });
    issued = await issue(); await db.user.update({ where: { id: user.id }, data: { email: 'changed@example.com' } });
    await assert.rejects(service.resetPassword(payload(issued.code)), { statusCode: 400 });
    await db.user.update({ where: { id: user.id }, data: { email } }); await db.passwordResetChallenge.deleteMany();
  });
  await t.test('password change and administrator reset revoke pending codes and all old sessions', async () => {
    const current = await db.user.findUnique({ where: { id: user.id } });
    const password = crypto.randomBytes(18).toString('hex'); await db.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(password, 12) } });
    const login = await auth.login(user.username, password); const issued = await issue();
    const changed = crypto.randomBytes(18).toString('hex'); await auth.changePassword(user.id, password, changed);
    await assert.rejects(check(login.token), { statusCode: 401 }); await assert.rejects(service.resetPassword(payload(issued.code)), { statusCode: 400 });
    const fresh = await auth.login(user.username, changed);
    await require('../controllers/userController').update({ params: { id: user.id }, body: { password: crypto.randomBytes(18).toString('hex') } }, { status() { return this; }, json() {} }, (err) => { throw err; });
    await assert.rejects(check(fresh.token), { statusCode: 401 });
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).sessionVersion, current.sessionVersion + 2);
    await db.passwordResetChallenge.deleteMany();
  });
  await t.test('audit persistence failure rolls back code consumption, password and version', async () => {
    const before = await db.user.findUnique({ where: { id: user.id } });
    const issued = await issue();
    await db.$executeRawUnsafe('ALTER TABLE operation_logs RENAME TO synthetic_blocked_logs');
    try {
      await assert.rejects(service.resetPassword(payload(issued.code)), { statusCode: 503 });
      const after = await db.user.findUnique({ where: { id: user.id } });
      assert.equal(after.password, before.password); assert.equal(after.sessionVersion, before.sessionVersion);
      const challenge = await latest(); assert.equal(challenge.ready, true); assert.equal(challenge.attempts, 0);
    } finally { await db.$executeRawUnsafe('ALTER TABLE synthetic_blocked_logs RENAME TO operation_logs'); }
    await db.passwordResetChallenge.deleteMany();
  });
  await t.test('failure stays unusable and consumes quota; logs never contain private provider details', async () => {
    const issued = await issue(); await db.passwordResetChallenge.updateMany({ data: { createdAt: new Date(Date.now() - 61000) } });
    const output = []; const mocked = t.mock.method(console, 'error', (...values) => { output.push(values.join(' ')); });
    const delivery = t.mock.method(mail, 'sendPasswordResetCode', async () => { throw new Error('PRIVATE_CODE_EMAIL_AND_PROVIDER_BODY'); });
    await service.sendCode(email, 'synthetic-ip');
    for (let i = 0; i < 100 && !output.length; i++) await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(output, ['[PASSWORD_RESET] delivery not confirmed']);
    assert.equal((await latest()).ready, false); await assert.rejects(service.resetPassword(payload(issued.code)), { statusCode: 400 });
    await assert.rejects(service.sendCode(email, 'synthetic-ip'), { statusCode: 429 });
    delivery.mock.restore(); mocked.mock.restore(); await db.passwordResetChallenge.deleteMany();
  });
  await t.test('persistent per-email, IP, global quotas, cleanup and simultaneous reservation', async () => {
    const data = (address, requesterHash = 'synthetic-hash') => ({ id: crypto.randomUUID(), email: address, requesterHash, codeHash: '', expiresAt: new Date(), createdAt: new Date(Date.now() - 61000) });
    await db.passwordResetChallenge.createMany({ data: Array.from({ length: 5 }, () => data(email)) });
    await assert.rejects(service.sendCode(email, 'synthetic-ip'), { statusCode: 429 }); await db.passwordResetChallenge.deleteMany();
    const requesterHash = crypto.createHmac('sha256', process.env.JWT_SECRET).update('password-reset:ip:synthetic-ip').digest('hex');
    await db.passwordResetChallenge.createMany({ data: Array.from({ length: 10 }, (_, i) => data(`unknown-${i}@example.com`, requesterHash)) });
    await assert.rejects(service.sendCode('fresh@example.com', 'synthetic-ip'), { statusCode: 429 }); await db.passwordResetChallenge.deleteMany();
    await db.passwordResetChallenge.createMany({ data: Array.from({ length: 59 }, (_, i) => data(`quota-${i}@example.com`)) });
    const outcomes = await Promise.allSettled([service.sendCode('last-a@example.com', 'a'), service.sendCode('last-b@example.com', 'b')]);
    assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1); assert.equal(await db.passwordResetChallenge.count(), 60);
    await assert.rejects(service.sendCode('fresh@example.com', 'synthetic-ip'), { statusCode: 429 }); await db.passwordResetChallenge.deleteMany();
    await db.passwordResetChallenge.create({ data: { ...data('stale@example.com'), createdAt: new Date(Date.now() - 86400001) } });
    await service.sendCode('unknown@example.com', 'synthetic-ip'); assert.equal(await db.passwordResetChallenge.count(), 1);
    const outcomes2 = await Promise.allSettled([service.sendCode('same@example.com', 'a'), service.sendCode('same@example.com', 'b')]);
    assert.equal(outcomes2.filter((r) => r.status === 'fulfilled').length, 1);
    await db.passwordResetChallenge.deleteMany();
  });
  await t.test('HTTP rejects malformed input and applies the same byte limit to every password writer', async () => {
    for (const body of [{ email: {} }, { email: 'one@example.com,two@example.com' }, { email: 'bad' }]) assert.equal((await post('/reset-password-code', body)).status, 400);
    const invalidPasswords = ['short', 'a'.repeat(73), '密'.repeat(25)];
    for (const newPassword of invalidPasswords) {
      assert.equal((await post('/reset-password', { email, code: '123456', newPassword })).status, 400);
      await assert.rejects(auth.register({ username: 'unused', name: 'Synthetic', password: newPassword }), { statusCode: 400 });
      await assert.rejects(auth.changePassword(user.id, 'synthetic-unused', newPassword), { statusCode: 400 });
      await assert.rejects(require('../services/emailRegistrationService').register({ email, code: '123456', password: newPassword }), { statusCode: 400 });
    }
    const limited = require('../middleware/rateLimit'); limited.resetLimit('reset-send:127.0.0.1');
    for (let i = 0; i < 10; i++) assert.equal((await post('/reset-password-code', { email: `ip-${i}@example.com` })).status, 200);
    assert.equal((await post('/reset-password-code', { email: 'ip-block@example.com' })).status, 429);
    const configured = t.mock.method(mail, 'isConfigured', () => false);
    await assert.rejects(service.sendCode(email, 'synthetic-ip'), { statusCode: 503 }); configured.mock.restore();
  });
});
