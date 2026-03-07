/**
 * Input: taxCalculationEngine
 * Output: HS 编码匹配、退税测算、Excel/PDF 导出回归测试
 * Pos: 服务层测试，锁定税务测算引擎对外行为
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

const sampleContract = {
  id: 'sales-contract-1',
  contractNo: 'EXP-0008',
  exchangeRate: 7.2,
  port: { name: 'Los Angeles' },
  note: 'tax-demo',
  items: [
    {
      quantity: 10,
      unit: '箱',
      sellingPrice: 15,
      specification: '80#',
      note: 'fruit',
      product: {
        customsName: '苹果',
        hsCode: '0808.10.00.00',
        declaration: '鲜苹果|未制果汁',
        unit: '箱',
      },
      store: { name: 'Store A' },
    },
    {
      quantity: 5,
      unit: '箱',
      sellingPrice: 8,
      specification: '厨房用品',
      note: '',
      product: {
        customsName: '塑料保鲜盒',
        hsCode: '3924 10 0000',
        declaration: '塑料制餐厨用品',
        unit: '箱',
      },
      store: { name: 'Store B' },
    },
  ],
  packingItems: [],
};

test('lookupHsCode: 标准化编码并按最长前缀匹配税则', () => {
  const matched = lookupHsCode(' 0808.10.00.00 ');
  assert.equal(matched.normalizedCode, '0808100000');
  assert.equal(matched.matchType, 'exact');
  assert.equal(matched.refundRate, 9);
  assert.equal(matched.vatRate, 13);
  assert.match(matched.description, /苹果/);

  const fallback = lookupHsCode('9999999999');
  assert.equal(fallback.normalizedCode, '9999999999');
  assert.equal(fallback.matchType, 'fallback');
  assert.equal(fallback.refundRate, 0);
  assert.equal(fallback.vatRate, 13);
});

test('calculateTaxSummary: 按明细计算人民币金额、退税基数、退税额与不可退税额', () => {
  const result = calculateTaxSummary(sampleContract);

  assert.equal(result.contract.contractNo, 'EXP-0008');
  assert.equal(result.summary.currency, 'CNY');
  assert.equal(result.summary.totalSalesUsd, 190);
  assert.equal(result.summary.totalSalesCny, 1368);
  assert.equal(result.summary.totalRefundBaseCny, 1210.62);
  assert.equal(result.summary.totalRefundAmountCny, 119.15);
  assert.equal(result.summary.totalNonRefundableTaxCny, 38.23);
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
    refundBaseCny: 955.75,
    estimatedRefundCny: 86.02,
    nonRefundableTaxCny: 38.23,
    taxCategory: '农产品',
    matchType: 'exact',
    note: 'fruit',
  });
});

test('exportTaxCalculationExcel: 生成税务测算工作簿', async () => {
  const result = await exportTaxCalculationExcel(sampleContract);

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
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['税务汇总', '税务明细', 'HS编码规则']);

  const summarySheet = workbook.getWorksheet('税务汇总');
  assert.equal(summarySheet.getCell('B2').value, 'EXP-0008');
  assert.equal(summarySheet.getCell('B6').value, 119.15);

  const detailSheet = workbook.getWorksheet('税务明细');
  assert.equal(detailSheet.getCell('B2').value, '苹果');
  assert.equal(detailSheet.getCell('C2').value, '0808100000');
  assert.equal(detailSheet.getCell('L2').value, 86.02);
});

test('exportTaxCalculationPdf: 生成税务测算 PDF', async () => {
  const result = await exportTaxCalculationPdf(sampleContract);

  assert.equal(result.filename, `EXP-0008_税务测算_${new Date().toISOString().slice(0, 10)}.pdf`);
  assert.equal(result.contentType, 'application/pdf');
  assert.ok(Buffer.isBuffer(result.buffer));
  assert.ok(result.buffer.length > 0);
  assert.equal(result.buffer.slice(0, 4).toString(), '%PDF');
});
