const test = require('node:test');
const assert = require('node:assert/strict');
const { createPurchaseReceipt, inspectPurchaseReceipt, listPurchaseReceipts, listPurchaseReceiptInspections } = require('./purchaseReceiptService');

// 只操作合成内存数据，事务按 SQLite 的串行写入语义提交或完整回滚。
function database() {
  let state = { contract: { id: 'pc-1', status: 'SHIPPED', items: [{ id: 'pi-1', productId: 'product-1', quantity: 10, unit: '件', product: { customsName: '合成商品' } }] }, receipts: [], items: [], inspections: [], inventories: [], sequence: 0 };
  let queue = Promise.resolve();
  let failInventory = false;
  const user = { id: 'user-1', name: '合成操作者' };
  const methods = (s) => {
    const decorateInspection = (row) => ({ ...row, inspectedBy: user, receiptItem: { ...s.items.find(i => i.id === row.receiptItemId), purchaseItem: s.contract.items[0] } });
    const decorate = (row) => row && ({ ...row, createdBy: user, items: s.items.filter(i => i.receiptId === row.id).map(i => ({ ...i, purchaseItem: s.contract.items.find(p => p.id === i.purchaseItemId), inspections: s.inspections.filter(e => e.receiptItemId === i.id).slice(-20).reverse().map(decorateInspection), _count: { inspections: s.inspections.filter(e => e.receiptItemId === i.id).length } })) });
    const receiptMatch = (row, where) => (!where.id || row.id === where.id) && (!where.purchaseContractId || row.purchaseContractId === where.purchaseContractId);
    const inspectionMatch = (row, where) => (!where.receiptId || row.receiptId === where.receiptId) && (!where.requestId || row.requestId === where.requestId);
    return {
      purchaseContract: {
        findUnique: async () => ({ ...s.contract, _count: { receipts: s.receipts.length } }),
        updateMany: async ({ where, data }) => { if (where.status && where.status !== s.contract.status) return { count: 0 }; Object.assign(s.contract, data); return { count: 1 }; },
        update: async ({ data }) => Object.assign(s.contract, data),
      },
      purchaseReceipt: {
        findUnique: async ({ where }) => { const key = where.purchaseContractId_requestId; return decorate(s.receipts.find(r => key ? r.purchaseContractId === key.purchaseContractId && r.requestId === key.requestId : r.id === where.id)); },
        findFirst: async ({ where }) => decorate(s.receipts.find(r => receiptMatch(r, where))),
        findMany: async ({ where, skip = 0, take = 100 }) => s.receipts.filter(r => receiptMatch(r, where)).slice().reverse().slice(skip, skip + take).map(decorate),
        count: async () => s.receipts.length,
        create: async ({ data }) => { const id = `receipt-${++s.sequence}`; const { items, ...head } = data; const row = { id, createdAt: new Date(), ...head }; s.receipts.push(row); for (const item of items.create) s.items.push({ id: `receipt-item-${++s.sequence}`, receiptId: id, acceptedQuantity: 0, reinspectionQuantity: 0, ...item }); return decorate(row); },
      },
      purchaseReceiptItem: {
        groupBy: async () => s.contract.items.map(p => ({ purchaseItemId: p.id, _sum: ['arrivedQuantity', 'acceptedQuantity', 'reinspectionQuantity'].reduce((sum, key) => ({ ...sum, [key]: s.items.filter(i => i.purchaseItemId === p.id).reduce((n, i) => n + i[key], 0) }), {}) })),
        updateMany: async ({ where, data }) => { const i = s.items.find(i => i.id === where.id && i.acceptedQuantity === where.acceptedQuantity && i.reinspectionQuantity === where.reinspectionQuantity); if (!i) return { count: 0 }; Object.assign(i, data); return { count: 1 }; },
      },
      purchaseReceiptInspection: {
        findMany: async ({ where, skip = 0, take = 100 }) => s.inspections.filter(i => inspectionMatch(i, where)).slice().reverse().slice(skip, skip + take).map(decorateInspection),
        count: async ({ where }) => s.inspections.filter(i => inspectionMatch(i, where)).length,
        create: async ({ data }) => { const row = { id: `inspection-${++s.sequence}`, ...data }; s.inspections.push(row); return row; },
      },
      inventory: {
        findMany: async () => s.inventories.filter(i => !i.receiptInspectionId),
        create: async ({ data }) => { if (failInventory) throw new Error('synthetic inventory failure'); const row = { id: `inventory-${++s.sequence}`, ...data }; s.inventories.push(row); return row; },
      },
    };
  };
  const db = { $transaction(run) { const attempt = queue.then(async () => { const next = structuredClone(state); const result = await run(methods(next)); state = next; return result; }); queue = attempt.catch(() => {}); return attempt; } };
  return { db, state: () => state, failInventory: () => { failInventory = true; }, addLegacy: () => state.inventories.push({ purchaseItemId: 'pi-1', quantity: 2, receiptInspectionId: null }), setStatus: (status) => { state.contract.status = status; }, setSettlement: (totalAmount, paidAmount) => { state.contract.totalAmount = totalAmount; state.contract.paidAmount = paidAmount; } };
}
const arrival = (key, quantity = 4) => ({ requestId: key, arrivedAt: '2026-10-01T00:00:00.000Z', note: '合成到货', items: [{ purchaseItemId: 'pi-1', arrivedQuantity: quantity }] });
const inspect = (key, itemId, accepted, reinspection = 0) => ({ requestId: key, note: '合成验货说明', items: [{ receiptItemId: itemId, acceptedQuantity: accepted, reinspectionQuantity: reinspection }] });
const register = (fixture, input) => createPurchaseReceipt('pc-1', input, 'user-1', fixture.db);
const review = (fixture, receipt, input) => inspectPurchaseReceipt('pc-1', receipt.id, input, 'user-1', fixture.db);

