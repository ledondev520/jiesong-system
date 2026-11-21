const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('自动通知沿用逾期/低库存共享规则并链接可处理明细', async () => {
  const created = [];
  const client = {
    purchaseContract: { findMany: async () => [] },
    salesContract: { findMany: async () => [] },
    notification: { findFirst: async () => null, create: async ({ data }) => { created.push(data); return data; } },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('./notificationService'), 'utf8'), {
    module, exports: module.exports, Date,
    require: (name) => name === '../utils/prisma' ? client
      : name === './financeService' ? { getOverdueReceivables: async () => [{ contractNo: 'SYNTHETIC' }] }
      : { listLowStockAlerts: async () => ({ alerts: [{ productName: '合成商品' }] }) },
  });
  await module.exports.generateForUser('synthetic-user');
  assert.equal(created.length, 2);
  assert.match(created[0].title, /发运超过30天/);
  assert.equal(created[0].link, '/dashboard/payments?tab=receivable&overdue=true');
  assert.equal(created[1].link, '/dashboard/products?lowStock=true');
});

test('相同内容的未读摘要不跨天重复生成；内容变化才新建', async () => {
  const queries = [];
  const created = [];
  let existing = { id: 'old-unread' };
  const client = {
    purchaseContract: { findMany: async () => [{ id: 'p1', contractNo: 'SYN-P1' }] },
    salesContract: { findMany: async () => [] },
    notification: {
      findFirst: async (args) => { queries.push(args.where); return existing; },
      create: async ({ data }) => { created.push(data); return data; },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('./notificationService'), 'utf8'), {
    module, exports: module.exports, Date,
    require: (name) => name === '../utils/prisma' ? client
      : name === './financeService' ? { getOverdueReceivables: async () => [] }
      : { listLowStockAlerts: async () => ({ alerts: [] }) },
  });
  await module.exports.generateForUser('synthetic-user');
  assert.equal(created.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(queries[0].OR[1])), { isRead: false, title: '有待起草采购合同 1 份', content: 'SYN-P1' });

  existing = null;
  await module.exports.generateForUser('synthetic-user');
  assert.equal(created.length, 1);
});

test('list: 分页、unreadOnly 与标题/内容/类型搜索共用 where，unreadCount 不受筛选影响', async () => {
  const calls = { findMany: null, counts: [] };
  const client = {
    notification: {
      findMany: async (args) => { calls.findMany = args; return [{ id: 'n-1' }]; },
      count: async (args) => { calls.counts.push(args.where); return args.where.isRead === false && !args.where.OR ? 3 : 81; },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('./notificationService'), 'utf8'), {
    module, exports: module.exports, Date,
    require: (name) => name === '../utils/prisma' ? client : {},
  });
  const result = await module.exports.list('synthetic-user', { page: 4, pageSize: 20, keyword: '合成标题', unreadOnly: true });
  assert.equal(calls.findMany.skip, 60);
  assert.equal(calls.findMany.take, 20);
  // vm 上下文对象原型不同，经 JSON 往返后再比较
  assert.deepEqual(JSON.parse(JSON.stringify(calls.findMany.where)), {
    userId: 'synthetic-user',
    isRead: false,
    OR: ['title', 'content', 'type'].map((field) => ({ [field]: { contains: '合成标题' } })),
  });
  assert.equal(result.total, 81);
  assert.equal(result.unreadCount, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.counts[1])), { userId: 'synthetic-user', isRead: false });
});
