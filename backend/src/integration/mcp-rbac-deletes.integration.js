/** Real HTTP/SQLite role matrix for /mcp writes and purchase/supplier DELETE; synthetic users and records only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: MCP write roles, actor attribution, purchase/supplier delete guards', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-mcp-rbac-'));
  fs.chmodSync(directory, 0o700);
  const dbFile = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-mcp-rbac-secret-never-production';
  let db, server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.resolve(__dirname, '../../prisma/schema.prisma'), '--script'], { encoding: 'utf8', timeout: 30000 });
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', dbFile], { input: ddl });
  fs.chmodSync(dbFile, 0o600);
  db = require('../utils/prisma');
  // Order creation needs exactly one active customer (DATA-MODEL §2.4).
  await db.customer.create({ data: { name: '合成客户' } });
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  const users = {};
  for (const role of ['ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'WAREHOUSE', 'BOSS']) {
    const user = await db.user.create({ data: { username: `synthetic-mcp-${role}`, password: 'test-only-unused-hash', name: `Synthetic ${role}`, role, isActive: true } });
    users[role] = { id: user.id, token: jwt.sign({ userId: user.id, role: 'ADMIN' }, config.jwt.secret) };
  }
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const send = async (method, url, role, body) => {
    const response = await fetch(origin + (url === '/mcp' ? url : '/api/v1' + url), { method, headers: { authorization: `Bearer ${users[role].token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, json: await response.json().catch(() => null) };
  };
  const mcp = (role, name, args) => send('POST', '/mcp', role, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const ALL = ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE', 'BOSS'];

  await t.test('MCP write tools allow exactly the roles the REST create routes allow, and log the actor', async () => {
    for (const role of ALL) {
      const rest = await send('POST', '/suppliers', role, { name: `rest-${role}` });
      const viaMcp = await mcp(role, 'create_supplier', { name: `mcp-${role}` });
      assert.equal(viaMcp.status === 403, rest.status === 403, `${role}: MCP ${viaMcp.status} vs REST ${rest.status}`);
      if (viaMcp.status === 200) {
        assert.ok(viaMcp.json.result, `${role} MCP create_supplier result`);
        const row = await db.operationLog.findFirst({ where: { entity: 'Supplier', action: 'CREATE', userId: users[role].id } });
        assert.ok(row, `${role}: MCP write must be attributed in operation_logs`);
      }
    }
    assert.equal((await mcp('BOSS', 'create_supplier', { name: 'mcp-boss-denied' })).status, 403);
    assert.equal(await db.supplier.count({ where: { name: 'mcp-boss-denied' } }), 0);
    const reads = await Promise.all(ALL.map(role => mcp(role, 'search_entities', { query: 'mcp' })));
    assert.ok(reads.filter(r => r.status === 200).length >= 5);
  });

  await t.test('purchase delete: ADMIN/PURCHASE only, refused with 409 once payments, receipts, or invoice records exist', async () => {
    const supplier = await db.supplier.create({ data: { name: 'Synthetic delete supplier' } });
    const make = async data => db.purchaseContract.create({ data: { contractNo: `MCP-${Math.random().toString(36).slice(2, 9)}`, supplierId: supplier.id, ...data } });
    for (const role of ['SALES', 'FINANCE', 'WAREHOUSE', 'BOSS']) {
      const c = await make({});
      assert.equal((await send('DELETE', `/purchases/${c.id}`, role)).status, 403, role);
      assert.ok(await db.purchaseContract.findUnique({ where: { id: c.id } }));
    }
    const paid = await make({});
    await db.payment.create({ data: { type: 'EXPENSE', amount: 10, paymentDate: new Date(), purchaseContractId: paid.id } });
    const invoiced = await make({ invoiceNo: 'SYNTH-INV-1' });
    const matched = await make({});
    const batch = await db.financeDataBatch.create({ data: { type: 'INVOICE', fileName: 'synthetic.csv', recordCount: 1 } });
    await db.invoiceRecord.create({ data: { batchId: batch.id, seller: 's', invDate: '2026-01-01', amount: 1, tax: 0, total: 1, status: '正常', isPositive: '是', matchedContractId: matched.id, matchedContractType: 'PURCHASE' } });
    const received = await make({});
    await db.purchaseReceipt.create({ data: { purchaseContractId: received.id, requestId: 'synthetic-r', requestHash: 'synthetic-h', arrivedAt: new Date(), createdById: users.PURCHASE.id } });
    for (const c of [paid, invoiced, matched]) {
      assert.equal((await send('DELETE', `/purchases/${c.id}`, 'PURCHASE')).status, 409);
      assert.ok(await db.purchaseContract.findUnique({ where: { id: c.id } }));
    }
    assert.equal((await send('DELETE', `/purchases/${received.id}`, 'ADMIN')).status, 409);
    assert.equal(await db.payment.count({ where: { purchaseContractId: paid.id } }), 1);
    const clean = await make({});
    assert.equal((await send('DELETE', `/purchases/${clean.id}`, 'PURCHASE')).status, 200);
    assert.equal((await send('DELETE', `/purchases/${clean.id}`, 'ADMIN')).status, 404);
  });

  await t.test('supplier delete: ADMIN/PURCHASE only, refused with 409 while purchase contracts reference it', async () => {
    const used = await db.supplier.create({ data: { name: 'Synthetic used supplier' } });
    await db.purchaseContract.create({ data: { contractNo: 'MCP-USED-1', supplierId: used.id } });
    const unused = await db.supplier.create({ data: { name: 'Synthetic unused supplier' } });
    for (const role of ['SALES', 'FINANCE', 'WAREHOUSE', 'BOSS']) assert.equal((await send('DELETE', `/suppliers/${unused.id}`, role)).status, 403, role);
    assert.equal((await send('DELETE', `/suppliers/${used.id}`, 'PURCHASE')).status, 409);
    assert.equal((await db.supplier.findUnique({ where: { id: used.id } })).isActive, true);
    assert.equal((await send('DELETE', `/suppliers/${unused.id}`, 'PURCHASE')).status, 200);
    assert.equal((await db.supplier.findUnique({ where: { id: unused.id } })).isActive, false);
    assert.equal((await send('DELETE', '/suppliers/does-not-exist', 'ADMIN')).status, 404);
  });
});
