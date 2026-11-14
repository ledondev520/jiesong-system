/**
 * Input: 报价配置与成本/分类/现汇
 * Output: priceFor 唯一规则的取整、浮点保护、缺成本、分类加价与负责人示例
 * Pos: 报价规则契约测试（UX 规范 §7.2；2026-11-14 确认：分档就近取整及非阻断利润提示）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { ORDER_MARGIN_BAND, markupFor, orderMargin, priceFor, roundUnitPrice, historicalQuoteAllowed } = require('./exportPricing');
const { chainFor } = require('./productCategoryChain');

// 规范 §7.2 示例：现汇 7.2、不加调整，便于对照
const spec = {
  exchangeRate: 7.2, exchangeAdjustment: 0, defaultMarkup: 0.3,
  categoryMarkups: [{ categoryId: 'tile', categoryName: '瓷砖', markup: 0.1 }],
};

test('分档就近取整：档位边界、中点向上、浮点保护和最低正报价', () => {
  for (const [raw, expected] of [
    [0, 0], [-1, 0], [NaN, 0], [0.0001, 0.5], [0.2, 0.5], [1.25, 1.5], [1.707, 1.5], [2.63, 2.5],
    [9.74, 9.5], [9.75, 10], [10, 10], [12.5, 15], [25.11, 25], [40.77, 40], [63.45, 65],
    [99.99, 100], [100, 100], [125, 150], [191.53, 200], [888, 900], [999.99, 1000], [1000, 1000],
    [1253, 1250], [1993.87, 2000], [4999.99, 5000], [5000, 5000], [5500, 6000], [7032, 7000], [9574, 10000],
    [2.749999999999, 3], [100.0000000001, 100],
  ]) assert.equal(roundUnitPrice(raw), expected, `raw ${raw}`);
});

test('priceFor共用分档规则，偏离分类目标超过5个百分点只提示', () => {
  const normal = priceFor({ costCny: 100 }, spec);
  assert.equal(normal.unitPriceUsd, 20);
  assert.match(normal.roundingWarning, /取整.*加价.*目标/);
  const tile = priceFor({ costCny: 100, categoryIds: ['tile'] }, spec);
  assert.equal(tile.unitPriceUsd, 15);
  assert.equal(tile.roundingWarning, null);
  const owner = priceFor({ costCny: 10000 }, { ...spec, exchangeRate: 6.72, exchangeAdjustment: -0.2 });
  assert.equal(owner.unitPriceUsd, 2000);
  assert.equal(owner.effectiveRate, 6.52);
  assert.ok(Math.abs(owner.rawUnitPriceUsd - 1993.865) < 0.001);
  assert.equal(owner.roundingWarning, null);
  assert.equal(priceFor({ costCny: 100 }, { ...spec, roundUpTo: 5 }).unitPriceUsd, 20);
});

test('缺成本或汇率无效时仍不给建议价', () => {
  for (const costCny of [undefined, null, '', 0, -5, 'abc', NaN]) {
    const result = priceFor({ costCny }, spec);
    assert.equal(result.status, 'MISSING_COST');
    assert.equal(result.unitPriceUsd, null);
  }
  for (const spotRate of [0, 'x']) assert.equal(priceFor({ costCny: 100, spotRate }, spec).status, 'INVALID_RATE');
  assert.equal(priceFor({ costCny: 100, spotRate: 3.6 }, spec).unitPriceUsd, 35);
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

// 报价汇率 5.2 − 0.2 = 5，成本 ¥100 × 1 件：售价 $26 → ¥130 → 利润率恰为 30%
const band = { ...spec, exchangeRate: 5.2, exchangeAdjustment: -0.2 };
const line = (unitPriceUsd, extra = {}) => ({ costCny: 100, quantity: 1, unitPriceUsd, ...extra });

test('订单利润率：区间 30%~35% 只在一个常量里', () => {
  assert.deepEqual(ORDER_MARGIN_BAND, { min: 0.3, max: 0.35 });
});

test('订单利润率：区间内与端点（恰好 30%、35%）不提示', () => {
  for (const [price, pct] of [[26, 30], [26.5, 32.5], [27, 35]]) {
    const result = orderMargin({ lines: [line(price)] }, band);
    assert.equal(result.marginPct, pct);
    assert.equal(result.warning, null, String(price));
  }
});

test('订单利润率：低于 30% 或高于 35% 给出不阻断的提示', () => {
  assert.equal(orderMargin({ lines: [line(25.9)] }, band).warning, '订单整体利润率 29.5% 不在 30%~35% 范围内');
  assert.equal(orderMargin({ lines: [line(27.1)] }, band).warning, '订单整体利润率 35.5% 不在 30%~35% 范围内');
  // 按订单整体判断：一行偏低、一行偏高合计在区间内则不提示
  assert.equal(orderMargin({ lines: [line(25), line(28)] }, band).warning, null);
});

test('订单利润率：负责人例子 成本 10000 @ 现汇 6.72 售价 1994 → 30.01%，在区间内', () => {
  const owner = { ...spec, exchangeRate: 6.72, exchangeAdjustment: -0.2 };
  const result = orderMargin({ lines: [{ costCny: 10000, quantity: 3, unitPriceUsd: 1994 }] }, owner);
  assert.equal(result.marginPct, 30.01);
  assert.equal(result.warning, null);
  // 订单保存的现汇优先于配置现汇
  assert.equal(orderMargin({ lines: [{ costCny: 10000, quantity: 1, unitPriceUsd: 1994 }], spotRate: 7.2 }, owner).marginPct, 39.58); // 1994 × 7.0 ÷ 10000 − 1
});

test('订单利润率：瓷砖（分类加价）行不参与区间检查；只有瓷砖行不提示', () => {
  const mixed = orderMargin({ lines: [line(26.5), line(22, { categoryIds: ['tile-sub', 'tile'] })] }, band);
  assert.equal(mixed.marginPct, 32.5);
  assert.equal(mixed.excludedLines, 1);
  assert.equal(mixed.warning, null);
  const tilesOnly = orderMargin({ lines: [line(22, { categoryIds: ['tile'] })] }, band);
  assert.deepEqual([tilesOnly.margin, tilesOnly.warning, tilesOnly.excludedLines], [null, null, 1]);
});

test('订单利润率：售价合计为 0、成本为 0、无明细或汇率无效时不报错也不提示', () => {
  for (const input of [{ lines: [line(0)] }, { lines: [{ ...line(26), costCny: 0 }] }, { lines: [] }, {}, { lines: [line(26)], spotRate: 0.1 }]) {
    const result = orderMargin(input, band);
    assert.equal(result.margin, null);
    assert.equal(result.warning, null);
  }
});
