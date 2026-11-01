/**
 * Input: 合成采购合同、采购明细与到货合计（假 db，不连接数据库）
 * Output: 付款/到货/生产资料子状态的回归，重点：已完成但未付、未登记到货的合同不会被判为已结清
 * Pos: purchaseSubStatusService 单元测试
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { paymentState, arrivalState, attachPurchaseSubStatus } = require('./purchaseSubStatusService');

const readyItem = (id, contractId, quantity) => ({
  id, purchaseContractId: contractId, quantity, specification: 'S', boxes: 2, grossWeight: 10, netWeight: 8, volume: 1,
});

test('付款子状态逐分比较，零额合同为 NONE，多付仍为 PAID', () => {
  assert.equal(paymentState({ totalAmount: 1000, paidAmount: 0 }), 'UNPAID');
  assert.equal(paymentState({ totalAmount: 1000, paidAmount: 0.01 }), 'PARTIAL');
  assert.equal(paymentState({ totalAmount: 1000, paidAmount: 1000 }), 'PAID');
  assert.equal(paymentState({ totalAmount: 1000, paidAmount: 1200 }), 'PAID');
  assert.equal(paymentState({ totalAmount: 0, paidAmount: 0 }), 'NONE');
});

test('到货子状态逐明细比较，一行多到不能抵另一行缺货', () => {
  const items = [{ id: 'a', quantity: 10 }, { id: 'b', quantity: 10 }];
  assert.deepEqual(arrivalState(items, new Map()), { state: 'NONE', ordered: 20, arrived: 0, registered: false });
  assert.equal(arrivalState(items, new Map([['a', 10]])).state, 'PARTIAL');
  assert.equal(arrivalState(items, new Map([['a', 30]])).state, 'PARTIAL');
  assert.equal(arrivalState(items, new Map([['a', 10], ['b', 10]])).state, 'FULL');
  assert.equal(arrivalState([], new Map()).state, 'NONE');
});

test('attachPurchaseSubStatus：COMPLETED 未付款、无到货登记、资料不全时三项都如实暴露', async () => {
  const db = {
    purchaseItem: { findMany: async () => [
      { id: 'i1', purchaseContractId: 'c1', quantity: 50 },
      readyItem('i2', 'c2', 5),
    ] },
    purchaseReceiptItem: { groupBy: async () => [{ purchaseItemId: 'i2', _sum: { arrivedQuantity: 5 } }] },
  };
  const [c1, c2] = await attachPurchaseSubStatus([
    { id: 'c1', status: 'COMPLETED', totalAmount: 500, paidAmount: 0 },
    { id: 'c2', status: 'COMPLETED', totalAmount: 100, paidAmount: 100 },
  ], db);
  assert.deepEqual(c1.subStatus, {
    payment: 'UNPAID',
    arrival: { state: 'NONE', ordered: 50, arrived: 0, registered: false },
    docsComplete: false,
  });
  assert.deepEqual(c2.subStatus, {
    payment: 'PAID',
    arrival: { state: 'FULL', ordered: 5, arrived: 5, registered: true },
    docsComplete: true,
  });
  assert.equal(c1.status, 'COMPLETED', '不改写原状态');
});

test('空列表不查库', async () => {
  const db = { purchaseItem: { findMany: () => assert.fail('不应查询') } };
  assert.deepEqual(await attachPurchaseSubStatus([], db), []);
});
