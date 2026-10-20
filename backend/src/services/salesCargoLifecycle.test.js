/** 货物锁只改变已出库事实；历史别名、采购比例和资料补录保持同一契约。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { getSalesCargoState, assertSalesCargoMutable, assertSalesCargoUpdate } = require('./salesCargoLifecycle');

test('发运状态、历史别名或真实出库证据均锁定行集与数量/单位', () => {
  const cases = ['SHIPPED', 'ARRIVED', 'COMPLETED', 'OUT_STOCK', 'DELIVERED', 'PAID'].map(status => ({ status }));
  cases.push({ status: 'DRAFT', inventories: [{ id: 'synthetic-outbound' }] });
  for (const contract of cases) {
    assert.throws(() => assertSalesCargoMutable(contract), error => error.statusCode === 400);
    for (const data of [{ quantity: 51 }, { quantity: null }, { quantity: 'invalid' }, { unit: '箱' }, { unit: null }]) {
      assert.throws(() => assertSalesCargoUpdate(contract, { quantity: 50, unit: '件' }, data), error => error.statusCode === 400);
    }
    assert.doesNotThrow(() => assertSalesCargoUpdate(contract, { quantity: 50, unit: '件' }, { quantity: '50', unit: '件', note: '合成补录', unitPrice: 12, length: 1000 }));
  }
});

test('未发运货物仍可修改；采购来源的数量和箱规不允许绕过同比例导入', () => {
  for (const status of ['DRAFT', 'CONFIRMED', 'PACKING', 'PENDING_SHIPMENT']) {
    const contract = { status, inventories: [] };
    assert.doesNotThrow(() => assertSalesCargoMutable(contract));
    assert.doesNotThrow(() => assertSalesCargoUpdate(contract, { quantity: 50, unit: '件' }, { quantity: 51, unit: '箱' }));
    const source = { purchaseItemId: 'synthetic-purchase', quantity: 50, boxes: 5, grossWeight: 20000, netWeight: 19000, volume: 5, length: 1000, width: 1000, height: 1000 };
    for (const field of ['quantity', 'boxes', 'grossWeight', 'netWeight', 'volume', 'length', 'width', 'height']) {
      assert.throws(() => assertSalesCargoUpdate(contract, source, { [field]: source[field] + 1 }), /由导入比例锁定/);
      assert.doesNotThrow(() => assertSalesCargoUpdate(contract, source, { [field]: String(source[field]) }));
    }
  }
});

test('查询仅加载当前合同的出库存在性，缺失合同返回404', async () => {
  let query;
  const tx = { salesContract: { findUnique: async args => { query = args; return { id: 'synthetic-sales', status: 'DRAFT', inventories: [] }; } } };
  assert.equal((await getSalesCargoState(tx, 'synthetic-sales')).id, 'synthetic-sales');
  assert.deepEqual(query.where, { id: 'synthetic-sales' });
  assert.deepEqual(query.select.inventories, { where: { status: 'OUTBOUND' }, select: { id: true }, take: 1 });
  tx.salesContract.findUnique = async () => null;
  await assert.rejects(() => getSalesCargoState(tx, 'missing'), error => error.statusCode === 404);
});
