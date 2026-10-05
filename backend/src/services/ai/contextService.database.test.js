/**
 * Input: 当前Prisma结构、隔离SQLite库、AI上下文查询
 * Output: 真实关联校验与局部失败/汇率格式回归
 * Pos: AI数据库上下文回归；仅使用临时合成数据
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

function loadContext(db) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('./contextService'), 'utf8'), {
    module, exports: module.exports, console: { error() {} },
    require: () => db,
  });
  return module.exports;
}

const stubDb = () => ({
  product: { count: async () => 1 },
  supplier: { count: async () => 1 },
  purchaseContract: { count: async () => 1, aggregate: async () => ({ _sum: { totalAmount: 100, paidAmount: 20 } }) },
  salesContract: { count: async () => 1, findMany: async () => [], aggregate: async () => ({ _sum: { totalAmount: 200, receivedAmount: 50 } }) },
  systemConfig: { findUnique: async () => ({ value: '{"rate":7,"buffer":0}' }) },
});

test('AI各类上下文查询使用当前Prisma模型与关联', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-context-'));
  fs.chmodSync(dir, 0o700);
  const dbPath = path.join(dir, 'test.db');
  const databaseUrl = `file:${dbPath}`;
  const root = path.resolve(__dirname, '../../..');
  let db;
  try {
    const ddl = execFileSync(path.join(root, 'node_modules/.bin/prisma'), [
      'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(root, 'prisma/schema.prisma'), '--script',
    ], { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8' });
    execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', dbPath], { input: ddl });
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.salesContract.create({ data: { contractNo: 'EXP123', exchangeRate: 7, totalAmount: 100 } });
    await db.systemConfig.create({ data: { key: 'exchangeRate', value: '{"rate":7,"buffer":0}' } });
    const service = loadContext(db);
    for (const message of ['最近销售合同', 'EXP123合同', 'CG123合同', '25-001货柜', '最近货柜', '商品合成杯库存在哪', '合成供应商', '价格成本和应收应付']) {
      for (const task of service.buildContextQueries(message).tasks) {
        assert.notEqual(await task.query(), null, `${task.name} 查询不应被Prisma校验拒绝`);
      }
    }
    const context = await service.getDbContext('最近销售合同');
    assert.match(context, /最近销售合同/);
    assert.match(context, /EXP123/);
    assert.match(context, /\$100/);
    assert.doesNotMatch(context.split('【最近销售合同】')[1], /供应商|¥100/);
  } finally {
    if (db) await db.$disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('单个合同查询失败保留统计与其他上下文，并提示查询不可用', async () => {
  const db = stubDb();
  db.salesContract.findMany = async () => { throw new Error('synthetic database failure'); };
  const context = await loadContext(db).getDbContext('EXP123合同和应收');
  assert.match(context, /系统统计/);
  assert.match(context, /财务概况/);
  assert.match(context, /暂时无法读取/);
});

test('统计查询失败不阻断已成功的业务查询', async () => {
  const db = stubDb();
  db.product.count = async () => { throw new Error('synthetic database failure'); };
  db.salesContract.findMany = async () => [{ contractNo: 'EXP123', totalAmount: 100 }];
  const context = await loadContext(db).getDbContext('最近销售合同');
  assert.match(context, /EXP123/);
  assert.match(context, /暂时无法读取/);
});

test('字符串JSON汇率解析后继续展示财务概况，保留零缓冲', async () => {
  const context = await loadContext(stubDb()).getDbContext('价格和应收应付');
  assert.match(context, /当前汇率7, 缓冲值0/);
  assert.match(context, /财务概况/);
});