test('分批到货全待验，部分合格增量入库，待复验不能出库，最后全合格才收货', async () => {
  const f = database();
  const first = await register(f, { ...arrival('arrival-1', 4), createdById: 'spoofed-user' });
  assert.equal(f.state().receipts[0].createdById, 'user-1');
  assert.equal(first.receipt.items[0].pendingQuantity, 4);
  assert.equal(f.state().inventories.length, 0);
  const partial = await review(f, first.receipt, inspect('inspection-1', first.receipt.items[0].id, 3, 1));
  assert.equal(partial.status, 'SHIPPED');
  assert.equal(partial.summary.items[0].reinspectionQuantity, 1);
  assert.equal(f.state().inventories[0].quantity, 3);
  assert.equal(f.state().inventories[0].status, 'INBOUND');
  assert.ok(f.state().inventories[0].receiptInspectionId);
  const second = await register(f, arrival('arrival-2', 6));
  await review(f, second.receipt, inspect('inspection-2', second.receipt.items[0].id, 6));
  assert.equal(f.state().contract.status, 'SHIPPED');
  const done = await review(f, first.receipt, inspect('inspection-3', first.receipt.items[0].id, 4));
  assert.equal(done.status, 'RECEIVED');
  assert.equal(done.summary.complete, true);
  assert.equal(f.state().inventories.reduce((sum, i) => sum + i.quantity, 0), 10);
  assert.equal(f.state().inspections.length, 3);
  assert.equal(done.receipt.items[0].inspections[0].inspectedBy.displayName, '合成操作者');
  assert.ok(done.receipt.items[0].inspections[0].inspectedAt);
});

