/**
 * Input: patrolService
 * Output: 巡检服务核心逻辑测试
 * Pos: 验证巡检规则分类、严重级别和结果结构
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PATROL_CATEGORIES,
  SEVERITY,
  AUTO_FIX_POLICY,
} = require('./patrolService');

describe('patrolService', () => {
  it('导出完整的常量枚举', () => {
    assert.deepStrictEqual(PATROL_CATEGORIES, { BUSINESS: 'BUSINESS', SYSTEM: 'SYSTEM' });
    assert.deepStrictEqual(SEVERITY, { INFO: 'INFO', WARNING: 'WARNING', CRITICAL: 'CRITICAL' });
    assert.deepStrictEqual(AUTO_FIX_POLICY, {
      AUTO: 'AUTO',
      CONFIRM: 'CONFIRM',
      REPORT_ONLY: 'REPORT_ONLY',
    });
  });

  it('模块可正常加载并导出所有函数', () => {
    const service = require('./patrolService');
    assert.equal(typeof service.runBusinessPatrol, 'function');
    assert.equal(typeof service.runSystemPatrol, 'function');
    assert.equal(typeof service.persistPatrolFindings, 'function');
    assert.equal(typeof service.runFullPatrol, 'function');
  });

  it('巡检通知接收人使用当前 User Interface 的启用字段', () => {
    const source = fs.readFileSync(path.join(__dirname, 'patrolService.js'), 'utf8');

    assert.match(source, /where:\s*\{\s*role:\s*'ADMIN',\s*isActive:\s*true\s*\}/);
    assert.doesNotMatch(source, /status:\s*'active'/);
  });

  it('系统巡检操作日志使用 OperationLog 当前 Interface', () => {
    const source = fs.readFileSync(path.join(__dirname, 'patrolService.js'), 'utf8');

    assert.match(source, /actorType:\s*'SYSTEM'/);
    assert.doesNotMatch(source, /userId:\s*'system'/);
    assert.doesNotMatch(source, /detail:\s*JSON\.stringify/);
  });
});

const vm = require('node:vm');
const loadPatrol = (prisma, finance = {}) => {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('./patrolService'), 'utf8'), {
    module, exports: module.exports, Date, console,
    require: (name) => name === '../utils/prisma' ? prisma
      : name === './financeService' ? finance : require(name),
  });
  return module.exports;
};

it('业务巡检使用真实销售模型、发运时间与已收金额，沿用30天逾期口径', async () => {
  const queries = [];
  const service = loadPatrol({ salesContract: { findMany: async (query) => {
    queries.push(query);
    return query.where.customsDeclarations
      ? [{ id: 'synthetic-sales', contractNo: 'TEST-ONLY' }]
      : [{ id: 'synthetic-sales', contractNo: 'TEST-ONLY', totalAmount: 100, receivedAmount: 110 }];
  } } }, { getOverdueReceivables: async (...args) => {
    assert.equal(args.length, 0);
    return [{ id: 'synthetic-sales', contractNo: 'TEST-ONLY', unreceived: 50, overdueDays: 15 }];
  } });
  const findings = await service.runBusinessPatrol();
  assert.deepEqual(Array.from(findings, (f) => f.rule), ['OVERDUE_RECEIVABLE', 'SHIPPED_NO_DECLARATION', 'OVERPAYMENT']);
  assert.ok(findings.every((f) => f.entityType === 'SalesContract'));
  assert.match(findings[0].detail, /逾期 15 天/);
  assert.match(findings[0].detail, /50.00/);
  assert.ok(queries[0].where.shippedAt.lt instanceof Date);
  assert.equal(queries[0].where.updatedAt, undefined);
  assert.equal(queries[1].select.receivedAmount, true);
});

it('同一巡检告警按管理员去重，兼容历史无metadata通知，已读24小时后可再提醒', async () => {
  const rows = [{ userId: 'a', title: '汇率配置过期', type: 'PATROL_ALERT', isRead: false, createdAt: new Date(0) }];
  const service = loadPatrol({
    user: { findMany: async () => [{ id: 'a' }, { id: 'b' }] },
    notification: {
      findMany: async ({ where }) => {
        assert.equal(where.type, 'PATROL_ALERT');
        const cutoff = where.OR.find((c) => c.createdAt).createdAt.gte;
        return rows.filter((r) => !r.isRead || r.createdAt >= cutoff);
      },
      createMany: async ({ data }) => { rows.push(...data.map((r) => ({ ...r, isRead: false, createdAt: new Date() }))); },
    },
    operationLog: { create: async () => {} },
  });
  const finding = { title: '汇率配置过期', detail: '已过期', rule: 'STALE_EXCHANGE_RATE', severity: 'WARNING' };
  assert.equal((await service.persistPatrolFindings([finding, finding])).notified, 1);
  assert.equal((await service.persistPatrolFindings([{ ...finding, detail: '过期天数增加' }])).notified, 0);
  rows.forEach((r) => { r.isRead = true; r.createdAt = new Date(); });
  assert.equal((await service.persistPatrolFindings([finding])).notified, 0);
  rows.forEach((r) => { r.createdAt = new Date(0); });
  assert.equal((await service.persistPatrolFindings([finding])).notified, 2);
  assert.equal((await service.persistPatrolFindings([{ ...finding, severity: 'INFO' }])).notified, 0);
});

it('业务查询失败仍产生独立巡检失败告警，不掩盖故障', async () => {
  const service = loadPatrol({ salesContract: { findMany: async () => { throw new Error('test database unavailable'); } } }, {
    getOverdueReceivables: async () => { throw new Error('test database unavailable'); },
  });
  const findings = await service.runBusinessPatrol();
  assert.equal(findings.length, 3);
  assert.ok(findings.every((f) => f.rule === 'PATROL_ERROR'));
});

it('真实Prisma空库验证销售巡检与通知去重，不触碰业务数据库', async () => {
  const { execFileSync } = require('node:child_process');
  const { PrismaClient } = require('@prisma/client');
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'jiesong-patrol-'));
  fs.chmodSync(dir, 0o700);
  const dbPath = path.join(dir, 'test.db');
  const databaseUrl = `file:${dbPath}`;
  const root = path.resolve(__dirname, '../..');
  let db;
  try {
    const ddl = execFileSync(path.join(root, 'node_modules/.bin/prisma'), [
      'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(root, 'prisma/schema.prisma'), '--script',
    ], { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8' });
    execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', dbPath], { input: ddl });
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const finance = { exports: {} };
    vm.runInNewContext(fs.readFileSync(require.resolve('./financeService'), 'utf8'), {
      module: finance, exports: finance.exports, Date,
      require: (name) => name === '../utils/prisma' ? db : require(name),
    });
    const service = loadPatrol(db, finance.exports);
    const oldDate = new Date(Date.now() - 50 * 86400000);
    const base = { exchangeRate: 7, shippedAt: oldDate, status: 'ARRIVED', totalAmount: 100 };
    await db.salesContract.create({ data: { ...base, contractNo: 'TEST-ONLY-OVERDUE', receivedAmount: 20 } });
    await db.salesContract.create({ data: { ...base, contractNo: 'TEST-ONLY-OVERPAID', receivedAmount: 120 } });
    await db.salesContract.create({ data: { ...base, contractNo: 'TEST-ONLY-CANCELLED', status: 'CANCELLED', receivedAmount: 120 } });
    const findings = await service.runBusinessPatrol();
    assert.equal(findings.filter((f) => f.rule === 'PATROL_ERROR').length, 0);
    assert.equal(findings.filter((f) => f.rule === 'OVERDUE_RECEIVABLE').length, 1);
    assert.equal(findings.filter((f) => f.rule === 'SHIPPED_NO_DECLARATION').length, 2);
    assert.equal(findings.filter((f) => f.rule === 'OVERPAYMENT').length, 1);
    await db.user.create({ data: { username: 'test-only-admin', password: 'non-login-synthetic-value', name: '合成测试', role: 'ADMIN' } });
    assert.equal((await service.persistPatrolFindings(findings)).notified, 4);
    assert.equal((await service.persistPatrolFindings(findings)).notified, 0);
    assert.equal(await db.notification.count(), 4);
  } finally {
    if (db) await db.$disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
