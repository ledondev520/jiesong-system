/**
 * Input: 出口合同/Agent 工具/搜索的角色参数，桩化 prisma
 * Output: A55 OD-3（WAREHOUSE 无合同总额与收款金额）与 A3（导出用 B87 金额口径）回归
 * Pos: 后端服务测试；路由层 403 见 routes/a55-role-gates.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');

const stubPrisma = (t, delegate, name, impl) => {
  const original = delegate[name];
  delegate[name] = impl;
  t.after(() => { delegate[name] = original; });
};

const CONTRACTS = [{
  id: 'c1', contractNo: 'EXP-1', status: 'CONFIRMED', totalAmount: 1234, receivedAmount: 321, exchangeRate: 7.1,
  signedAt: new Date('2026-01-01T00:00:00Z'), packingItems: [], createdAt: new Date(),
}];

test('OD-3：CSV 导出 WAREHOUSE 无金额列，其余角色保留', async (t) => {
  stubPrisma(t, prisma.salesContract, 'findMany', async () => CONTRACTS);
  const { exportData } = require('./exportService');
  const full = (await exportData('sales', {}, { includeMoney: true })).data;
  assert.match(full, /总金额\(USD\)/);
  assert.match(full, /1234/);
  const wh = (await exportData('sales', {}, { includeMoney: false })).data;
  assert.doesNotMatch(wh, /总金额|已收金额|未收金额/);
  assert.doesNotMatch(wh, /1234|321/);
  assert.match(wh, /EXP-1/);
  assert.match(wh, /CONFIRMED/);
});

test('OD-3：GetExportOverview 仅对 WAREHOUSE 去掉 totalAmount/receivedAmount', async (t) => {
  stubPrisma(t, prisma.salesContract, 'findMany', async () => CONTRACTS.map((c) => ({ ...c, port: null, customer: null })));
  stubPrisma(t, prisma.salesContract, 'count', async () => 1);
  const { buildToolPool } = require('./openAgentService');
  const run = async (role) => {
    const tool = buildToolPool((spec) => spec, [], [], undefined, role).find((x) => x.name === 'GetExportOverview');
    return JSON.parse(await tool.call({}, undefined)).contracts[0];
  };
  const wh = await run('SALES');
  assert.equal('totalAmount' in wh, false);
  assert.equal('receivedAmount' in wh, false);
  assert.equal(wh.status, 'CONFIRMED');
  const sales = await run('ADMIN');
  assert.equal(sales.totalAmount, 1234);
  assert.equal(sales.receivedAmount, 321);
});

test('OD-3：SearchEntities 出口合同副标题不含总额（WAREHOUSE），其他角色保留', async (t) => {
  stubPrisma(t, prisma.product, 'findMany', async () => []);
  stubPrisma(t, prisma.supplier, 'findMany', async () => []);
  stubPrisma(t, prisma.purchaseContract, 'findMany', async () => []);
  stubPrisma(t, prisma.salesContract, 'findMany', async () => [{ id: 'c1', contractNo: 'EXP-1', totalAmount: 1234 }]);
  const { buildToolPool } = require('./openAgentService');
  const run = async (role) => {
    const tool = buildToolPool((spec) => spec, [], [], undefined, role).find((x) => x.name === 'SearchEntities');
    return JSON.parse(await tool.call({ query: 'EXP' })).items[0];
  };
  assert.doesNotMatch((await run('SALES')).subtitle, /1,?234/);
  assert.match((await run('ADMIN')).subtitle, /1,?234/);
});

test('OD-3 字段核对：GetSupplierOverview 选择列与低库存预警没有金额/银行字段', async (t) => {
  let select;
  stubPrisma(t, prisma.supplier, 'findMany', async (args) => { select = args.select; return []; });
  const { buildToolPool } = require('./openAgentService');
  const tool = buildToolPool((spec) => spec, [], [], undefined, 'SALES').find((x) => x.name === 'GetSupplierOverview');
  await tool.call({});
  assert.ok(select);
  assert.deepEqual(Object.keys(select).filter((k) => /amount|price|cost|bank|paid/i.test(k)), []);
  const { buildLowStockAlerts } = require('./inventoryAlertService');
  const alerts = buildLowStockAlerts([{ id: 'p1', customsName: 'x', lowStockThreshold: 5 }], []);
  assert.ok(alerts.length === 1);
  assert.deepEqual(Object.keys(alerts[0]).filter((k) => /amount|price|cost|value/i.test(k)), []);
});

test('OD-3：GET /sales 列表控制器对 WAREHOUSE 去掉金额字段', async (t) => {
  const salesService = require('./salesService');
  stubPrisma(t, salesService, 'getSalesContracts', async () => ({ contracts: [{ id: 'c1', contractNo: 'EXP-1', status: 'CONFIRMED', totalAmount: 5, receivedAmount: 2 }], total: 1 }));
  const { list } = require('../controllers/salesController');
  const run = async (role) => {
    let body;
    const res = { status() { return this; }, json(b) { body = b; return this; } };
    await list({ query: {}, user: { role } }, res, (e) => { throw e; });
    return body;
  };
  const wh = JSON.stringify(await run('SALES'));
  assert.doesNotMatch(wh, /totalAmount|receivedAmount/);
  assert.match(wh, /EXP-1/);
  assert.match(JSON.stringify(await run('ADMIN')), /totalAmount/);
});

test('OD-3/OD-6：GET /sales/:id 对 WAREHOUSE 去掉合同总额、已收金额与收款记录，状态保留', async (t) => {
  const salesService = require('./salesService');
  stubPrisma(t, salesService, 'getSalesContractById', async () => ({
    id: 'c1', contractNo: 'EXP-1', status: 'CONFIRMED', totalAmount: 5, receivedAmount: 2, payments: [{ amount: 2 }], items: [],
  }));
  const { getById } = require('../controllers/salesController');
  const run = async (role) => {
    let body;
    const res = { status() { return this; }, json(b) { body = b; return this; } };
    await getById({ params: { id: 'c1' }, user: { role } }, res, (e) => { throw e; });
    return JSON.stringify(body);
  };
  const wh = await run('SALES');
  assert.doesNotMatch(wh, /totalAmount|receivedAmount|payments/);
  assert.match(wh, /CONFIRMED/);
  assert.match(await run('ADMIN'), /totalAmount/);
});

test('A63：导出 includeMoney 缺省即无金额（fail closed）', async (t) => {
  stubPrisma(t, prisma.salesContract, 'findMany', async () => CONTRACTS);
  stubPrisma(t, prisma.purchaseContract, 'findMany', async () => []);
  const { exportData } = require('./exportService');
  assert.doesNotMatch((await exportData('sales', {})).data, /总金额|1234/);
  assert.doesNotMatch((await exportData('purchases', {})).data, /总金额|已付金额/);
});

test('A63：销售列表 CSV 对 DERIVED 合同扣除第三方装箱货值（B87 口径）', async (t) => {
  const derived = {
    ...CONTRACTS[0], totalAmount: 1000, receivedAmount: 300, amountSource: 'DERIVED',
    packingItems: [
      { totalPrice: 700, isOwnedByJiesong: true, note: null },
      { totalPrice: 300, isOwnedByJiesong: false, note: null },
    ],
  };
  stubPrisma(t, prisma.salesContract, 'findMany', async () => [derived]);
  const { exportData } = require('./exportService');
  const csv = (await exportData('sales', {}, { includeMoney: true })).data.split('\n')[1].replace(/"/g, '').split(',');
  assert.deepEqual(csv.slice(1, 4).map(Number), [700, 300, 400]);
});

test('A69/A63-F1：采购 Excel 导出 includeMoney 缺省即无总金额列（fail closed）', async (t) => {
  stubPrisma(t, prisma.purchaseContract, 'findMany', async () => [{
    contractNo: 'CG-1', supplier: { name: '合成供应商' }, signedAt: new Date('2026-01-01T00:00:00Z'),
    totalAmount: 98765, status: 'DRAFT', note: '',
  }]);
  const xlsx = require('xlsx');
  const { exportPurchasesExcel } = require('./purchaseImportExportService');
  const read = async (opts) => {
    const wb = xlsx.read((await exportPurchasesExcel({}, opts)).buffer, { type: 'buffer' });
    return xlsx.utils.sheet_to_json(wb.Sheets['采购合同'])[0];
  };
  const def = await read(undefined);
  assert.equal('总金额' in def, false);
  assert.ok(!JSON.stringify(def).includes('98765'));
  assert.equal((await read({ includeMoney: false }))['总金额'], undefined);
  assert.equal((await read({ includeMoney: true }))['总金额'], 98765);
});

test('A69/A63-F3：销售列表导出已收封顶到自有额（owned 600 / received 900），CSV 口径', async (t) => {
  const capped = {
    ...CONTRACTS[0], totalAmount: 1000, receivedAmount: 900, amountSource: 'DERIVED',
    packingItems: [
      { totalPrice: 600, isOwnedByJiesong: true, note: null },
      { totalPrice: 400, isOwnedByJiesong: false, note: null },
    ],
  };
  stubPrisma(t, prisma.salesContract, 'findMany', async () => [capped]);
  const { exportData } = require('./exportService');
  const csv = (await exportData('sales', {}, { includeMoney: true })).data.split('\n')[1].replace(/"/g, '').split(',');
  assert.deepEqual(csv.slice(1, 4).map(Number), [600, 600, 0]);
});