test('到货与验货相同requestId/payload幂等，不同内容409，完成后的重试仍复放', async () => {
  const f = database();
  const [a, b] = await Promise.all([register(f, arrival('arrival-1', 10)), register(f, arrival('arrival-1', 10))]);
  assert.equal(a.receipt.id, b.receipt.id);
  assert.equal(b.idempotentReplay, true);
  await assert.rejects(() => register(f, arrival('arrival-1', 9)), (e) => e.statusCode === 409);
  const input = inspect('inspection-1', a.receipt.items[0].id, 10);
  await review(f, a.receipt, input);
  const replay = await review(f, a.receipt, input);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(f.state().inventories.length, 1);
  assert.equal(f.state().inspections.length, 1);
  await assert.rejects(() => review(f, a.receipt, { ...input, note: '更改内容' }), (e) => e.statusCode === 409);
});

test('并发不同请求不能超订，累计合格不得下调、跨批引用和空验货备注拒绝', async () => {
  const f = database();
  const results = await Promise.allSettled([register(f, arrival('a-1', 6)), register(f, arrival('a-2', 6))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.state().items.reduce((sum, i) => sum + i.arrivedQuantity, 0), 6);
  const receipt = results.find(r => r.status === 'fulfilled').value.receipt;
  await review(f, receipt, inspect('i-1', receipt.items[0].id, 3));
  for (const input of [inspect('i-2', receipt.items[0].id, 2), inspect('i-3', receipt.items[0].id, 4, 3), inspect('i-4', 'foreign-item', 1), { ...inspect('i-5', receipt.items[0].id, 4), note: '' }]) {
    await assert.rejects(() => review(f, receipt, input), (e) => e.statusCode === 400);
  }
  assert.equal(f.state().inspections.length, 1);
  assert.equal(f.state().inventories[0].quantity, 3);
});

test('库存创建失败完整回滚验货证据、累计数量与合同状态，旧库存不自动补验货', async () => {
  const f = database();
  const first = await register(f, arrival('a-1', 10));
  f.failInventory();
  await assert.rejects(() => review(f, first.receipt, inspect('i-1', first.receipt.items[0].id, 10)), /synthetic inventory failure/);
  assert.equal(f.state().items[0].acceptedQuantity, 0);
  assert.equal(f.state().inspections.length, 0);
  assert.equal(f.state().inventories.length, 0);
  assert.equal(f.state().contract.status, 'SHIPPED');
  const legacy = database(); legacy.addLegacy();
  await assert.rejects(() => register(legacy, arrival('old-1')), /历史/);
  const old = await listPurchaseReceipts('pc-1', {}, legacy.db);
  assert.equal(old.summary.legacy, true);
  assert.equal(old.items.length, 0);
});

test('批次和全部验货证据有真实分页，输入边界拒绝负数/非数值/重复行', async () => {
  const f = database();
  const receipt = (await register(f, arrival('a-1', 10))).receipt;
  for (let i = 0; i < 23; i++) await review(f, receipt, inspect(`i-${i}`, receipt.items[0].id, 1));
  const page = await listPurchaseReceipts('pc-1', { page: 1, pageSize: 20 }, f.db);
  assert.equal(page.items[0].items[0].inspectionCount, 23);
  assert.equal(page.items[0].items[0].inspections.length, 20);
  const history = await listPurchaseReceiptInspections('pc-1', receipt.id, { page: 2, pageSize: 20 }, f.db);
  assert.equal(history.pagination.total, 23);
  assert.equal(history.items.length, 3);
  for (const input of [arrival('bad-1', -1), arrival('bad-2', '1'), { ...arrival('bad-3'), items: [arrival('x').items[0], arrival('x').items[0]] }]) await assert.rejects(() => register(f, input), (e) => e.statusCode === 400);
});


test('全量合格且款项已结清复用共享结清规则完成采购，库存来源仍完整', async () => {
  const f = database(); f.setSettlement(100, 100);
  const receipt = (await register(f, arrival('a-paid', 10))).receipt;
  const result = await review(f, receipt, inspect('i-paid', receipt.items[0].id, 10));
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.summary.complete, true);
  assert.equal(f.state().inventories[0].quantity, 10);
  assert.equal(f.state().inspections[0].inspectedById, 'user-1');
});
