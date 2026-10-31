/**
 * Input: 报价配置与成本/分类/现汇
 * Output: priceFor 唯一规则的取整、浮点保护、缺成本、分类加价与负责人示例
 * Pos: 报价规则契约测试（UX 规范 §7.2；负责人 2026-10-31 取整决定）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { markupFor, priceFor, roundUp, historicalQuoteAllowed } = require('./exportPricing');
const { chainFor } = require('./productCategoryChain');

// 规范 §7.2 示例：现汇 7.2、不加调整，便于对照
const spec = {
  exchangeRate: 7.2, exchangeAdjustment: 0, defaultMarkup: 0.3, roundUpTo: 1,
  categoryMarkups: [{ categoryId: 'tile', categoryName: '瓷砖', markup: 0.1 }],
};

test('规范示例：普通 ×1.3、瓷砖 ×1.1，整美元向上取整', () => {
  assert.equal(priceFor({ costCny: 100 }, spec).unitPriceUsd, 19); // 130/7.2=18.0556
  assert.equal(priceFor({ costCny: 100, categoryIds: ['tile'] }, spec).unitPriceUsd, 16); // 110.00000000000001/7.2=15.2778
  assert.equal(priceFor({ costCny: 55.38 }, spec).unitPriceUsd, 10); // 71.994/7.2=9.9992
});

test('浮点保护：恰好为整数的结果不被误进位', () => {
  // 72×1.3=93.60000000000001，÷7.2=13.000000000000002，保护后仍为 13
  assert.equal(priceFor({ costCny: 72 }, spec).unitPriceUsd, 13);
  assert.equal(roundUp(19.0000001, 1), 19);
  assert.equal(roundUp(19.000001, 1), 20);
  assert.equal(roundUp(19, 1), 19);
  assert.equal(roundUp(18.0001, 5), 20);
  assert.equal(roundUp(20, 5), 20);
});

test('缺成本不给建议价：空、0、负数、非数字', () => {
  for (const costCny of [undefined, null, '', 0, -5, 'abc', NaN]) {
    const result = priceFor({ costCny }, spec);
    assert.equal(result.status, 'MISSING_COST');
    assert.equal(result.unitPriceUsd, null);
  }
});

test('现汇缺失或调整后非正数时拒绝报价，传入订单现汇时用订单现汇', () => {
  assert.equal(priceFor({ costCny: 100, spotRate: 0 }, spec).status, 'INVALID_RATE');
  assert.equal(priceFor({ costCny: 100, spotRate: 'x' }, spec).status, 'INVALID_RATE');
  assert.equal(priceFor({ costCny: 100, spotRate: 3.6 }, spec).unitPriceUsd, 37); // 130/3.6=36.11
});

test('负责人示例：成本 10000 ¥、现汇 6.72、调整 -0.2 → 13000/6.52=1993.865', () => {
  const owner = { ...spec, exchangeRate: 6.72, exchangeAdjustment: -0.2 };
  const result = priceFor({ costCny: 10000 }, owner);
  assert.equal(result.effectiveRate, 6.52);
  assert.ok(Math.abs(result.rawUnitPriceUsd - 1993.865) < 0.001);
  assert.equal(result.unitPriceUsd, 1994); // 步长 1：只取整到整美元
  // 负责人终版：整美元后再向上取整到 5 的倍数，1993.87 → 1994 → 1995
  assert.equal(priceFor({ costCny: 10000 }, { ...owner, roundUpTo: 5 }).unitPriceUsd, 1995);
});

test('负责人终版：整美元后再取整到 5 的倍数（1996→2000，2000 不变，2001→2005）', () => {
  const five = { ...spec, exchangeRate: 6.5, exchangeAdjustment: 0, defaultMarkup: 0, roundUpTo: 5 };
  for (const [usd, expected] of [[1996, 2000], [2000, 2000], [2001, 2005], [1995, 1995], [1, 5]]) {
    assert.equal(priceFor({ costCny: usd * 6.5 }, five).unitPriceUsd, expected, String(usd));
  }
  // 整美元先于步长：18.0556 → 19 → 20；浮点噪声 13.000000000000002 → 13 → 15
  assert.equal(priceFor({ costCny: 100 }, { ...spec, roundUpTo: 5 }).unitPriceUsd, 20);
  assert.equal(priceFor({ costCny: 72 }, { ...spec, roundUpTo: 5 }).unitPriceUsd, 15);
});

test('仓库默认配置步长为 5', () => {
  assert.equal(require('../../../config/pricing.json').roundUpTo, 5);
});

test('分类加价取最近已配置的祖先，否则默认加价', () => {
  assert.equal(markupFor(['sub', 'tile', 'root'], spec), 0.1);
  assert.equal(markupFor(['sub', 'root'], spec), 0.3);
  assert.equal(markupFor([], spec), 0.3);
  assert.equal(markupFor(undefined, spec), 0.3);
  const nested = { ...spec, categoryMarkups: [...spec.categoryMarkups, { categoryId: 'sub', categoryName: '子类', markup: 0.2 }] };
  assert.equal(markupFor(['sub', 'tile'], nested), 0.2);
});

test('分类链：沿 parentId 向上，遇到环停止', () => {
  const parents = new Map([['a', 'b'], ['b', 'c'], ['c', null]]);
  assert.deepEqual(chainFor('a', parents), ['a', 'b', 'c']);
  assert.deepEqual(chainFor(null, parents), []);
  assert.deepEqual(chainFor('x', new Map([['x', 'y'], ['y', 'x']])), ['x', 'y']);
});

test('历史报价复算按分类目标加价并保留 5 个百分点容差', () => {
  const base = { quantity: 10, effectiveRate: 6.6, costCny: 6600, categoryIds: [] };
  assert.equal(historicalQuoteAllowed({ ...base, unitPriceUsd: 130 }, spec).allowed, true);
  assert.equal(historicalQuoteAllowed({ ...base, unitPriceUsd: 200 }, spec).allowed, false);
  assert.equal(historicalQuoteAllowed({ ...base, unitPriceUsd: 110, categoryIds: ['tile'] }, spec).allowed, true);
  assert.equal(historicalQuoteAllowed({ ...base, unitPriceUsd: 130, costCny: 0 }, spec).allowed, false);
});
