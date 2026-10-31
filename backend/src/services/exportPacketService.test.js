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

test('完整资料形成可生成快照，展示调整汇率、实际加价和价格来源（单价向上取整）', () => {
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

test('分类加价沿祖先链取最近一项：瓷砖 10%，单价向上取整到整美元', () => {
  const tile = contract({
    packingItems: [{ ...contract().packingItems[0], product: { ...contract().packingItems[0].product, categoryIds: ['tile-sub', 'tile'] } }],
  });
  const config = { ...require('../../../config/pricing.json'), categoryMarkups: [{ categoryId: 'tile', categoryName: '瓷砖', markup: 0.1 }] };
  const packet = evaluateExportPacket(tile, readiness(), [], options(), config);
  assert.equal(packet.lines[0].targetMarkup, 0.1);
  assert.equal(packet.lines[0].unitPriceUsd, 110);
  assert.equal(packet.lines[0].roundingMethod, 'round_up_unit');
});
