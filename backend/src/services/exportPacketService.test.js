/**
 * Input: 出口三单冻结快照、定价政策和 Excel 生成器
 * Output: 利润约束、历史报价筛选、预检阻断和三 Sheet 结构测试
 * Pos: 出口三单工作台领域 Module 契约测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
  buildExportPacketWorkbook,
  evaluateExportPacket,
  historicalQuoteAllowed,
  writePacketAmounts,
} = require('./exportPacketService');

const contract = (overrides = {}) => ({
  id: 'sales-1',
  contractNo: 'EXP260011',
  exchangeRate: 6.8,
  totalBoxes: 2,
  grossWeight: 120,
  netWeight: 100,
  volume: 1.2,
  port: { name: '洛杉矶' },
  packingItems: [{
    id: 'packing-1',
    productId: 'product-1',
    quantity: 10,
    unit: '件',
    boxes: 2,
    grossWeight: 120,
    netWeight: 100,
    volume: 1.2,
    purchaseCost: 6600,
    specification: '100*200*300',
    product: { customsName: '测试商品', declaration: '0|0|测试用途|无品牌|无型号' },
    store: { name: '圣荷西2115' },
  }],
  ...overrides,
});

const readiness = (overrides = {}) => ({
  portName: '洛杉矶',
  lines: [{
    packingItemId: 'packing-1',
    productName: '测试商品',
    hsCode: '9405110000',
    hsSource: 'product_archive',
    hsEvidence: { refundRate: 13 },
    declarationElements: '0|0|测试用途|无品牌|无型号',
    unit: '件',
    ...overrides,
  }],
});

const options = (overrides = {}) => ({
  spotRate: 6.8,
  sellerName: '上海捷淞国际物流有限公司',
  buyerName: 'Sp food trading LLC',
  packageKind: '木箱',
  tradeTerm: 'FOB',
  documentDate: '2026-08-13',
  ...overrides,
});

test('历史报价只在按本票成本复算后符合利润政策时允许采用', () => {
  assert.equal(historicalQuoteAllowed({
    unitPriceUsd: 130,
    quantity: 10,
    effectiveRate: 6.6,
    costCny: 6600,
  }).allowed, true);
  assert.equal(historicalQuoteAllowed({
    unitPriceUsd: 200,
    quantity: 10,
    effectiveRate: 6.6,
    costCny: 6600,
  }).allowed, false);
});

test('完整资料形成可生成快照，展示调整汇率、实际加价和价格来源（单价取整）', () => {
  const packet = evaluateExportPacket(contract(), readiness(), [], options());
  assert.equal(packet.ready, true);
  assert.equal(packet.pricingPolicy.effectiveRate, 6.6);
  assert.equal(packet.lines[0].pricingSource, 'formula');
  assert.equal(packet.lines[0].unitPriceUsd, 130);
  assert.ok(Math.abs(packet.lines[0].realizedMarkup - 0.3) <= 0.01);
  assert.equal(packet.summary.boxes, 2);
});

test('包装种类、规格或表头净重与明细冲突时阻断生成', () => {
  const blockedContract = contract({
    netWeight: 99.5,
    packingItems: [{ ...contract().packingItems[0], specification: '' }],
  });
  const packet = evaluateExportPacket(blockedContract, readiness({ declarationElements: '0|0|测试用途' }), [], options({ packageKind: '' }));
  assert.equal(packet.ready, false);
  assert.ok(packet.issues.some((issue) => issue.code === 'MISSING_PACKAGE_KIND'));
  assert.ok(packet.issues.some((issue) => issue.code === 'MISSING_SPECIFICATION'));
  assert.ok(packet.issues.some((issue) => issue.code === 'HEADER_NET_MISMATCH'));
});

test('人工覆盖单价偏离目标加价超过5个百分点时阻断', () => {
  const packet = evaluateExportPacket(contract(), readiness(), [], options({
    priceOverrides: [{ packingItemId: 'packing-1', unitPriceUsd: 120 }],
  }));
  assert.equal(packet.ready, false);
  assert.ok(packet.issues.some((issue) => issue.code === 'MARKUP_OUTSIDE_POLICY'));
});

test('工作簿只生成外销合同、商业发票、装箱单三张表且合计一致', async () => {
  const packet = evaluateExportPacket(contract(), readiness(), [], options());
  const buffer = await buildExportPacketWorkbook(packet);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['外销合同', '商业发票', '装箱单']);
  assert.equal(workbook.getWorksheet('外销合同').getCell('H11').value, packet.summary.totalUsd);
  assert.equal(workbook.getWorksheet('商业发票').getCell('H11').value, packet.summary.totalUsd);
  assert.equal(workbook.getWorksheet('装箱单').getCell('H11').value, packet.summary.netWeight);
});

test('分类加价沿祖先链取最近一项：瓷砖 10%，单价取整到整美元', () => {
  const tile = contract({
    packingItems: [{ ...contract().packingItems[0], product: { ...contract().packingItems[0].product, categoryIds: ['tile-sub', 'tile'] } }],
  });
  const config = { ...require('../../../config/pricing.json'), categoryMarkups: [{ categoryId: 'tile', categoryName: '瓷砖', markup: 0.1 }] };
  const packet = evaluateExportPacket(tile, readiness(), [], options(), config);
  assert.equal(packet.lines[0].targetMarkup, 0.1);
  assert.equal(packet.lines[0].unitPriceUsd, 110);
  assert.equal(packet.lines[0].roundingMethod, 'round_up_unit');
});


test('订单已确认单价（商品 × 门店唯一价）优先于公式价与历史价；人工覆盖仍可改写；同对多价不猜测', () => {
  const storeKey = { productId: 'product-1', storeId: 'store-1' };
  const withStore = (extra = {}) => contract({
    packingItems: [{ ...contract().packingItems[0], storeId: 'store-1' }],
    ...extra,
  });
  const rule = evaluateExportPacket(withStore(), readiness(), [], options());
  const ruleLine = rule.lines[0];
  assert.equal(ruleLine.pricingSource, 'formula');

  const confirmed = evaluateExportPacket(withStore({ items: [{ ...storeKey, sellingPrice: 777 }] }), readiness(), [], options());
  assert.equal(confirmed.lines[0].pricingSource, 'order');
  assert.equal(confirmed.lines[0].unitPriceUsd, 777);
  assert.equal(confirmed.lines[0].totalUsd, 7770);
  assert.notEqual(confirmed.lines[0].unitPriceUsd, ruleLine.unitPriceUsd);

  // 本票人工确认仍是最后一道覆盖
  const manual = evaluateExportPacket(withStore({ items: [{ ...storeKey, sellingPrice: 777 }] }), readiness(), [],
    options({ priceOverrides: [{ packingItemId: 'packing-1', unitPriceUsd: ruleLine.unitPriceUsd }] }));
  assert.equal(manual.lines[0].pricingSource, 'manual');

  // 同一商品 × 门店出现两个不同价格：不采用订单价，回退公式并给出警告（不阻断）
  const ambiguous = evaluateExportPacket(
    withStore({ items: [{ ...storeKey, sellingPrice: 700 }, { ...storeKey, sellingPrice: 800 }] }), readiness(), [], options());
  assert.equal(ambiguous.lines[0].pricingSource, 'formula');
  assert.ok(ambiguous.lines[0].issues.some((issue) => issue.code === 'AMBIGUOUS_ORDER_PRICE' && issue.severity === 'warning'));
  assert.equal(ambiguous.lines[0].issues.some((issue) => issue.severity === 'error' && issue.code === 'AMBIGUOUS_ORDER_PRICE'), false);

  // 同价重复行（拆行）视为同一个确认价；其它商品/门店不受影响
  const sameTwice = evaluateExportPacket(
    withStore({ items: [{ ...storeKey, sellingPrice: 777 }, { ...storeKey, sellingPrice: 777 }, { productId: 'other', storeId: 'store-1', sellingPrice: 5 }] }),
    readiness(), [], options());
  assert.equal(sameTwice.lines[0].unitPriceUsd, 777);
});

test('评审 R1-1：报价转换的订单未填现汇时用保存的计价汇率，填了现汇时按现汇；调整都只做一次', () => {
  const converted = contract({ quoteId: 'quote-1', exchangeRate: 6.6 });
  const { spotRate: _typed, ...withoutSpot } = options();
  const untouched = evaluateExportPacket(converted, readiness(), [], withoutSpot);
  assert.equal(untouched.pricingPolicy.effectiveRate, 6.6);
  assert.equal(untouched.lines[0].unitPriceUsd, evaluateExportPacket(contract(), readiness(), [], options()).lines[0].unitPriceUsd);
  const typed = evaluateExportPacket(converted, readiness(), [], { ...withoutSpot, spotRate: 6.8 });
  assert.equal(typed.pricingPolicy.effectiveRate, 6.6);
});

test('第三方货物行不要求采购成本，沿用原申报单价且不按公式重定价', () => {
  const base = contract().packingItems[0];
  const packet = evaluateExportPacket(contract({
    packingItems: [{ ...base, isOwnedByJiesong: false, purchaseCost: 0, unitPrice: 25 }],
  }), readiness(), [], options());
  assert.equal(packet.issues.some((issue) => issue.code === 'MISSING_PURCHASE_COST'), false);
  assert.equal(packet.lines[0].pricingSource, 'declared');
  assert.equal(packet.lines[0].unitPriceUsd, 25);
  assert.equal(packet.lines[0].totalUsd, 250);
});

test('第三方货物行无任何单价时阻断（不写入 0 美元）', () => {
  const base = contract().packingItems[0];
  const packet = evaluateExportPacket(contract({
    packingItems: [{ ...base, isOwnedByJiesong: false, purchaseCost: 0, unitPrice: 0 }],
  }), readiness(), [], options());
  assert.equal(packet.ready, false);
  assert.ok(packet.issues.some((issue) => issue.code === 'MISSING_THIRD_PARTY_PRICE'));
});

test('writePacketAmounts 写回装箱价格与合同金额；锁定时调用方跳过（发运后生成不改价）', async () => {
  const writes = [];
  const tx = {
    packingItem: { update: async (a) => writes.push(['item', a.where.id, a.data]) },
    salesContract: { update: async (a) => writes.push(['contract', a.data]) },
  };
  const packet = { lines: [{ packingItemId: 'p1', unitPriceUsd: 13, totalUsd: 130 }], summary: { totalUsd: 130 }, pricingPolicy: { spotRate: 6.8, effectiveRate: 6.6 } };
  await writePacketAmounts(tx, 's1', { amountSource: 'DERIVED' }, packet);
  assert.deepEqual(writes, [['item', 'p1', { unitPrice: 13, totalPrice: 130 }], ['contract', { totalAmount: 130, exchangeRate: 6.8 }]]);
});
