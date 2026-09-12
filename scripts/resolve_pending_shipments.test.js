const test = require('node:test');
const assert = require('node:assert/strict');
const { planResolution } = require('./resolve_pending_shipments');
const pending = { id: 'pending', contractNo: 'PENDING-store' };
const target = { id: 'target', contractNo: 'EXP260010', status: 'SHIPPED', shippedAt: '2026-08-12T00:00:00.000Z' };
const item = { id: 'item', salesContractId: pending.id, productId: 'prod', storeId: 'store', product: { customsName: 'test' }, store: { name: 'store' }, quantity: 0, unitPrice: null, totalPrice: null, purchaseCost: null, purchaseContractNo: null, _count: { customsDeclarationItems: 0 } };
const row = { row: 2, contractNo: target.contractNo, productName: 'test', storeName: 'store', shippedAt: '2026-08-12', data: { quantity: 1, boxes: 1 } };
test('明确零数量占位可迁移，重复运行不再产生迁移', () => {
  const state = { contracts: [pending, target], packing: [item], inventory: [] };
  const first = planResolution({ rows: [row] }, state);
  assert.equal(first.operations.length, 1); assert.equal(first.operations[0].kind, 'move');
  const after = { ...state, packing: [{ ...item, ...first.operations[0].data }] };
  assert.equal(planResolution({ rows: [row] }, after).operations.length, 0);
});
test('无售价零数量占位可归并到有正式售价的等价行且不覆盖金额', () => {
  const official = { ...item, id: 'formal', salesContractId: target.id, quantity: 1, unitPrice: 20, totalPrice: 20 };
  const result = planResolution({ rows: [row] }, { contracts: [pending, target], packing: [item, official], inventory: [] });
  assert.equal(result.operations[0].kind, 'merge');
  assert.equal(result.operations[0].targetId, 'formal');
  assert.equal(result.operations[0].data, undefined);
});
test('报关引用、非零数量冲突与不同采购金额均不能被归并', () => {
  for (const changed of [{ ...item, _count: { customsDeclarationItems: 1 } }, { ...item, quantity: 3 }]) {
    assert.equal(planResolution({ rows: [row] }, { contracts: [pending, target], packing: [changed], inventory: [] }).operations.length, 0);
  }
  const official = { ...item, id: 'formal', salesContractId: target.id, quantity: 1, purchaseCost: 10 };
  assert.equal(planResolution({ rows: [row] }, { contracts: [pending, target], packing: [item, official], inventory: [] }).operations.length, 0);
});
test('只有唯一源行、正式装箱且无重复库存，才修正库存归属和出库事实', () => {
  const inventory = { ...item, quantity: 1, status: 'PRODUCING' };
  const official = { ...item, salesContractId: target.id, quantity: 1 };
  const state = { contracts: [pending, target], packing: [official], inventory: [inventory] };
  const result = planResolution({ rows: [row] }, state);
  assert.equal(result.operations[0].data.status, 'OUTBOUND');
  assert.equal(planResolution({ rows: [row, row] }, state).operations.length, 0);
  assert.equal(planResolution({ rows: [row] }, { ...state, inventory: [inventory, { ...inventory, salesContractId: target.id }] }).operations.length, 0);
});
