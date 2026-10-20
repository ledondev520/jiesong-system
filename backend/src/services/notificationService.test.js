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
