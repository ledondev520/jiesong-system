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

// 汇率只来自唯一报价配置：私有临时文件，不读仓库配置。
const pricingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-context-pricing-'));
process.env.JIESONG_PRICING_CONFIG = path.join(pricingDir, 'pricing.json');
fs.writeFileSync(process.env.JIESONG_PRICING_CONFIG, JSON.stringify({
  exchangeRate: 6.72, exchangeAdjustment: -0.2, defaultMarkup: 0.3, categoryMarkups: [], roundUpTo: 5,
}), { mode: 0o600 });
test.after(() => fs.rmSync(pricingDir, { recursive: true, force: true }));

function loadContext(db) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('./contextService'), 'utf8'), {
    module, exports: module.exports, console: { error() {} },
    // 应付汇总是共享的纯口径模块，其余依赖仍由桩/真实库替代。
    // 应付汇总与报价配置都是共享的真实模块，其余依赖仍由桩/真实库替代。
    require: (name) => (name === '../payablesService' ? require('../payablesService')
      : name === '../exportPricing' ? require('../exportPricing') : db),
  });
  return module.exports;
}

const stubDb = () => ({
  product: { count: async () => 1 },
  supplier: { count: async () => 1 },
  purchaseContract: { count: async () => 1, findMany: async () => [{ id: 'p1', status: 'SIGNED', totalAmount: 100, paidAmount: 20 }, { id: 'p2', status: 'DRAFT', totalAmount: 500, paidAmount: 0 }] },
  salesContract: { count: async () => 1, findMany: async () => [], aggregate: async () => ({ _sum: { totalAmount: 200, receivedAmount: 50 } }) },
  // 旧 SystemConfig.exchangeRate 即使存在也不得进入上下文
  systemConfig: { findUnique: async () => ({ value: '{"rate":99,"buffer":0}' }) },
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
    await db.systemConfig.create({ data: { key: 'exchangeRate', value: '{"rate":99,"buffer":0}' } });
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

test('AI 财务概况应付只含已生效合同，草稿不计', async () => {
  const context = await loadContext(stubDb()).getDbContext('价格和应收应付');
  assert.match(context, /应付总额¥100, 已付¥20, 待付¥80/);
});

test('AI 上下文汇率来自唯一报价配置，忽略遗留 SystemConfig.exchangeRate，并继续展示财务概况', async () => {
  const context = await loadContext(stubDb()).getDbContext('价格和应收应付');
  assert.match(context, /【汇率配置】现汇6\.72, 调整-0\.2, 报价汇率6\.52, 默认加价0\.3, 单价取整步长5（低于步长向上取整到整美元，达到步长取最近的倍数）/);
  assert.doesNotMatch(context, /99/);
  assert.match(context, /财务概况/);
});
