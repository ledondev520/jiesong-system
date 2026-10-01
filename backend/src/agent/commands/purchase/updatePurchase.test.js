const test = require('node:test');
const assert = require('node:assert/strict');
const { updatePurchase } = require('./updatePurchase');

const draft = { id: 'p-1', status: 'DRAFT', taxRate: 13, paidAmount: 0, invoiceNo: null, _count: { payments: 0, files: 0 }, items: [{ _count: { inventories: 0, packingItems: 0 } }] };
const client = (contract, calls) => ({ $transaction: async (run) => run({
  purchaseContract: { findUnique: async () => contract, update: async (args) => { calls.push(args.data); return args.data; } },
}) });

test('草稿更正供应商和明细时原子重算含税合计并支持清空交期', async () => {
  const calls = [];
  await updatePurchase({ id: 'p-1', input: { supplierId: 's-2', expectedDate: null, items: [{ productId: 'x-2', quantity: 2, unitPrice: 100 }] }, prismaClient: client(draft, calls) });
  assert.equal(calls[0].supplierId, 's-2');
  assert.equal(calls[0].totalAmount, 226);
  assert.equal(calls[0].expectedDate, null);
  assert.deepEqual(calls[0].items.deleteMany, {});
  assert.equal(calls[0].items.create[0].totalPrice, 226);
});

test('已签约或已关联付款/库存/出口/归档的草稿不可更换采购明细', async () => {
  for (const contract of [
    { ...draft, status: 'SIGNED' },
    { ...draft, paidAmount: 1 },
    { ...draft, _count: { payments: 1, files: 0 } },
    { ...draft, _count: { payments: 0, files: 1 } },
    { ...draft, items: [{ _count: { inventories: 1, packingItems: 0 } }] },
    { ...draft, items: [{ _count: { inventories: 0, packingItems: 1 } }] },
  ]) {
    const calls = [];
    await assert.rejects(() => updatePurchase({ id: 'p-1', input: { items: [{ productId: 'x', quantity: 1, unitPrice: 1 }] }, prismaClient: client(contract, calls) }), /草稿|履行|归档/);
    assert.equal(calls.length, 0);
  }
});
