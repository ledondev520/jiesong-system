/** One seller identity over real HTTP/SQLite: canonical company keys win, the legacy invoiceTitleInfo is a read-only alias that
 *  only fills empty fields, writes to it are refused, bank data (incl. legacy text) stays ADMIN/FINANCE-only, the 催票 text and the
 *  quotation/PI seller block read the same identity. Synthetic data only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('seller identity: canonical + legacy alias, role-scoped bank, refused legacy writes, shared by quote export', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-seller-identity-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-seller-identity-never-for-production';
  const pricingFile = path.join(directory, 'pricing.json');
  fs.writeFileSync(pricingFile, JSON.stringify({ exchangeRate: 6.72, exchangeAdjustment: -0.2, defaultMarkup: 0.3, categoryMarkups: [] }), { mode: 0o600 });
  process.env.JIESONG_PRICING_CONFIG = pricingFile;
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
    const user = await db.user.create({ data: { username: `synthetic-seller-${role}`, password: 'test-only-unused-hash', name: `合成${role}`, role } });
    tokens[role] = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  }
  const app = require('../app');
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, body, role = 'ADMIN') => {
    const response = await fetch(base + url, {
      method,
      headers: { authorization: `Bearer ${tokens[role]}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, headers: response.headers, text: await response.text() };
  };
  const json = (r) => JSON.parse(r.text);
  const identity = async (role) => { const r = await call('GET', '/system/seller-identity', undefined, role); assert.equal(r.status, 200, role); return json(r).data; };

  // Empty: nothing invented.
  assert.deepEqual(await identity('ADMIN'), { name: '', address: '', phone: '', taxId: '', bank: '', legacyFilled: [], invoiceTitleText: '' });

  // Legacy row only (existing data from before the merge): every field it can express is filled from it, flagged as legacy.
  const LEGACY = '公司名称：合成旧抬头公司\n纳税人识别号：91-LEGACY-001\n地址电话：1 Legacy Road 555 0100\n开户行及账号：Legacy Bank 000-LEGACY-ACCT\n备注：这行不识别';
  await db.systemConfig.create({ data: { key: 'invoiceTitleInfo', value: JSON.stringify(LEGACY) } });
  const admin = await identity('ADMIN');
  assert.equal(admin.name, '合成旧抬头公司');
  assert.equal(admin.taxId, '91-LEGACY-001');
  assert.equal(admin.address, '1 Legacy Road 555 0100');
  assert.equal(admin.bank, 'Legacy Bank 000-LEGACY-ACCT');
  assert.deepEqual(admin.legacyFilled.sort(), ['address', 'bank', 'name', 'taxId']);
  assert.match(admin.invoiceTitleText, /公司名称：合成旧抬头公司\n纳税人识别号：91-LEGACY-001\n地址电话：1 Legacy Road 555 0100\n开户行及账号：Legacy Bank/);
  // Roles without bank access never see bank data — neither the canonical key nor the legacy bank line / raw text.
  for (const role of ['SALES', 'PURCHASE', 'WAREHOUSE', 'BOSS']) {
    const seen = await call('GET', '/system/seller-identity', undefined, role);
    assert.equal(seen.status, 200, role);
    assert.equal(seen.text.includes('LEGACY-ACCT'), false, role);
    assert.equal(json(seen).data.bank, '', role);
    assert.equal(json(seen).data.name, '合成旧抬头公司', role);
  }
  assert.equal((await identity('FINANCE')).bank, 'Legacy Bank 000-LEGACY-ACCT');
  // The flat settings list hides the legacy text (may contain bank lines) from everyone but ADMIN/FINANCE.
  for (const role of ['SALES', 'PURCHASE', 'WAREHOUSE']) assert.equal(Object.hasOwn(json(await call('GET', '/system/configs', undefined, role)).data, 'invoiceTitleInfo'), false, role);
  for (const role of ['ADMIN', 'FINANCE']) assert.equal(json(await call('GET', '/system/configs', undefined, role)).data.invoiceTitleInfo, LEGACY, role);

  // Canonical keys win field by field; the alias only fills what is still empty.
  assert.equal((await call('PUT', '/system/configs/companyName', { value: 'Synthetic Canonical Co' })).status, 200);
  assert.equal((await call('PUT', '/system/configs/companyPhone', { value: '+1 555 0199' })).status, 200);
  const merged = await identity('ADMIN');
  assert.equal(merged.name, 'Synthetic Canonical Co');
  assert.equal(merged.phone, '+1 555 0199');
  assert.equal(merged.taxId, '91-LEGACY-001');
  assert.deepEqual(merged.legacyFilled.sort(), ['address', 'bank', 'taxId']);
  assert.match(merged.invoiceTitleText, /^公司名称：Synthetic Canonical Co\n纳税人识别号：91-LEGACY-001\n地址电话：1 Legacy Road 555 0100 \+1 555 0199\n/);

  // Writes to the legacy key are refused for everyone (ADMIN too), and nothing changes.
  for (const role of ['ADMIN', 'SALES']) assert.notEqual((await call('PUT', '/system/configs/invoiceTitleInfo', { value: 'new' }, role)).status, 200, role);
  assert.equal((await call('PUT', '/system/configs/invoiceTitleInfo', { value: 'new' })).status, 400);
  assert.equal(JSON.parse((await db.systemConfig.findUnique({ where: { key: 'invoiceTitleInfo' } })).value), LEGACY);

  // The quotation/PI seller block reads the same identity (canonical name, legacy-filled address/bank).
  const { loadSeller, buildQuoteDocument } = require('../services/quoteExportService');
  const doc = buildQuoteDocument({ quoteNo: 'QT-SELLER', status: 'DRAFT', currency: 'USD', incoterm: 'FOB', createdAt: new Date(), items: [] }, await loadSeller());
  assert.equal(doc.header[0][1], 'Synthetic Canonical Co\n1 Legacy Road 555 0100\n+1 555 0199');
  assert.equal(doc.bankDetails, 'Legacy Bank 000-LEGACY-ACCT');
});
