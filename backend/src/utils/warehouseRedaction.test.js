/**
 * OD-2/OD-3：WAREHOUSE 看不到发票号与采购金额（合成数据）；PURCHASE 仍得完整载荷。
 * 覆盖：helper、res.json 中间件、采购控制器各响应、三种导出、/export/:type 守卫与审计、WAREHOUSE 保存不抹数据。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const xlsx = require('xlsx');
const prisma = require('../utils/prisma');
const { redactWarehouseMoney, warehouseMoneyRedaction } = require('./warehouseRedaction');

const INV = 'SYNTH-INV-7731';
const AMT = 987654.32;
const AMT_TEXT = ['987654.32', '987654', '1118'];
const contract = () => ({
  id: 'pc-1', contractNo: 'PO-SYNTH', status: 'SIGNED', invoiceNo: `${INV}，SYNTH-INV-7732`, totalAmount: AMT, paidAmount: 500,
  supplier: { id: 's-1', name: 'Synth Supplier' },
  items: [{ id: 'i-1', productId: 'p-1', quantity: 3, unitPrice: 1118, totalPrice: 3789.5 }],
  payments: [{ id: 'pay-1', amount: 500, status: 'PAID' }],
  subStatus: { payment: 'PARTIAL' },
  issues: [{ code: 'OVERPAID', message: `已付 ${AMT} 超过合同` }],
});
const leaks = (value) => {
  const text = JSON.stringify(value);
  return [INV, ...AMT_TEXT].filter((needle) => text.includes(needle));
};

test('redactWarehouseMoney: WAREHOUSE 无发票号/金额，状态与数量保留，不把金额显示成 0', () => {
  const out = redactWarehouseMoney('WAREHOUSE', contract());
  assert.deepEqual(leaks(out), []);
  assert.equal(out.invoiceCount, 2);
  assert.equal(out.hasPaidAmount, true);
  assert.equal('totalAmount' in out, false);
  assert.equal(out.status, 'SIGNED');
  assert.equal(out.subStatus.payment, 'PARTIAL');
  assert.equal(out.items[0].quantity, 3);
  assert.deepEqual(out.payments, [{ id: 'pay-1' }]);
});

test('redactWarehouseMoney: 其他角色原样返回', () => {
  for (const role of ['PURCHASE', 'ADMIN', 'FINANCE', 'SALES', 'BOSS']) {
    const data = contract();
    assert.equal(redactWarehouseMoney(role, data), data);
  }
});

test('warehouseMoneyRedaction: 按 req.user 读取角色，res.json 出口剥离', () => {
  const run = (role) => {
    let body;
    const res = { json(b) { body = b; return this; } };
    warehouseMoneyRedaction({ user: { role } }, res, () => {});
    res.json({ data: contract() });
    return body;
  };
  assert.deepEqual(leaks(run('WAREHOUSE')), []);
  assert.ok(leaks(run('PURCHASE')).length > 0);
});

const withPrisma = async (patches, fn) => {
  const saved = [];
  for (const [model, methods] of Object.entries(patches)) {
    for (const [name, impl] of Object.entries(methods)) {
      saved.push([model, name, prisma[model][name]]);
      prisma[model][name] = impl;
    }
  }
  try { return await fn(); } finally { saved.forEach(([m, n, orig]) => { prisma[m][n] = orig; }); }
};

const call = async (handler, req) => {
  let body;
  let err;
  const res = { status() { return this; }, json(b) { body = b; return this; } };
  warehouseMoneyRedaction(req, res, () => {});
  await handler({ query: {}, body: {}, params: {}, ...req }, res, (e) => { err = e; });
  if (err) throw err;
  return body;
};

test('采购控制器：getById/list/invoice-preparation/price-history 对 WAREHOUSE 无发票号与金额，PURCHASE 完整', async () => {
  const controller = require('../controllers/purchaseController');
  const full = { ...contract(), files: [], _count: {} };
  await withPrisma({
    purchaseContract: {
      findUnique: async () => ({ ...full, taxRate: 13, supplier: { id: 's-1', name: 'Synth Supplier', taxId: 'T' } }),
      findMany: async () => [contract()],
      count: async () => 1,
      groupBy: async () => [],
    },
    purchaseItem: { findMany: async () => [] },
    purchaseReceiptItem: { groupBy: async () => [] },
    payment: { findMany: async () => [] },
  }, async () => {
    for (const [name, req] of [
      ['getById', { params: { id: 'pc-1' } }],
      ['list', { query: {} }],
      ['getInvoicePreparation', { params: { id: 'pc-1' } }],
      ['getProductPriceHistory', { params: { productId: 'p-1' } }],
    ]) {
      const w = await call(controller[name], { ...req, user: { role: 'WAREHOUSE' } });
      assert.deepEqual(leaks(w), [], `${name} WAREHOUSE`);
    }
    const p = await call(controller.getById, { params: { id: 'pc-1' }, user: { role: 'PURCHASE' } });
    assert.ok(JSON.stringify(p).includes(INV), 'PURCHASE keeps invoice numbers');
    const prep = await call(controller.getInvoicePreparation, { params: { id: 'pc-1' }, user: { role: 'WAREHOUSE' } });
    assert.equal(prep.data.invoiceNumberCount, 2);
    assert.equal(prep.data.complete, true);
    assert.ok(prep.data.request.lines.length > 0);
  });
});

test('registerInvoiceNumbers: WAREHOUSE 只追加不覆盖已存号码；PURCHASE 仍整表替换；发票附件按角色过滤', async () => {
  const controller = require('../controllers/purchaseController');
  let stored = `${INV}，SYNTH-INV-7732`;
  const file = { id: 'f1', category: 'SUPPLIER_INVOICE', fileName: 'inv.pdf' };
  await withPrisma({
    purchaseContract: {
      findUnique: async () => ({ id: 'pc-1', invoiceNo: stored }),
      update: async ({ data }) => { stored = data.invoiceNo; return { id: 'pc-1', invoiceNo: stored, taxRate: 13, items: [], files: [file], supplier: {} }; },
    },
  }, async () => {
    const w = await call(controller.registerInvoiceNumbers, { params: { id: 'pc-1' }, body: { invoiceNumbers: ['NEW-1'] }, user: { role: 'WAREHOUSE' } });
    assert.equal(stored, `${INV}，SYNTH-INV-7732，NEW-1`);
    assert.deepEqual(leaks(w), []);
    assert.deepEqual(w.data.invoiceFiles, [], 'WAREHOUSE 不见 SUPPLIER_INVOICE 行（B112）');
    const s = await call(controller.registerInvoiceNumbers, { params: { id: 'pc-1' }, body: { invoiceNumbers: ['ONLY-1'] }, user: { role: 'SALES' } });
    assert.equal(stored, 'ONLY-1');
    assert.deepEqual(s.data.invoiceFiles, []);
    const p = await call(controller.registerInvoiceNumbers, { params: { id: 'pc-1' }, body: { invoiceNumbers: ['P-1'] }, user: { role: 'PURCHASE' } });
    assert.equal(p.data.invoiceFiles.length, 1);
  });
});

test('WAREHOUSE 草稿更正：未带价格的明细沿用库内单价，不清零', async () => {
  const { keepStoredPricesForWarehouse } = require('../controllers/purchaseController');
  await withPrisma({ purchaseItem: { findMany: async () => [{ id: 'i-1', productId: 'p-1', unitPrice: 1118 }, { id: 'i-2', productId: 'p-2', unitPrice: 7 }] } }, async () => {
    const req = (role) => ({ user: { role }, params: { id: 'pc-1' } });
    const input = { items: [{ productId: 'p-2', quantity: 1 }, { id: 'i-1', productId: 'p-1', quantity: 9, unitPrice: 0 }, { productId: 'p-3', quantity: 1, unitPrice: 5 }] };
    const out = await keepStoredPricesForWarehouse(req('WAREHOUSE'), input);
    assert.deepEqual(out.items.map((i) => i.unitPrice), [7, 1118, 5]);
    assert.equal(out.items[1].quantity, 9);
    assert.equal(await keepStoredPricesForWarehouse(req('PURCHASE'), input), input);
  });
});

test('采购创建：价格警告文案（含价格）不返回给 WAREHOUSE', async () => {
  const commands = require('../agent/commands/purchase');
  const original = commands.createPurchaseWithItems;
  delete require.cache[require.resolve('../controllers/purchaseController')];
  commands.createPurchaseWithItems = async () => contract();
  try {
    const controller = require('../controllers/purchaseController');
    await withPrisma({ purchaseItem: { findMany: async () => [{ unitPrice: 10 }] } }, async () => {
      const body = await call(controller.create, { query: {}, body: { items: [{ productId: 'p-1', unitPrice: 100 }] }, user: { role: 'WAREHOUSE' } });
      assert.deepEqual(leaks(body), []);
      assert.ok(!JSON.stringify(body).includes('历史均价'));
    });
  } finally {
    commands.createPurchaseWithItems = original;
    delete require.cache[require.resolve('../controllers/purchaseController')];
  }
});

test('导出：purchases CSV/PDF/xlsx 对 WAREHOUSE 无金额与发票号列，其他角色保留', async () => {
  const exportService = require('../services/exportService');
  const { exportPurchasesExcel } = require('../services/purchaseImportExportService');
  const { exportSystemDataPdf } = require('../services/pdfExportService');
  await withPrisma({ purchaseContract: { findMany: async () => [contract()] } }, async () => {
    const csvW = (await exportService.exportData('purchases', {}, { includeMoney: false })).data;
    assert.deepEqual(leaks(csvW), []);
    assert.ok(csvW.includes('PO-SYNTH') && csvW.includes('SIGNED'));
    const csvP = (await exportService.exportData('purchases', {}, { includeMoney: true })).data;
    assert.ok(csvP.includes(INV) && csvP.includes('987654.32'));
    const xW = await exportPurchasesExcel({}, { includeMoney: false });
    const sheet = xlsx.read(xW.buffer, { type: 'buffer' });
    assert.deepEqual(leaks(xlsx.utils.sheet_to_csv(sheet.Sheets[sheet.SheetNames[0]])), []);
    assert.ok(JSON.stringify(xlsx.utils.sheet_to_json(xlsx.read((await exportPurchasesExcel({}, { includeMoney: true })).buffer, { type: 'buffer' }).Sheets['采购合同'])).includes('987654.32'));
    assert.ok((await exportSystemDataPdf('purchases', {}, { includeMoney: false })).buffer.length > 0);
  });
});

test('/export/:type 与 /system/export/:type 同守卫：WAREHOUSE 导出 payments 403，且 /export 有审计日志', () => {
  const dataExport = require('../routes/dataExport');
  const route = dataExport.stack.find((l) => l.route?.path === '/:type').route;
  const names = route.stack.map((l) => l.handle.name);
  assert.ok(names.includes('paymentsExportGuard'), 'guard on /export/:type');
  // 与 /system/export/:type 同形（角色校验、守卫、withAuditLog 包裹的控制器），审计日志不再缺失
  const systemRoute = require('../routes/system').stack.find((l) => l.route?.path === '/export/:type').route;
  assert.deepEqual(names, systemRoute.stack.map((l) => l.handle.name));
  assert.match(require('fs').readFileSync(require.resolve('../routes/dataExport'), 'utf8'), /withAuditLog\(\s*\{\s*entity: 'DataExport'/);
  const { paymentsExportGuard } = require('../middleware/paymentsExportGuard');
  let denied;
  paymentsExportGuard({ params: { type: 'payments' }, user: { role: 'WAREHOUSE' } }, {}, (e) => { denied = e; });
  assert.equal(denied.statusCode, 403);
  let ok = 'unset';
  paymentsExportGuard({ params: { type: 'payments' }, user: { role: 'FINANCE' } }, {}, (e) => { ok = e; });
  assert.equal(ok, undefined);
  const purchasesExport = require('../routes/purchases').stack.find((l) => l.route?.path === '/export').route;
  assert.ok(purchasesExport.stack.some((l) => l.handle.isRoleAuth), '/purchases/export 有角色校验');
});

test('OD-6：库存快照的 totalCost 与 averageCost 对 WAREHOUSE 保持可见，合同金额仍剥离', () => {
  const body = { byProduct: [{ productId: 'p1', totalCost: 4321, averageCost: 12.5 }], contract: { totalAmount: 99, totalCost: 7 } };
  const out = redactWarehouseMoney('WAREHOUSE', body);
  assert.deepEqual(out.byProduct[0], { productId: 'p1', totalCost: 4321, averageCost: 12.5 });
  assert.equal('totalAmount' in out.contract, false);
  assert.equal('totalCost' in out.contract, false);
});

test('A98 exemptions: customs keeps declared values, sales keeps USD line prices, other prefixes strip them', () => {
  const { warehouseExemptKeys } = require('./warehouseRedaction');
  const body = { totalAmount: 9, receivedAmount: 3, items: [{ unitPrice: 2, totalPrice: 4, purchaseCost: 1, invoiceNo: 'INV-1' }] };
  const run = (path) => redactWarehouseMoney('WAREHOUSE', body, warehouseExemptKeys(path));
  assert.deepEqual(run('/customs-declarations/x'), { totalAmount: 9, items: [{ unitPrice: 2, totalPrice: 4, invoiceCount: 1 }] });
  assert.deepEqual(run('/sales/x'), { items: [{ unitPrice: 2, totalPrice: 4, invoiceCount: 1 }] });
  assert.deepEqual(run('/forex-verifications'), { items: [{ invoiceCount: 1 }] });
  assert.deepEqual(run('/salesx'), { items: [{ invoiceCount: 1 }] }, 'prefix match is per path segment');
  assert.equal(redactWarehouseMoney('ADMIN', body, warehouseExemptKeys('/forex-verifications')), body);
});
