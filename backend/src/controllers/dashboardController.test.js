/**
 * Input: dashboardController 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('dashboardController: 模块可正常加载并导出', () => {
  const mod = require('./dashboardController');
  assert.ok(mod !== undefined);
});

test('dashboardController: 导出包含 getBusinessOverview', () => {
  const mod = require('./dashboardController');
  assert.strictEqual(typeof mod.getBusinessOverview, 'function');
});

test('dashboardController: 导出专项单主线路查询', () => {
  const mod = require('./dashboardController');
  assert.strictEqual(typeof mod.getTradeWorkflows, 'function');
});

const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const localRequire = createRequire(__filename);
const runOverview = async (sales, query = {}) => {
  const calls = [];
  const client = {
    salesContract: {
      findMany: async (args) => { calls.push(args); return sales; },
      aggregate: async () => ({ _sum: { totalAmount: 100, receivedAmount: 0 } }),
      count: async (args) => { return 1; },
    },
    inventory: { count: async () => 2, groupBy: async (args) => { assert.equal(args.where.status, 'INBOUND'); return [{ productId: 'goods', _sum: { quantity: 13 } }]; } },
    $queryRaw: async () => [{ amount: 0, count: 1 }],
    purchaseContract: { aggregate: async () => ({ _sum: { totalAmount: 900, paidAmount: 500 } }), findMany: async () => [{ id: 'p1', contractNo: 'CG1', totalAmount: 900, paidAmount: 500 }] },
    product: { count: async () => 2, findMany: async () => [{ id: 'goods', customsName: '合成商品', lowStockThreshold: 10, inventories: [{ quantity: 6 }, { quantity: 7 }] }, { id: 'empty', customsName: '合成空库存', lowStockThreshold: 5, inventories: [] }] },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('./dashboardController'), 'utf8'), {
    module, exports: module.exports, Date, Map, Set,
    require: (name) => name === '../utils/prisma' ? client : name === '../services/inventoryAlertService' ? { listLowStockAlerts: (tx) => localRequire(name).listLowStockAlerts(tx) } : name === '../services/financeService'
      ? { getOverdueReceivables: async () => [{ id: 's1', unreceived: 25 }] } : localRequire(name),
  });
  let result; let failure;
  const res = { status() { return this; }, json(payload) { result = payload.data; } };
  await module.exports.getBusinessOverview({ query }, res, (error) => { failure = error; });
  if (failure) throw failure;
  return { result, calls };
};
const sale = { id: 's1', contractNo: 'EXP1', status: 'SHIPPED', totalAmount: 100, receivedAmount: 0, exchangeRate: 7, shippedAt: new Date('2026-09-10'), packingItems: [{ id: 'line', totalPrice: 100, purchaseCost: 500, purchaseContractNo: 'CG1', isOwnedByJiesong: true }], payments: [], taxRefunds: [] };

test('经营毛利统一CNY并仅匹配已发运商品成本，低库存按商品汇总、在途仅SHIPPED', async () => {
  const { result } = await runOverview([sale]);
  assert.equal(result.overview.totalSales, 700);
  assert.equal(result.overview.totalPurchases, 500);
  assert.equal(result.overview.grossProfit, 200);
  assert.equal(result.overview.marginReady, true);
  assert.equal(result.funds.overdueReceivable, 25);
  assert.equal(result.inventory.totalItems, 2);
  assert.equal(result.inventory.lowStockItems, 1);
});

test('缺失汇率/成本不伪装零利润，期间使用发运日期并拒绝反向区间', async () => {
  const { result, calls } = await runOverview([{ ...sale, exchangeRate: null }], { startDate: '2026-09-01', endDate: '2026-09-30' });
  assert.equal(result.overview.marginReady, false);
  assert.equal(result.overview.grossProfit, null);
  assert.equal(result.overview.totalSales, null);
  assert.equal(result.period.dateField, 'shippedAt');
  const excluded = await runOverview([sale], { startDate: '2026-10-01' });
  assert.equal(excluded.result.overview.contractCount, 0);
  await assert.rejects(runOverview([], { startDate: '2026-10-01', endDate: '2026-09-01' }), /不能晚于/);
});
