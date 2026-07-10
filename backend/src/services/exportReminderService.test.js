/**
 * Input: exportReminderService、伪造 Prisma 客户端
 * Output: 退税月度提醒与缺发票提醒的幂等/守卫逻辑测试
 * Pos: 出口流程提醒服务回归测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  runMonthlyTaxRefundReminder,
  runInvoiceMissingReminder,
} = require('./exportReminderService');

/**
 * 职责：构造伪造 Prisma 客户端，记录 createMany 写入
 * @param {object} data 各模型查询返回值
 */
const buildFakeTx = (data = {}) => {
  const created = [];
  return {
    created,
    user: {
      findMany: async () => data.users ?? [{ id: 'u1' }, { id: 'u2' }],
    },
    salesContract: {
      findMany: async () => data.shippedContracts ?? [],
    },
    taxRefund: {
      findMany: async () => data.taxRefunds ?? [],
    },
    purchaseContract: {
      findMany: async () => data.missingInvoiceContracts ?? [],
    },
    notification: {
      findMany: async () => data.existingNotifications ?? [],
      createMany: async ({ data: rows }) => {
        created.push(...rows);
        return { count: rows.length };
      },
    },
  };
};

test('runMonthlyTaxRefundReminder: 非5号直接跳过', async () => {
  const tx = buildFakeTx();
  const result = await runMonthlyTaxRefundReminder(tx, { now: new Date('2026-07-04T09:00:00') });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'not-reminder-day');
  assert.equal(tx.created.length, 0);
});

test('runMonthlyTaxRefundReminder: 5号为上月发运合同生成提醒（含未建退税单统计）', async () => {
  const tx = buildFakeTx({
    shippedContracts: [
      { id: 'sc1', contractNo: 'EXP-001', hasTaxRefund: true },
      { id: 'sc2', contractNo: 'EXP-002', hasTaxRefund: true },
    ],
    taxRefunds: [{ salesContractId: 'sc1' }],
  });
  const result = await runMonthlyTaxRefundReminder(tx, { now: new Date('2026-07-05T09:00:00') });
  assert.equal(result.skipped, false);
  assert.equal(result.created, 2); // 两个用户各一条
  assert.equal(result.contracts, 2);
  assert.match(tx.created[0].title, /2026年6月发运 2 柜/);
  assert.match(tx.created[0].content, /EXP-002/);
  assert.match(tx.created[0].content, /1 柜尚未创建退税准备记录/);
  assert.match(tx.created[0].content, /次月5日仅为内部准备节点/);
  assert.match(tx.created[0].content, /次年4月30日前/);
  assert.doesNotMatch(tx.created[0].content, /每月1-15日/);
  assert.equal(tx.created[0].type, 'TAX_REFUND_MONTHLY');
  assert.equal(tx.created[0].link, '/dashboard/sales/sc2');
});

test('runMonthlyTaxRefundReminder: 本月已提醒的用户不重复生成', async () => {
  const tx = buildFakeTx({
    shippedContracts: [{ id: 'sc1', contractNo: 'EXP-001', hasTaxRefund: true }],
    existingNotifications: [{ userId: 'u1' }],
  });
  const result = await runMonthlyTaxRefundReminder(tx, { now: new Date('2026-07-05T09:00:00') });
  assert.equal(result.created, 1);
  assert.equal(tx.created[0].userId, 'u2');
});

test('runMonthlyTaxRefundReminder: 上月无发运合同时跳过', async () => {
  const tx = buildFakeTx({ shippedContracts: [] });
  const result = await runMonthlyTaxRefundReminder(tx, { now: new Date('2026-07-05T09:00:00') });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'no-shipped-contracts');
});

test('runInvoiceMissingReminder: 已出货缺发票合同生成催票提醒', async () => {
  const tx = buildFakeTx({
    missingInvoiceContracts: [
      { id: 'pc1', contractNo: 'PO-001', supplier: { name: '供应商A' } },
      { id: 'pc2', contractNo: 'PO-002', supplier: { name: '供应商B' } },
    ],
  });
  const result = await runInvoiceMissingReminder(tx, { now: new Date('2026-07-04T09:00:00') });
  assert.equal(result.skipped, false);
  assert.equal(result.created, 2);
  assert.equal(result.contracts, 2);
  assert.match(tx.created[0].title, /2 份采购合同待催开发票/);
  assert.match(tx.created[0].content, /PO-001（供应商A）/);
  assert.match(tx.created[0].content, /发票原件附件选填/);
  assert.equal(tx.created[0].type, 'INVOICE_MISSING');
  assert.equal(tx.created[0].link, '/dashboard/purchase/pc1');
});

test('runInvoiceMissingReminder: 当日已提醒则跳过重复用户', async () => {
  const tx = buildFakeTx({
    missingInvoiceContracts: [{ id: 'pc1', contractNo: 'PO-001', supplier: { name: '供应商A' } }],
    existingNotifications: [{ userId: 'u1' }, { userId: 'u2' }],
  });
  const result = await runInvoiceMissingReminder(tx, { now: new Date('2026-07-04T09:00:00') });
  assert.equal(result.created, 0);
  assert.equal(tx.created.length, 0);
});

test('runInvoiceMissingReminder: 无缺发票合同时跳过', async () => {
  const tx = buildFakeTx({ missingInvoiceContracts: [] });
  const result = await runInvoiceMissingReminder(tx, { now: new Date('2026-07-04T09:00:00') });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'no-missing-invoice');
});
