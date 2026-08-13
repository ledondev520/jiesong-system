/**
 * Input: 出口合同装箱明细、历史报关 HS、当前税则快照和采购价税资料
 * Output: 逐行出口单证准备度、价格公式、HS 证据与预计退税测试
 * Pos: 出口单证准备 Module 契约测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateExportReadiness,
} = require('./exportReadinessService');

const makeContract = (overrides = {}) => ({
  id: 'sc-1',
  contractNo: 'EXP260001',
  exchangeRate: 7.2,
  totalAmount: 200,
  packingItems: [{
    id: 'pk-1',
    productId: 'p-1',
    quantity: 10,
    unit: '件',
    unitPrice: 20,
    totalPrice: 180,
    purchaseCost: 1130,
    product: {
      id: 'p-1',
      customsName: '抛光砖',
      hsCode: '6907229000',
      declaration: '品牌类型:0|用途:建筑铺面',
      unit: '件',
    },
    purchaseItem: {
      purchaseContract: { taxRate: 13 },
    },
  }],
  ...overrides,
});

const currentHs = (overrides = {}) => ({
  hsCode: '6907219000',
  productName: '吸水率不超过0.5%的陶瓷砖',
  refundRate: 13,
  vatRate: 13,
  effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
  fetchedAt: new Date('2026-03-08T00:00:00.000Z'),
  sourceUrl: 'https://example.test/hs/6907219000',
  declarationElements: '品牌类型|出口享惠情况|用途',
  ...overrides,
});

test('历史报关 HS 优先于商品档案，并使用当前税则证据与采购不含税金额估算退税', () => {
  const result = evaluateExportReadiness(makeContract(), {
    historicalItems: [{ productId: 'p-1', hsCode: '6907219000' }],
    hsRecords: [currentHs()],
  });

  assert.equal(result.customsReady, true);
  assert.equal(result.taxRefundReady, true);
  assert.equal(result.lines[0].hsCode, '6907219000');
  assert.equal(result.lines[0].hsSource, 'customs_history');
  assert.equal(result.lines[0].hsEvidence.refundRate, 13);
  assert.equal(result.lines[0].hsEvidence.sourceUrl, 'https://example.test/hs/6907219000');
  assert.equal(result.lines[0].unitPriceUsd, 20);
  assert.equal(result.lines[0].totalPriceUsd, 200);
  assert.equal(result.lines[0].refundBaseCny, 1000);
  assert.equal(result.lines[0].estimatedRefundCny, 130);
  assert.equal(result.lines[0].nonRefundableInputTaxCny, 0);
  assert.ok(result.lines[0].issues.some((issue) => issue.code === 'STORED_TOTAL_RECALCULATED'));
});

test('缺 HS 或出口售价时禁止生成完整单证，但给出基于采购成本和30%加价的建议售价', () => {
  const contract = makeContract({
    totalAmount: 0,
    packingItems: [{
      ...makeContract().packingItems[0],
      unitPrice: null,
      totalPrice: null,
      product: {
        ...makeContract().packingItems[0].product,
        hsCode: null,
        declaration: null,
      },
    }],
  });
  const result = evaluateExportReadiness(contract, {
    historicalItems: [],
    hsRecords: [],
  });

  assert.equal(result.customsReady, false);
  assert.equal(result.taxRefundReady, false);
  assert.equal(result.lines[0].recommendedUnitPriceUsd, 20.4);
  assert.equal(result.lines[0].pricingFormula, 'purchaseCostCny × 1.3 ÷ exchangeRate ÷ quantity');
  assert.deepEqual(
    result.lines[0].issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code),
    ['MISSING_HS_CODE', 'MISSING_EXPORT_PRICE', 'MISSING_DECLARATION_ELEMENTS', 'MISSING_REFUND_RATE'],
  );
});

test('当前退税率明确为0时允许形成单证但给出无出口退税高风险警示', () => {
  const result = evaluateExportReadiness(makeContract(), {
    historicalItems: [{ productId: 'p-1', hsCode: '6907219000' }],
    hsRecords: [currentHs({ refundRate: 0 })],
  });

  assert.equal(result.customsReady, true);
  assert.equal(result.taxRefundReady, true);
  assert.equal(result.lines[0].estimatedRefundCny, 0);
  assert.ok(result.lines[0].issues.some((issue) => (
    issue.code === 'NO_EXPORT_REFUND' && issue.severity === 'warning'
  )));
  assert.equal(result.summary.noRefundLineCount, 1);
});

test('人工确认编码覆盖历史编码，但必须能在当前税则快照中找到证据', () => {
  const result = evaluateExportReadiness(makeContract(), {
    overrides: [{ packingItemId: 'pk-1', hsCode: '3924100000' }],
    historicalItems: [{ productId: 'p-1', hsCode: '6907219000' }],
    hsRecords: [],
  });

  assert.equal(result.lines[0].hsCode, '3924100000');
  assert.equal(result.lines[0].hsSource, 'manual_confirmation');
  assert.ok(result.lines[0].issues.some((issue) => issue.code === 'HS_CURRENT_EVIDENCE_MISSING'));
  assert.equal(result.customsReady, false);
  assert.equal(result.taxRefundReady, false);
});

test('本票装箱确认的 HS 和申报要素优先于历史与共享商品档案', () => {
  const base = makeContract();
  const result = evaluateExportReadiness(makeContract({
    packingItems: [{
      ...base.packingItems[0],
      hsCode: '7610100000',
      declarationElements: '0|0|铝合金|型材|挤压喷涂|||无品牌',
      origin: '广东省佛山市',
    }],
  }), {
    historicalItems: [{ productId: 'p-1', hsCode: '6907219000' }],
    hsRecords: [currentHs({ hsCode: '7610100000', refundRate: 13 })],
  });

  assert.equal(result.lines[0].hsCode, '7610100000');
  assert.equal(result.lines[0].hsSource, 'packing_confirmation');
  assert.equal(result.lines[0].declarationElements, '0|0|铝合金|型材|挤压喷涂|||无品牌');
  assert.equal(result.lines[0].origin, '广东省佛山市');
});
