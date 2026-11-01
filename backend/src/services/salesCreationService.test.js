/** 创建请求规范化边界；原子落库和认证请求隔离由 HTTP/SQLite 集成覆盖。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pricingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sales-creation-pricing-'));
process.env.JIESONG_PRICING_CONFIG = path.join(pricingDir, 'pricing.json');
fs.writeFileSync(process.env.JIESONG_PRICING_CONFIG, JSON.stringify({
  exchangeRate: 6.72, exchangeAdjustment: -0.2, defaultMarkup: 0.3,
  categoryMarkups: [{ categoryId: 'cat-tile', categoryName: '瓷砖', markup: 0.1 }],
}), { mode: 0o600 });
test.after(() => fs.rmSync(pricingDir, { recursive: true, force: true }));
const { normalizeCreation, withRulePrices } = require('./salesCreationService');
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

test('未给售价的明细按唯一报价规则补齐（瓷砖按分类 ×1.1），不再用 成本 ÷ 汇率 × 1.3', async () => {
  const db = {
    product: { findMany: async () => [{ id: 'p-tile', categoryId: 'cat-tile' }, { id: 'p-cup', categoryId: null }] },
    productCategory: { findMany: async () => [{ id: 'cat-tile', parentId: null }] },
    salesItem: { findMany: async () => [] },
    quoteItem: { findMany: async () => [] },
  };
  const input = normalizeCreation({
    exchangeRate: 6.72,
    items: [{ ...item, productId: 'p-cup', costPrice: 10000, sellingPrice: undefined }, { ...item, productId: 'p-tile', costPrice: 10000, sellingPrice: undefined }, item],
  });
  assert.equal(input.items[0].sellingPrice, undefined);
  assert.deepEqual((await withRulePrices(input, db)).map(line => line.sellingPrice), [1994, 1688, 3]);
});

test('老商品未给售价时取上次确认价，新商品仍按规则', async () => {
  const db = {
    product: { findMany: async () => [{ id: 'p-cup', categoryId: null }, { id: 'p-new', categoryId: null }] },
    productCategory: { findMany: async () => [] },
    salesItem: { findMany: async () => [{ productId: 'p-cup', sellingPrice: 2500.5, createdAt: new Date('2026-10-01') }] },
    quoteItem: { findMany: async () => [] },
  };
  const input = normalizeCreation({
    exchangeRate: 6.72,
    items: [{ ...item, productId: 'p-cup', costPrice: 10000, sellingPrice: undefined }, { ...item, productId: 'p-new', costPrice: 10000, sellingPrice: undefined }],
  });
  assert.deepEqual((await withRulePrices(input, db)).map(line => line.sellingPrice), [2500.5, 1994]);
});
