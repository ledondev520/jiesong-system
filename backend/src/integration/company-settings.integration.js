/** Real HTTP/RBAC/SQLite coverage for 公司信息 (companyName / companyAddress / companyPhone / companyTaxId / companyBankInfo): ADMIN-only writes, validated, role-scoped reads, audit never carries the bank text. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: company settings are empty by default, ADMIN-written and validated, bank text is ADMIN/FINANCE-only on read and absent from audit values', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-company-settings-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-company-settings-never-for-production';
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter((name) => fs.statSync(path.join(migrations, name)).isDirectory())
    .map((name) => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl });
  fs.chmodSync(database, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const tokens = {};
  for (const role of ['ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'WAREHOUSE', 'BOSS']) {
    const user = await db.user.create({ data: { username: `synthetic-company-${role}`, password: 'test-only-unused-hash', name: `合成${role}`, role } });
    tokens[role] = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  }
  const app = require('../app');
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1/system`;
  const call = async (method, url, body, role = 'ADMIN') => {
    const response = await fetch(base + url, {
      method,
      headers: { ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, ...(await response.json()) };
  };
  const put = (key, value, role) => call('PUT', `/configs/${key}`, { value }, role);
  const ACCOUNT = '6200-1234-5678-90';
  const BANK = `Bank: Synthetic Bank\nAccount name: Synthetic Export Co\nAccount: ${ACCOUNT}\nSWIFT: SYNTHGBXX`;

  // Empty by default: nothing is invented.
  for (const role of ['ADMIN', 'SALES']) {
    const flat = await call('GET', '/configs', undefined, role);
    assert.equal(flat.status, 200);
    for (const key of ['companyName', 'companyAddress', 'companyBankInfo']) assert.equal(Object.hasOwn(flat.data, key), false, `${role} ${key}`);
  }

  // Writes: ADMIN only.
  for (const role of ['SALES', 'PURCHASE', 'FINANCE', 'WAREHOUSE', 'BOSS']) assert.equal((await put('companyName', 'Nope', role)).status, 403, role);
  assert.equal((await put('companyName', 'Nope', 'ANONYMOUS')).status, 401);

  // Validation: bad values change nothing.
  for (const [key, value] of [['companyName', 5], ['companyName', 'a\nb'], ['companyName', 'x'.repeat(201)], ['companyAddress', 'a\tb'], ['companyBankInfo', null], ['companyBankInfo', 'x'.repeat(1001)], ['companyBankInfo', Array(13).fill('l').join('\n')]]) {
    assert.equal((await put(key, value)).status, 400, `${key} ${String(JSON.stringify(value)).slice(0, 30)}`);
  }
  assert.equal(await db.systemConfig.count({ where: { key: { in: ['companyName', 'companyAddress', 'companyBankInfo'] } } }), 0);

  // Phone / tax id (merged in from the old invoice title): one line, tax id restricted to letters, digits, spaces and hyphens.
  for (const [key, value] of [['companyPhone', 'a\nb'], ['companyPhone', 'x'.repeat(51)], ['companyTaxId', '91-ABC;DROP'], ['companyTaxId', 'x'.repeat(51)], ['companyTaxId', 5]]) {
    assert.equal((await put(key, value)).status, 400, `${key} ${String(JSON.stringify(value)).slice(0, 30)}`);
  }
  assert.equal((await put('companyPhone', ' +1  555 0100 ')).status, 200);
  assert.equal((await put('companyTaxId', '91-3100  ABC')).status, 200);
  assert.equal(JSON.parse((await db.systemConfig.findUnique({ where: { key: 'companyPhone' } })).value), '+1 555 0100');
  assert.equal(JSON.parse((await db.systemConfig.findUnique({ where: { key: 'companyTaxId' } })).value), '91-3100 ABC');
  await db.systemConfig.deleteMany({ where: { key: { in: ['companyPhone', 'companyTaxId'] } } });

  // Valid writes are normalised.
  assert.equal((await put('companyName', '  Synthetic   Export Co ')).status, 200);
  assert.equal((await put('companyAddress', '1 Synthetic Road \r\nCity')).status, 200);
  assert.equal((await put('companyBankInfo', BANK)).status, 200);
  assert.equal(JSON.parse((await db.systemConfig.findUnique({ where: { key: 'companyName' } })).value), 'Synthetic Export Co');
  assert.equal(JSON.parse((await db.systemConfig.findUnique({ where: { key: 'companyAddress' } })).value), '1 Synthetic Road\nCity');

  // Reads through the flat list: name/address for every role, the bank text only for ADMIN and FINANCE.
  // BOSS has no access to the settings list at all (not on the read whitelist).
  assert.equal((await call('GET', '/configs', undefined, 'BOSS')).status, 403);
  for (const role of ['ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'WAREHOUSE']) {
    const flat = (await call('GET', '/configs', undefined, role)).data;
    assert.equal(flat.companyName, 'Synthetic Export Co', role);
    assert.equal(flat.companyAddress, '1 Synthetic Road\nCity', role);
    if (['ADMIN', 'FINANCE'].includes(role)) assert.equal(flat.companyBankInfo, BANK, role);
    else assert.equal(Object.hasOwn(flat, 'companyBankInfo'), false, role);
  }

  // Clearing is explicit: an empty string empties the value (the print side then leaves the line blank).
  assert.equal((await put('companyAddress', '')).status, 200);
  assert.equal((await call('GET', '/configs', undefined, 'SALES')).data.companyAddress, '');

  // Audit rows keep who/when for the bank key but never its text.
  const deadline = Date.now() + 5000;
  let logs = [];
  while (Date.now() < deadline) {
    logs = await db.operationLog.findMany({ where: { entity: 'SystemConfig' } });
    if (logs.length >= 4) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(logs.length >= 1, 'config writes are audited');
  const serialized = JSON.stringify(logs);
  for (const secret of [ACCOUNT, 'Synthetic Bank', 'SYNTHGBXX']) assert.equal(serialized.includes(secret), false, `audit must not contain ${secret}`);
}); 
