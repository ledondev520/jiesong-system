/** 真实 HTTP/SQLite：出口合同原子创建、并发/断线重试与模板回滚；只使用临时合成数据。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite：销售表头明细原子创建，同一请求重试不产生空单或重复合同', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-sales-create-test-'));
  fs.chmodSync(directory, 0o700);
  const dbFile = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-sales-creation-secret-never-production';
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
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  const tokens = [];
  const userIds = [];
  for (const suffix of ['one', 'two']) {
    const user = await db.user.create({ data: { username: `synthetic-create-${suffix}`, password: 'test-only-unused-hash', name: '合成销售', role: 'SALES' } });
    userIds.push(user.id);
    tokens.push(jwt.sign({ userId: user.id }, config.jwt.secret));
  }
  const product = await db.product.create({ data: { customsName: 'SYNTHETIC WIDGET' } });
  const port = await db.port.create({ data: { name: '合成港口', code: 'QACREATE' } });
  const store = await db.store.create({ data: { name: '合成门店', portId: port.id } });
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, body, { key, actor = 0, expected = 201 } = {}) => {
    const response = await fetch(base + url, { method, headers: { authorization: `Bearer ${tokens[actor]}`, 'content-type': 'application/json', ...(key ? { 'X-Idempotency-Key': key } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${url}: ${result.message}`);
    return result.data;
  };
  const item = { productId: product.id, storeId: store.id, quantity: 2, unit: '件', costPrice: 10, sellingPrice: 3 };
  const payload = { exchangeRate: 7.2, signedAt: '2026-10-01T00:00:00.000Z', note: '合成创建', items: [item, { ...item, quantity: 4 }] };
  const counts = async () => ({ contracts: await db.salesContract.count(), items: await db.salesItem.count(), requests: await db.operationLog.count({ where: { entity: 'SalesCreationRequest' } }), inventories: await db.inventory.count() });

  // 无效第二行不能留下第一行、表头或请求标记；修正后可复用失败请求键。
  const empty = await counts();
  await call('POST', '/sales', { ...payload, items: [item, { ...item, productId: 'synthetic-missing' }] }, { key: 'synthetic-retry', expected: 400 });
  assert.deepEqual(await counts(), empty);
  for (const patch of [{ quantity: 0 }, { costPrice: -1 }, { sellingPrice: null }, { storeId: '' }]) {
    await call('POST', '/sales', { ...payload, items: [{ ...item, ...patch }] }, { key: 'synthetic-invalid', expected: 400 });
    assert.deepEqual(await counts(), empty);
  }
  const created = await call('POST', '/sales', payload, { key: 'synthetic-retry' });
  assert.equal(created.items.length, 2);
  assert.equal(created.totalAmount, 18);
  assert.equal(created.idempotentReplay, false);
  const committed = await counts();
  // 丢失成功响应后重放相同请求，直接返回同一合同及原子创建的明细。
  const replay = await call('POST', '/sales', payload, { key: 'synthetic-retry' });
  assert.equal(replay.id, created.id);
  assert.equal(replay.idempotentReplay, true);
  assert.deepEqual(await counts(), committed);
  await call('POST', '/sales', { ...payload, note: '不同内容' }, { key: 'synthetic-retry', expected: 409 });
  assert.deepEqual(await counts(), committed);

  const concurrent = await Promise.all(Array.from({ length: 4 }, () => call('POST', '/sales', { ...payload, contractNo: 'SYNTHETIC-CONCURRENT' }, { key: 'synthetic-concurrent' })));
  assert.equal(new Set(concurrent.map(row => row.id)).size, 1);
  assert.equal(await db.salesItem.count({ where: { salesContractId: concurrent[0].id } }), 2);
  const otherActor = await call('POST', '/sales', payload, { key: 'synthetic-retry', actor: 1 });
  assert.notEqual(otherActor.id, created.id, '请求键必须按已认证操作者隔离');
  const custom = await call('POST', '/sales', { ...payload, contractNo: 'SYNTHETIC-CUSTOM' }, { key: 'synthetic-custom' });
  assert.equal(custom.contractNo, 'SYNTHETIC-CUSTOM');
  const beforeConflict = await counts();
  await call('POST', '/sales', { ...payload, contractNo: custom.contractNo }, { key: 'synthetic-conflict', expected: 409 });
  assert.deepEqual(await counts(), beforeConflict, '唯一编号冲突也必须回滚请求标记');

  const header = await call('POST', '/sales', { exchangeRate: 7.2 });
  assert.equal(await db.salesItem.count({ where: { salesContractId: header.id } }), 0, '保留已有仅建表头的调用');
  const template = await db.contractTemplate.create({ data: { name: '合成销售模板', type: 'SALES', createdBy: userIds[0], items: JSON.stringify([item, { ...item, productId: 'synthetic-missing' }]) } });
  const beforeTemplate = await counts();
  await call('POST', `/sales?templateId=${template.id}`, { exchangeRate: 7.2 }, { key: 'synthetic-template', expected: 400 });
  assert.deepEqual(await counts(), beforeTemplate);
  await db.contractTemplate.update({ where: { id: template.id }, data: { items: JSON.stringify([item]) } });
  const fromTemplate = await call('POST', `/sales?templateId=${template.id}`, { exchangeRate: 7.2 }, { key: 'synthetic-template' });
  assert.equal(fromTemplate.items.length, 1);
  assert.equal(fromTemplate.totalAmount, 6);
  // 通用日志即使被维护任务清理，也不能让相同请求创建重复合同；缺证据时明确拒绝。
  const marker = await db.operationLog.findFirst({ where: { entity: 'SalesCreationRequest', entityId: custom.id } });
  assert.equal(marker.action, 'IDEMPOTENCY');
  assert.deepEqual(Object.keys(JSON.parse(marker.newValue)), ['requestHash']);
  await db.operationLog.delete({ where: { id: marker.id } });
  const afterCleanup = await counts();
  await call('POST', '/sales', { ...payload, contractNo: 'SYNTHETIC-CUSTOM' }, { key: 'synthetic-custom', expected: 409 });
  assert.deepEqual(await counts(), afterCleanup);
  await call('DELETE', `/sales/${created.id}`, undefined, { expected: 200 });
  const afterDeletion = await counts();
  await call('POST', '/sales', payload, { key: 'synthetic-retry', expected: 409 });
  assert.deepEqual(await counts(), afterDeletion, '已删除合同的旧请求不能自动复活或另建一单');
});
