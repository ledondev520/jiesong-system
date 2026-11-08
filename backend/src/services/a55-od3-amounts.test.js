/**
 * Input: 出口合同/Agent 工具/搜索的角色参数，桩化 prisma
 * Output: A55 OD-3（WAREHOUSE 无合同总额与收款金额）与 A3（导出用 B87 金额口径）回归
 * Pos: 后端服务测试；路由层 403 见 routes/a55-role-gates.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
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
  const full = (await exportData('sales', {})).data;
  assert.match(full, /总金额\(USD\)/);
  assert.match(full, /1234/);
  const wh = (await exportData('sales', {}, { includeMoney: false })).data;
  assert.doesNotMatch(wh, /总金额|已收金额|未收金额/);
  assert.doesNotMatch(wh, /1234|321/);
  assert.match(wh, /EXP-1/);
  assert.match(wh, /CONFIRMED/);
});

test('OD-3：PDF 导出行 WAREHOUSE 无 Total/Received/Outstanding', async (t) => {
  stubPrisma(t, prisma.salesContract, 'findMany', async () => CONTRACTS);
  const { exportSystemDataRows } = require('./pdfExportService');
  const full = await exportSystemDataRows('sales', {});
  assert.deepEqual(full.headers.slice(0, 4), ['Contract No.', 'Total', 'Received', 'Outstanding']);
  const wh = await exportSystemDataRows('sales', {}, { includeMoney: false });
  assert.deepEqual(wh.headers, ['Contract No.', 'Exchange Rate', 'Status', 'Signed At']);
  assert.equal(wh.rows[0].length, wh.headers.length);
  assert.ok(!JSON.stringify(wh.rows).includes('1,234') && !JSON.stringify(wh.rows).includes('1234'));
});

test('OD-3：GetExportOverview 仅对 WAREHOUSE 去掉 totalAmount/receivedAmount', async (t) => {
  stubPrisma(t, prisma.salesContract, 'findMany', async () => CONTRACTS.map((c) => ({ ...c, port: null, customer: null })));
  stubPrisma(t, prisma.salesContract, 'count', async () => 1);
  const { buildToolPool } = require('./openAgentService');
  const run = async (role) => {
    const tool = buildToolPool((spec) => spec, [], [], undefined, role).find((x) => x.name === 'GetExportOverview');
    return JSON.parse(await tool.call({}, undefined)).contracts[0];
  };
  const wh = await run('WAREHOUSE');
  assert.equal('totalAmount' in wh, false);
  assert.equal('receivedAmount' in wh, false);
  assert.equal(wh.status, 'CONFIRMED');
  const sales = await run('SALES');
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
  assert.doesNotMatch((await run('WAREHOUSE')).subtitle, /1,?234/);
  assert.match((await run('SALES')).subtitle, /1,?234/);
});

test('OD-3 字段核对：GetSupplierOverview 选择列与低库存预警没有金额/银行字段', async (t) => {
  let select;
  stubPrisma(t, prisma.supplier, 'findMany', async (args) => { select = args.select; return []; });
  const { buildToolPool } = require('./openAgentService');
  const tool = buildToolPool((spec) => spec, [], [], undefined, 'WAREHOUSE').find((x) => x.name === 'GetSupplierOverview');
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
  const wh = JSON.stringify(await run('WAREHOUSE'));
  assert.doesNotMatch(wh, /totalAmount|receivedAmount/);
  assert.match(wh, /EXP-1/);
  assert.match(JSON.stringify(await run('SALES')), /totalAmount/);
});

test('A3：出口合同 Excel 的总额/已收/未收用 B87 口径（扣除第三方货值，已收封顶）', async (t) => {
  stubPrisma(t, prisma.salesContract, 'findUnique', async () => ({
    id: 'c1', contractNo: 'EXP-0020', status: 'CONFIRMED', exchangeRate: 7.2, amountSource: 'DERIVED',
    totalAmount: 190, receivedAmount: 500, totalBoxes: 1, port: { name: 'LA' }, items: [],
    packingItems: [
      { id: 'a', productId: 'p1', quantity: 1, unit: '箱', boxes: 1, unitPrice: 150, totalPrice: 150, isOwnedByJiesong: true, note: '', product: { id: 'p1', customsName: 'x' }, store: null },
      { id: 'b', productId: 'p2', quantity: 1, unit: '箱', boxes: 1, unitPrice: 40, totalPrice: 40, isOwnedByJiesong: false, note: '拼船', product: { id: 'p2', customsName: 'y' }, store: null },
    ],
  }));
  stubPrisma(t, prisma.customsDeclarationItem, 'findMany', async () => []);
  stubPrisma(t, prisma.hsCode, 'findMany', async () => []);
  stubPrisma(t, prisma.taxRate, 'findMany', async () => []);
  const { exportSalesContractExcel } = require('./exportService');
  const { buffer } = await exportSalesContractExcel('c1');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet('合同信息');
  const byField = {};
  sheet.eachRow((row) => { byField[row.getCell(1).value] = row.getCell(2).value; });
  assert.equal(byField['总金额 (USD)'], '$150.00'); // 190 − 第三方 40
  assert.equal(byField['已收金额 (USD)'], '$150.00'); // 500 封顶到自有额
  assert.equal(byField['未收金额 (USD)'], '$0.00'); // 原式 190−500 = −310
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
  const wh = await run('WAREHOUSE');
  assert.doesNotMatch(wh, /totalAmount|receivedAmount|payments/);
  assert.match(wh, /CONFIRMED/);
  assert.match(await run('SALES'), /totalAmount/);
});
