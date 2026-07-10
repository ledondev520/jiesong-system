/**
 * Input: taxCalculationEngine
 * Output: 当前税则证据、采购专票口径退税测算及 Excel/PDF 导出回归测试
 * Pos: 服务层测试，锁定税务测算引擎只消费出口准备度 Module 的权威结果
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const {
  lookupHsCode,
  calculateTaxSummary,
  exportTaxCalculationExcel,
  exportTaxCalculationPdf,
} = require('./taxCalculationEngine');

const sampleReadiness = {
  contractId: 'sales-contract-1',
  contractNo: 'EXP-0008',
  exchangeRate: 7.2,
  portName: 'Los Angeles',
  note: 'tax-demo',
  customsReady: true,
  taxRefundReady: true,
  issues: [],
  lines: [
    {
      index: 1,
      packingItemId: 'pk-1',
      productId: 'p-1',
      productName: '苹果',
      storeName: 'Store A',
      quantity: 10,
      unit: '箱',
      hsCode: '0808100000',
      hsSource: 'customs_history',
      hsEvidence: {
        productName: '鲜苹果',
        refundRate: 9,
        vatRate: 13,
        effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
        fetchedAt: new Date('2026-03-01T00:00:00.000Z'),
        sourceUrl: 'https://example.test/0808100000',
      },
      declarationElements: '鲜苹果|未制果汁',
      unitPriceUsd: 15,
      totalPriceUsd: 150,
      purchaseCostCny: 1130,
      purchaseVatRate: 13,
      refundBaseCny: 1000,
      estimatedRefundCny: 90,
      nonRefundableInputTaxCny: 40,
      note: 'fruit',
    },
    {
      index: 2,
      packingItemId: 'pk-2',
      productId: 'p-2',
      productName: '塑料保鲜盒',
      storeName: 'Store B',
      quantity: 5,
      unit: '箱',
      hsCode: '3924100000',
      hsSource: 'manual_confirmation',
      hsEvidence: {
        productName: '塑料制餐厨用品',
        refundRate: 13,
        vatRate: 13,
        effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
        fetchedAt: new Date('2026-03-01T00:00:00.000Z'),
        sourceUrl: 'https://example.test/3924100000',
      },
      declarationElements: '塑料制餐厨用品',
      unitPriceUsd: 8,
      totalPriceUsd: 40,
      purchaseCostCny: 226,
      purchaseVatRate: 13,
      refundBaseCny: 200,
      estimatedRefundCny: 26,
      nonRefundableInputTaxCny: 0,
      note: '',
    },
  ],
  summary: {
    lineCount: 2,
    totalExportAmountUsd: 190,
    totalPurchaseCostCny: 1356,
    totalRefundBaseCny: 1200,
    totalEstimatedRefundCny: 116,
    totalNonRefundableInputTaxCny: 40,
    noRefundLineCount: 0,
    errorCount: 0,
    warningCount: 0,
  },
};

test('lookupHsCode: 只匹配传入的当前税则证据，不再回退到内置小表', () => {
  const matched = lookupHsCode(' 0808.10.00.00 ', [{
    hsCode: '0808100000',
    productName: '鲜苹果',
    refundRate: 9,
    vatRate: 13,
  }]);
  assert.equal(matched.normalizedCode, '0808100000');
  assert.equal(matched.matchType, 'exact');
  assert.equal(matched.refundRate, 9);
  assert.equal(matched.vatRate, 13);
  assert.match(matched.description, /苹果/);

  const fallback = lookupHsCode('9999999999');
  assert.equal(fallback.normalizedCode, '9999999999');
  assert.equal(fallback.matchType, 'missing_evidence');
  assert.equal(fallback.refundRate, null);
  assert.equal(fallback.vatRate, null);
});

test('calculateTaxSummary: 销售货值只作参考，退税基数和退税额直接采用采购专票口径结果', () => {
  const result = calculateTaxSummary(sampleReadiness);

  assert.equal(result.contract.contractNo, 'EXP-0008');
  assert.equal(result.summary.currency, 'CNY');
  assert.equal(result.summary.totalSalesUsd, 190);
  assert.equal(result.summary.totalSalesCny, 1368);
  assert.equal(result.summary.totalRefundBaseCny, 1200);
  assert.equal(result.summary.totalRefundAmountCny, 116);
  assert.equal(result.summary.totalNonRefundableTaxCny, 40);
  assert.equal(result.summary.lineCount, 2);
  assert.equal(result.summary.matchedLineCount, 2);

  assert.deepEqual(result.lines[0], {
    index: 1,
    productName: '苹果',
    hsCode: '0808100000',
    hsDescription: '鲜苹果',
    declaration: '鲜苹果|未制果汁',
    storeName: 'Store A',
    quantity: 10,
    unit: '箱',
    unitPriceUsd: 15,
    lineAmountUsd: 150,
    exchangeRate: 7.2,
    lineAmountCny: 1080,
    vatRate: 13,
    refundRate: 9,
    refundBaseCny: 1000,
    estimatedRefundCny: 90,
    nonRefundableTaxCny: 40,
    hsSource: 'customs_history',
    evidenceEffectiveDate: new Date('2026-01-01T00:00:00.000Z'),
    evidenceFetchedAt: new Date('2026-03-01T00:00:00.000Z'),
    evidenceSourceUrl: 'https://example.test/0808100000',
    matchType: 'current_snapshot',
    note: 'fruit',
  });
});

test('exportTaxCalculationExcel: 生成税务测算工作簿', async () => {
  const result = await exportTaxCalculationExcel(sampleReadiness);

  assert.equal(
    result.filename,
    `EXP-0008_税务测算_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
  assert.equal(
    result.contentType,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  assert.ok(Buffer.isBuffer(result.buffer));
  assert.ok(result.buffer.length > 0);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(result.buffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['税务汇总', '税务明细', '当前税则证据']);

  const summarySheet = workbook.getWorksheet('税务汇总');
  assert.equal(summarySheet.getCell('B2').value, 'EXP-0008');
  assert.equal(summarySheet.getCell('B6').value, 116);

  const detailSheet = workbook.getWorksheet('税务明细');
  assert.equal(detailSheet.getCell('B2').value, '苹果');
  assert.equal(detailSheet.getCell('C2').value, '0808100000');
  assert.equal(detailSheet.getCell('L2').value, 90);
});

test('exportTaxCalculationPdf: 生成税务测算 PDF', async () => {
  const result = await exportTaxCalculationPdf(sampleReadiness);

  assert.equal(result.filename, `EXP-0008_税务测算_${new Date().toISOString().slice(0, 10)}.pdf`);
  assert.equal(result.contentType, 'application/pdf');
  assert.ok(Buffer.isBuffer(result.buffer));
  assert.ok(result.buffer.length > 0);
  assert.equal(result.buffer.slice(0, 4).toString(), '%PDF');
});
