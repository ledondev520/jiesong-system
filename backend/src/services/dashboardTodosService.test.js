const test = require('node:test');
const assert = require('node:assert/strict');
const { LISTS } = require('./dashboardTodosService');

test('missingInvoice: 已关联发票记录的合同即使 invoiceNo 为空也不列出', async () => {
  const contracts = [
    { id: 'matched', contractNo: 'PO-MATCHED', invoiceNo: '', totalAmount: 10, supplier: { name: 'S' } },
    { id: 'manual', contractNo: 'PO-MANUAL', invoiceNo: 'INV-1', totalAmount: 10, supplier: { name: 'S' } },
    { id: 'missing', contractNo: 'PO-MISSING', invoiceNo: '  ', totalAmount: 10, supplier: { name: 'S' } },
  ];
  let invoiceWhere;
  const db = {
    purchaseContract: { findMany: async () => contracts },
    invoiceRecord: {
      findMany: async ({ where }) => {
        invoiceWhere = where;
        return [{ matchedContractId: 'matched' }];
      },
    },
  };
  const result = await LISTS.missingInvoice.load(db);
  assert.deepEqual(result.items.map((i) => i.contractNo), ['PO-MISSING']);
  assert.equal(result.count, 1);
  assert.equal(invoiceWhere.matchStatus, 'MATCHED');
  assert.equal(invoiceWhere.matchedContractType, 'PURCHASE');
  // 已红冲/作废/负数发票不算已开票（保守口径）
  assert.equal(invoiceWhere.status, '正常');
  assert.equal(invoiceWhere.isPositive, '是');
  assert.deepEqual(invoiceWhere.matchedContractId.in, ['matched', 'missing']);
});

// 决策 A：首页只计截止日期之后签约的合同；更早的只给 historical 条数；signedAt 为空不隐藏。
const { DASHBOARD_TODO_CUTOFF } = require('./dashboardTodosService');
const before = new Date(DASHBOARD_TODO_CUTOFF.getTime() - 1);

test('paymentsDue: 截止日期前的历史合同不计入，只给 historical.count', async () => {
  const row = (id, signedAt) => ({ id, contractNo: id, status: 'SIGNED', totalAmount: 100, paidAmount: 0, expectedDate: null, signedAt, supplier: { name: 'S' } });
  const db = { purchaseContract: { findMany: async () => [row('old', before), row('edge', DASHBOARD_TODO_CUTOFF), row('unknown', null)] } };
  const result = await LISTS.paymentsDue.load(db);
  assert.deepEqual(result.items.map((i) => i.contractNo).sort(), ['edge', 'unknown']);
  assert.equal(result.count, 2);
  assert.deepEqual(result.historical, { count: 1, before: '2026-01-01' });
});

test('截止日按北京时间：2026-01-01 北京零点（UTC 2025-12-31T16:00）计入，前 1 毫秒为历史', async () => {
  const row = (id, signedAt) => ({ id, contractNo: id, status: 'SIGNED', totalAmount: 100, paidAmount: 0, expectedDate: null, signedAt, supplier: { name: 'S' } });
  const beijingMidnight = new Date('2025-12-31T16:00:00.000Z');
  const db = { purchaseContract: { findMany: async () => [row('jan1', beijingMidnight), row('dec31', new Date(beijingMidnight.getTime() - 1))] } };
  const result = await LISTS.paymentsDue.load(db);
  assert.deepEqual(result.items.map((i) => i.contractNo), ['jan1']);
  assert.deepEqual(result.historical, { count: 1, before: '2026-01-01' });
});

test('missingInvoice: 历史合同不计入但仍先经发票关联过滤', async () => {
  const row = (id, signedAt) => ({ id, contractNo: id, invoiceNo: '', totalAmount: 10, signedAt, supplier: { name: 'S' } });
  const db = {
    purchaseContract: { findMany: async () => [row('old', before), row('oldMatched', before), row('new', DASHBOARD_TODO_CUTOFF)] },
    invoiceRecord: { findMany: async () => [{ matchedContractId: 'oldMatched' }] },
  };
  const result = await LISTS.missingInvoice.load(db);
  assert.deepEqual(result.items.map((i) => i.contractNo), ['new']);
  assert.equal(result.count, 1);
  assert.equal(result.historical.count, 1); // oldMatched 已开票，不算「历史未计入」
});
