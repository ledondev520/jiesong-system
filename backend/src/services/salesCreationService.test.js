/** 创建请求规范化边界；原子落库和认证请求隔离由 HTTP/SQLite 集成覆盖。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCreation } = require('./salesCreationService');
const item = { productId: 'synthetic-product', storeId: 'synthetic-store', quantity: 2, costPrice: 10, sellingPrice: 3 };

test('规范化完整创建，不改写调用者输入，金额和编号保持明确含义', () => {
  const input = { contractNo: ' SYNTHETIC-CUSTOM ', exchangeRate: '7.2', signedAt: '2026-10-01', items: [item] };
  const result = normalizeCreation(input);
  assert.equal(result.contractNo, 'SYNTHETIC-CUSTOM');
  assert.equal(result.exchangeRate, 7.2);
  assert.equal(result.signedAt, '2026-10-01T00:00:00.000Z');
  assert.equal(result.items[0].sellingPrice, 3);
  assert.equal(input.contractNo, ' SYNTHETIC-CUSTOM ');
  assert.equal(item.note, undefined);
  assert.equal(normalizeCreation({ exchangeRate: 7.2 }).items, null);
});

test('非法表头或任一明细必须在提交前拒绝', () => {
  for (const exchangeRate of [undefined, null, true, false, {}, [], 0, -1, Infinity, '', 'bad']) {
    assert.throws(() => normalizeCreation({ exchangeRate }), error => error.statusCode === 400);
  }
  for (const patch of [{ items: [] }, { items: {} }, { items: Array(101).fill(item) }, { signedAt: 'invalid' }, { contractNo: {} }, { note: 'x'.repeat(2001) }]) {
    assert.throws(() => normalizeCreation({ exchangeRate: 7.2, ...patch }), error => error.statusCode === 400);
  }
  for (const patch of [{ productId: '' }, { storeId: '' }, { quantity: '2' }, { quantity: -1 }, { costPrice: NaN }, { sellingPrice: 0 }, { note: {} }]) {
    assert.throws(() => normalizeCreation({ exchangeRate: 7.2, items: [item, { ...item, ...patch }] }), error => error.statusCode === 400);
  }
});
