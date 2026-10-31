/**
 * Input: 合成采购合同行（草稿/生效/已取消/部分付款/多付/逾期）
 * Output: 唯一应付口径的纯函数回归
 * Pos: payablesService 单元测试，不连接数据库
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { PAYABLE_STATUSES, payableWhere, outstandingOf, summarizePayables, getPayablesSummary } = require('./payablesService');

const NOW = new Date('2026-10-30T12:00:00Z');
const past = new Date('2026-09-01T00:00:00Z');
const future = new Date('2026-12-01T00:00:00Z');

test('只有生效状态计入应付，DRAFT 与 CANCELLED 永不计入', () => {
  assert.deepEqual(PAYABLE_STATUSES, ['SIGNED', 'PRODUCING', 'READY', 'SHIPPED', 'RECEIVED', 'COMPLETED']);
  assert.deepEqual(payableWhere(), { status: { notIn: ['DRAFT', 'CANCELLED'] } });
  for (const status of ['DRAFT', 'CANCELLED', 'CONFIRMED', undefined]) {
    assert.equal(outstandingOf({ status, totalAmount: 1000, paidAmount: 0 }), 0, String(status));
  }
  for (const status of PAYABLE_STATUSES) {
    assert.equal(outstandingOf({ status, totalAmount: 1000, paidAmount: 250 }), 750, status);
  }
});

test('历史旧别名和小写拼写仍按生效状态计入，草稿/取消的任何拼写都不计', () => {
  for (const status of ['PENDING_INSPECTION', 'IN_STOCK', 'signed', ' Shipped ']) {
    assert.equal(outstandingOf({ status, totalAmount: 1000, paidAmount: 250 }), 750, status);
  }
  for (const status of ['draft', 'Cancelled', 'PENDING']) {
    assert.equal(outstandingOf({ status, totalAmount: 1000, paidAmount: 0 }), 0, status);
  }
  assert.equal(summarizePayables([{ status: 'in_stock', totalAmount: 10, paidAmount: 4 }, { status: 'draft', totalAmount: 99, paidAmount: 0 }]).unpaid, 6);
});

test('多付合同按 0 计，不抵减其他合同；金额逐合同按分取整', () => {
  assert.equal(outstandingOf({ status: 'SIGNED', totalAmount: 100, paidAmount: 150 }), 0);
  assert.equal(outstandingOf({ status: 'SIGNED', totalAmount: 0.3, paidAmount: 0.1 }), 0.2);
  const summary = summarizePayables([
    { status: 'SIGNED', totalAmount: 100, paidAmount: 150, expectedDate: past },
    { status: 'SHIPPED', totalAmount: 200, paidAmount: 50.5, expectedDate: future },
  ], NOW);
  assert.deepEqual(summary, { total: 300, paid: 200.5, unpaid: 149.5, overdue: 0, contractCount: 2 });
});

test('汇总剔除草稿/取消，逾期只算 expectedDate 已过且仍有余额的合同', () => {
  const summary = summarizePayables([
    { status: 'DRAFT', totalAmount: 9000, paidAmount: 0, expectedDate: past },
    { status: 'CANCELLED', totalAmount: 9000, paidAmount: 100, expectedDate: past },
    { status: 'SIGNED', totalAmount: 1000, paidAmount: 200, expectedDate: past },
    { status: 'PRODUCING', totalAmount: 500, paidAmount: 0, expectedDate: future },
    { status: 'COMPLETED', totalAmount: 400, paidAmount: 400, expectedDate: past },
    { status: 'READY', totalAmount: 300, paidAmount: 100, expectedDate: null },
  ], NOW);
  assert.deepEqual(summary, { total: 2200, paid: 700, unpaid: 1500, overdue: 800, contractCount: 4 });
  assert.deepEqual(summarizePayables([], NOW), { total: 0, paid: 0, unpaid: 0, overdue: 0, contractCount: 0 });
});

test('getPayablesSummary 用生效状态过滤查询，且结果与纯函数一致', async () => {
  let args;
  const rows = [{ status: 'SIGNED', totalAmount: 10, paidAmount: 4, expectedDate: past }];
  const db = { purchaseContract: { findMany: async (query) => { args = query; return rows; } } };
  assert.deepEqual(await getPayablesSummary(db, NOW), summarizePayables(rows, NOW));
  assert.deepEqual(args.where, payableWhere());
});
