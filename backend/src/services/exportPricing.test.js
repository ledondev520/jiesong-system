/**
 * Input: 报价配置与成本/分类/现汇
 * Output: priceFor 唯一规则的取整、浮点保护、缺成本、分类加价与负责人示例
 * Pos: 报价规则契约测试（UX 规范 §7.2；负责人 2026-10-31 取整决定）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { ORDER_MARGIN_BAND, markupFor, orderMargin, priceFor, roundUnitPrice, historicalQuoteAllowed } = require('./exportPricing');
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
  assert.equal(roundUnitPrice(19.0000001, 1), 19);
  assert.equal(roundUnitPrice(19.000001, 1), 20);
  assert.equal(roundUnitPrice(19, 1), 19);
  assert.equal(roundUnitPrice(4.0000001, 5), 4); // 噪声不进位
  assert.equal(roundUnitPrice(5.0000001, 5), 5); // 噪声不把 5.00 当成 6
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
  // 负责人终版：整美元后再按个位取最近的 5 的倍数，1993.87 → 1994 → 1995
  assert.equal(priceFor({ costCny: 10000 }, { ...owner, roundUpTo: 5 }).unitPriceUsd, 1995);
});

test('负责人终版边界：<5 向上取整到整美元；≥5 整美元后取最近的 5 的倍数（含 5.01→5）', () => {
  const cases = [
    [0.2, 1], [0.0001, 1], [1, 1], [4.01, 5], [4.99, 5], [5, 5], [5.01, 5], [6, 5], [7.4, 10],
    [1991, 1990], [1992, 1990], [1993, 1995], [1993.87, 1995], [1994, 1995], [1995, 1995], [1996, 1995],
    [1997, 1995], [1998, 2000], [1999, 2000], [2000, 2000], [2001, 2000],
  ];
  for (const [raw, expected] of cases) assert.equal(roundUnitPrice(raw, 5), expected, `raw ${raw}`);
  // 个位全表（整美元 1990…1999 之外再看 10 以内：5→5，6/7→5，8/9→10，10→10，11/12→10，13→15）
  for (const [raw, expected] of [[5, 5], [6, 5], [7, 5], [8, 10], [9, 10], [10, 10], [11, 10], [12, 10], [13, 15]]) {
    assert.equal(roundUnitPrice(raw, 5), expected, `raw ${raw}`);
  }
});

test('priceFor 按单价取整并通过同一规则：1996→1995，1998→2000，2000 不变，0.2→1', () => {
  const five = { ...spec, exchangeRate: 6.5, exchangeAdjustment: 0, defaultMarkup: 0, roundUpTo: 5 };
  for (const [usd, expected] of [[1996, 1995], [1998, 2000], [2000, 2000], [1995, 1995], [0.2, 1], [4.01, 5], [5.01, 5]]) {
    assert.equal(priceFor({ costCny: usd * 6.5 }, five).unitPriceUsd, expected, String(usd));
  }
  // 18.0556 → 19 → 20；浮点噪声 13.000000000000002 → 13 → 15
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

test('订单利润率：负责人例子 成本 10000 @ 现汇 6.72 售价 1995 → 30.07%，在区间内', () => {
  const owner = { ...spec, exchangeRate: 6.72, exchangeAdjustment: -0.2 };
  const result = orderMargin({ lines: [{ costCny: 10000, quantity: 3, unitPriceUsd: 1995 }] }, owner);
  assert.equal(result.marginPct, 30.07);
  assert.equal(result.warning, null);
  // 订单保存的现汇优先于配置现汇
  assert.equal(orderMargin({ lines: [{ costCny: 10000, quantity: 1, unitPriceUsd: 1995 }], spotRate: 7.2 }, owner).marginPct, 39.65); // 1995 × 7.0 ÷ 10000 − 1
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
