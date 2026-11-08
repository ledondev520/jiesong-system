/**
 * Input: 桩化的 service / 命令 / prisma，WAREHOUSE 与其他角色调用控制器、MCP 路由、AI 上下文
 * Output: 回归：WAREHOUSE 红线（OD-2/OD-3/P2-B）在各接线点真正生效（只测接线，函数本体见 warehouseRedaction.test.js 等）
 * Pos: PR #210 review P1-C/P2-A/P2-B；每个断言在对应接线被还原时必须失败
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const prisma = require('../utils/prisma');

// 必须在加载控制器 / mcp 路由之前桩化：它们在模块加载时解构这些函数。
const auth = require('../middleware/auth');
auth.authenticate = (req, _res, next) => { req.user = { id: 'u1', role: req.headers['x-role'] }; next(); };
const auditLog = require('../utils/auditLog');
auditLog.logOperation = async () => {};
const purchaseCommands = require('../agent/commands/purchase');
let updateInput = null;
const SECRET_PURCHASE = { id: 'pc-1', contractNo: 'PO-1', status: 'DRAFT', totalAmount: 9876, paidAmount: 5, invoiceNo: 'INV-SECRET-1', items: [{ id: 'i1', unitPrice: 7.5, totalPrice: 75 }] };
purchaseCommands.updatePurchase = async ({ input }) => { updateInput = input; return SECRET_PURCHASE; };
purchaseCommands.createPurchaseWithItems = async () => SECRET_PURCHASE;
const queryCommands = require('../agent/commands/query');
let searchArgs = null;
queryCommands.searchEntities = async (args) => { searchArgs = args; return []; };

const createRes = () => {
  const res = { headers: {}, payload: null, sent: null };
  res.status = () => res;
  res.json = (p) => { res.payload = p; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.send = (d) => { res.sent = d; return res; };
  return res;
};
const next = (e) => { if (e) throw e; };

test('CSV/PDF 导出控制器：WAREHOUSE 传 includeMoney:false，其他角色 true', async (t) => {
  const exportService = require('../services/exportService');
  const pdf = require('../services/pdfExportService');
  const ctrl = require('../controllers/system/importExportController');
  const seen = [];
  const o1 = exportService.exportData; const o2 = pdf.exportSystemDataPdf;
  exportService.exportData = async (_t, _q, opts) => { seen.push(['csv', opts.includeMoney]); return { contentType: 'text/csv', filename: 'a.csv', data: Buffer.from('x') }; };
  pdf.exportSystemDataPdf = async (_t, _q, opts) => { seen.push(['pdf', opts.includeMoney]); return { contentType: 'application/pdf', filename: 'a.pdf', data: Buffer.from('x') }; };
  t.after(() => { exportService.exportData = o1; pdf.exportSystemDataPdf = o2; });
  for (const [role, expected] of [['WAREHOUSE', false], ['ADMIN', true]]) {
    seen.length = 0;
    await ctrl.exportData({ params: { type: 'purchases' }, query: {}, user: { role } }, createRes(), next);
    await ctrl.exportDataPdf({ params: { type: 'purchases' }, query: {}, user: { role } }, createRes(), next);
    assert.deepEqual(seen, [['csv', expected], ['pdf', expected]], role);
  }
});

test('采购 Excel 导出控制器：WAREHOUSE 传 includeMoney:false', async (t) => {
  const svc = require('../services/purchaseImportExportService');
  const original = svc.exportPurchasesExcel;
  const seen = [];
  svc.exportPurchasesExcel = async (_f, opts) => { seen.push(opts.includeMoney); return { filename: 'p.xlsx', buffer: Buffer.from('x') }; };
  t.after(() => { svc.exportPurchasesExcel = original; });
  delete require.cache[require.resolve('../controllers/purchaseImportExportController')];
  const ctrl = require('../controllers/purchaseImportExportController');
  await ctrl.exportExcel({ query: {}, user: { role: 'WAREHOUSE' } }, createRes(), next);
  await ctrl.exportExcel({ query: {}, user: { role: 'PURCHASE' } }, createRes(), next);
  assert.deepEqual(seen, [false, true]);
});

test('GET /search：WAREHOUSE 传 includeAmounts:false', async () => {
  const ctrl = require('../controllers/searchController');
  for (const [role, expected] of [['WAREHOUSE', false], ['SALES', true]]) {
    await ctrl.search({ query: { q: 'x' }, user: { role } }, createRes(), next);
    assert.equal(searchArgs.includeAmounts, expected, role);
  }
});

test('PUT /purchases/:id：WAREHOUSE 的草稿更正沿用库内单价，其他角色按提交值', async (t) => {
  const original = prisma.purchaseItem.findMany;
  prisma.purchaseItem.findMany = async () => [{ id: 'i1', productId: 'p1', unitPrice: 7.5 }];
  t.after(() => { prisma.purchaseItem.findMany = original; });
  const ctrl = require('../controllers/purchaseController');
  const body = () => ({ items: [{ id: 'i1', productId: 'p1', quantity: 2 }] });
  await ctrl.update({ params: { id: 'pc-1' }, body: body(), user: { role: 'WAREHOUSE' } }, createRes(), next);
  assert.equal(updateInput.items[0].unitPrice, 7.5);
  await ctrl.update({ params: { id: 'pc-1' }, body: body(), user: { role: 'PURCHASE' } }, createRes(), next);
  assert.equal(updateInput.items[0].unitPrice, undefined);
});

const callMcp = async (role, name, args) => {
  const app = express();
  app.use(express.json());
  app.use('/mcp', require('./mcp'));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-role': role },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    });
    return { status: response.status, text: await response.text() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test('MCP update_purchase / create_purchase_with_items：WAREHOUSE 响应无金额与发票号，且更新沿用库内单价', async (t) => {
  const o1 = prisma.purchaseContract.findUnique; const o2 = prisma.purchaseItem.findMany;
  prisma.purchaseContract.findUnique = async () => SECRET_PURCHASE;
  prisma.purchaseItem.findMany = async () => [{ id: 'i1', productId: 'p1', unitPrice: 7.5 }];
  t.after(() => { prisma.purchaseContract.findUnique = o1; prisma.purchaseItem.findMany = o2; });
  const items = [{ id: 'i1', productId: 'p1', quantity: 2 }];
  const update = await callMcp('WAREHOUSE', 'update_purchase', { id: 'pc-1', items });
  assert.equal(update.status, 200);
  assert.doesNotMatch(update.text, /9876|INV-SECRET-1|7\.5/);
  assert.match(update.text, /PO-1/);
  assert.equal(updateInput.items[0].unitPrice, 7.5);
  const create = await callMcp('WAREHOUSE', 'create_purchase_with_items', { supplierId: 's1', items: [] });
  assert.doesNotMatch(create.text, /9876|INV-SECRET-1/);
  const purchase = await callMcp('PURCHASE', 'update_purchase', { id: 'pc-1', items });
  assert.match(purchase.text, /9876/);
});

test('MCP search_entities：WAREHOUSE 传 includeAmounts:false', async () => {
  await callMcp('WAREHOUSE', 'search_entities', { query: 'x' });
  assert.equal(searchArgs.includeAmounts, false);
  await callMcp('SALES', 'search_entities', { query: 'x' });
  assert.equal(searchArgs.includeAmounts, true);
});

test('AI 对话上下文：WAREHOUSE 不含采购/销售/财务金额', async (t) => {
  const stubs = [
    [prisma.purchaseContract, 'findMany', async () => [{ contractNo: 'PO-77', totalAmount: 4242, supplier: { name: 'S' }, items: [] }]],
    [prisma.salesContract, 'findMany', async () => [{ contractNo: 'EX-77', status: 'CONFIRMED', totalAmount: 5151, receivedAmount: 61, items: [], port: null }]],
    [prisma.salesContract, 'findFirst', async () => ({ contractNo: 'EX-77', status: 'CONFIRMED', totalAmount: 5151, receivedAmount: 61, items: [], port: null })],
    [prisma.salesContract, 'aggregate', async () => ({ _sum: { totalAmount: 5151, receivedAmount: 61 } })],
  ];
  const restore = stubs.map(([d, n, f]) => { const o = d[n]; d[n] = f; return () => { d[n] = o; }; });
  t.after(() => restore.forEach((r) => r()));
  const { getDbContext } = require('../services/ai/contextService');
  const message = '采购合同 PO-77 销售合同 EX-77 应付 应收 财务';
  const wh = await getDbContext(message, { role: 'WAREHOUSE' });
  assert.doesNotMatch(wh, /4242|5151|财务概况|金额:|已收:/);
  const sales = await getDbContext(message, { role: 'SALES' });
  assert.match(sales, /5151|4242|财务概况/);
});

test('销售装箱明细：WAREHOUSE 响应无供应商发票号与采购成本', async (t) => {
  const salesService = require('../services/salesService');
  const originals = {
    add: salesService.addPackingItem, upd: salesService.updatePackingItem, imp: salesService.importPurchasePackingItems, get: salesService.getSalesContractById,
  };
  const row = { id: 'pk1', boxes: 3, invoiceNo: 'INV-PACK-1', purchaseCost: 321.5, unitPrice: 2 };
  salesService.addPackingItem = async () => ({ ...row });
  salesService.updatePackingItem = async () => ({ ...row });
  salesService.importPurchasePackingItems = async () => ({ importedCount: 1, items: [{ ...row }] });
  salesService.getSalesContractById = async () => ({ id: 'c1', totalAmount: 1, receivedAmount: 1, payments: [], packingItems: [{ ...row }] });
  t.after(() => { salesService.addPackingItem = originals.add; salesService.updatePackingItem = originals.upd; salesService.importPurchasePackingItems = originals.imp; salesService.getSalesContractById = originals.get; });
  delete require.cache[require.resolve('../controllers/salesController')];
  const ctrl = require('../controllers/salesController');
  const req = (role) => ({ params: { id: 'c1', itemId: 'pk1' }, body: { items: [] }, user: { id: 'u', role }, headers: {}, ip: '127.0.0.1' });
  for (const handler of ['addPackingItem', 'updatePackingItem', 'importPurchasePackingItems', 'getById']) {
    const wh = createRes(); await ctrl[handler](req('WAREHOUSE'), wh, next);
    const whText = JSON.stringify(wh.payload);
    assert.doesNotMatch(whText, /INV-PACK-1|321\.5/, handler);
    assert.match(whText, /pk1/, handler);
    assert.match(whText, /"unitPrice":2/, `${handler}: USD 行价保留`);
    const other = createRes(); await ctrl[handler](req('SALES'), other, next);
    assert.match(JSON.stringify(other.payload), /INV-PACK-1/, `${handler} SALES`);
  }
});
