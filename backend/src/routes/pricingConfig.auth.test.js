const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const defaults = require('../../../config/pricing.json');

test('real authenticated app enforces current database role for pricing file changes without business writes', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-real-auth-'));
  fs.chmodSync(dir, 0o700);
  const root = path.resolve(__dirname, '../../..');
  const runtime = path.join(dir, 'runtime');
  fs.cpSync(path.join(root, 'backend/src'), path.join(runtime, 'backend/src'), { recursive: true });
  fs.mkdirSync(path.join(runtime, 'config'), { recursive: true });
  for (const name of ['pricing.json', 'pricing.schema.json']) {
    fs.copyFileSync(path.join(root, 'config', name), path.join(runtime, 'config', name));
  }
  fs.symlinkSync(path.join(root, 'backend/node_modules'), path.join(runtime, 'backend/node_modules'), 'dir');
  assert.equal(fs.existsSync(path.join(runtime, 'backend/.env')), false);
  const database = path.join(dir, 'synthetic.db');
  const configFile = path.join(dir, 'pricing.json');
  fs.writeFileSync(configFile, JSON.stringify(defaults), { mode: 0o600 });
  Object.assign(process.env, {
    NODE_ENV: 'test', DATABASE_URL: `file:${database}`, JIESONG_PRICING_CONFIG: configFile,
    JWT_SECRET: 'test-only-pricing-auth-secret-never-production', UPLOAD_DIR: path.join(dir, 'uploads'),
  });
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort().filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os;os.umask(0o077);c=sqlite3.connect(sys.argv[1]);c.executescript(sys.stdin.read());c.close()', database], { input: ddl });
  const db = require(path.join(runtime, 'backend/src/utils/prisma'));
  let server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await db.$disconnect(); fs.rmSync(dir, { recursive: true });
  });
  const roles = ['ADMIN', 'BOSS', 'FINANCE', 'SALES', 'PURCHASE', 'WAREHOUSE'];
  for (const role of roles) await db.user.create({ data: { id: `synthetic-${role}`, username: `synthetic-pricing-${role}`, name: 'Synthetic pricing tester', role, password: 'test-only-unused-hash' } });
  const jwt = require('jsonwebtoken');
  const token = role => jwt.sign({ userId: `synthetic-${role}`, role: 'ADMIN' }, process.env.JWT_SECRET);
  const tokens = Object.fromEntries(roles.map(role => [role, token(role)]));
  const app = require(path.join(runtime, 'backend/src/app'));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1/system/pricing-config`;
  const receipts = [];
  const send = async (method, role, body) => {
    const response = await fetch(base, { method, headers: { 'content-type': 'application/json', ...(role ? { authorization: `Bearer ${tokens[role]}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const payload = await response.json();
    receipts.push({ method, role: role || 'anonymous', status: response.status });
    return { status: response.status, payload };
  };
  for (const method of ['GET', 'PUT']) {
    assert.equal((await send(method)).status, 401);
    for (const role of roles.slice(1)) assert.equal((await send(method, role)).status, 403);
  }
  const initial = (await send('GET', 'ADMIN')).payload.data;
  const next = { ...defaults, exchangeAdjustment: -0.1 };
  assert.equal((await send('PUT', 'ADMIN', { config: next, revision: initial.revision })).status, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(configFile)), next);
  assert.deepEqual((await send('GET', 'ADMIN')).payload.data.config, next);
  await db.user.update({ where: { id: 'synthetic-ADMIN' }, data: { role: 'SALES' } });
  assert.equal((await send('PUT', 'ADMIN', { config: defaults, revision: initial.revision })).status, 403);
  assert.deepEqual(JSON.parse(fs.readFileSync(configFile)), next);
  const counts = JSON.parse(execFileSync('python3', ['-c', `
import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
tables=[row[0] for row in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
print(json.dumps({name:c.execute('SELECT COUNT(*) FROM "'+name+'"').fetchone()[0] for name in tables if name!='users'}))
`, database], { encoding: 'utf8' }));
  assert.equal(counts.system_configs, 0);
  assert.equal(counts.operation_logs, 0);
  assert.ok(Object.entries(counts).filter(([name]) => name !== 'password_reset_lock').every(([, count]) => count === 0));
  if (process.env.JIESONG_TEST_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.JIESONG_TEST_EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.JIESONG_TEST_EVIDENCE_DIR, 'pricing-real-auth.json'), JSON.stringify({ requests: receipts, configReadback: next, nonUserTableCounts: counts }, null, 2));
  }
});
