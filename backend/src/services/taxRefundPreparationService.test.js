/**
 * Input: taxRefundPreparationService、出口专项单与关联采购事实
 * Output: 2026 现行规则、材料清单、期限与 Excel 导出回归测试
 * Pos: 外贸企业出口退税准备 Module 测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
  OFFICIAL_RULES,
  buildTaxRefundPreparation,
  buildTaxRefundPreparationWorkbook,
} = require('./taxRefundPreparationService');

const purchase = {
  id: 'purchase-1',
  contractNo: 'PO260001',
  invoiceNo: 'INV-001，INV-002',
  taxRate: 13,
  totalAmount: 226,
  paidAmount: 226,
  supplier: { id: 'supplier-1', name: '供应商A', taxId: '91310000TEST000001' },
  items: [{
    id: 'purchase-item-1',
    productId: 'product-1',
    quantity: 2,
    unit: '件',
    unitPrice: 100,
    totalPrice: 226,
    product: { id: 'product-1', customsName: '餐盘', unit: '件' },
  }],
  files: [
    { id: 'signed-1', category: 'SIGNED_CONTRACT', fileName: '购销合同.pdf' },
    { id: 'invoice-1', category: 'SUPPLIER_INVOICE', fileName: '发票.pdf' },
  ],
};

const salesContract = {
  id: 'sales-1',
  contractNo: 'EXP260001',
  totalAmount: 100,
  receivedAmount: 100,
  shippedAt: new Date('2026-06-20T00:00:00.000Z'),
  customsBroker: null,
  packingItems: [{
    id: 'packing-1',
    productId: 'product-1',
    purchaseItemId: 'purchase-item-1',
    purchaseContractNo: 'PO260001',
    unit: '件',
    quantity: 2,
    product: { id: 'product-1', customsName: '餐盘', unit: '件' },
  }],
  customsDeclarations: [{
    id: 'customs-1',
    declarationNo: 'BG260001',
    status: 'RELEASED',
    exportDate: new Date('2026-06-20T00:00:00.000Z'),
    items: [{
      id: 'customs-item-1',
      packingItemId: 'packing-1',
      productId: 'product-1',
      customsName: '餐盘',
      unit: '件',
    }],
  }],
  forexVerifications: [{ id: 'forex-1', status: 'VERIFIED', receivedAmount: 100 }],
  taxRefunds: [
    {
      id: 'refund-1',
      status: 'DRAFT',
      relation_no: 'PO260001',
      invoice_no: 'INV-001',
      match_status: 'passed',
    },
    {
      id: 'refund-2',
      status: 'DRAFT',
      relation_no: 'CG260001',
      invoice_no: 'INV-002',
      match_status: 'passed',
    },
  ],
  packingListChecks: [{
    id: 'check-1',
    status: 'APPROVED',
    checkedAt: '2026-06-20T00:00:00Z',
    file: { id: 'carrier-packing', category: 'CARRIER_DOCUMENT', fileName: '船司装箱单.pdf' },
  }],
  files: [{ id: 'carrier-1', category: 'CARRIER_DOCUMENT', fileName: '提单.pdf' }],
};

test('OFFICIAL_RULES: 使用 2026 年有效公告且不再声称固定每月1-15日', () => {
  assert.equal(OFFICIAL_RULES.effectiveFrom, '2026-01-01');
  assert.match(OFFICIAL_RULES.policyDocument, /2026年第11号/);
  assert.match(OFFICIAL_RULES.managementDocument, /2026年第5号/);
  assert.doesNotMatch(JSON.stringify(OFFICIAL_RULES), /1-15|1—15|1至15/);
});

test('buildTaxRefundPreparation: 汇总申报凭证、备案单证和收汇节点并计算当前期限', () => {
  const result = buildTaxRefundPreparation({
    salesContract,
    purchases: [purchase],
    exportReadiness: { taxRefundReady: true, issues: [] },
  });

  assert.equal(result.preparationReady, true);
  assert.equal(result.invoiceLinks[0].invoiceNumbers.length, 2);
  assert.equal(result.invoiceLinks[0].supplierTaxId, '91310000TEST000001');
  assert.equal(result.deadlines.internalPrepareOn, '2026-07-05');
  assert.equal(result.deadlines.primaryFilingEnd, '2027-04-30');
  assert.equal(result.deadlines.collectionDeadline, '2027-04-30');
  assert.equal(result.deadlines.supplementaryWindowEnd, '2029-06-20');
  assert.equal(result.checklist.find((item) => item.id === 'supplier-invoices').status, 'ready');
  assert.equal(result.checklist.find((item) => item.id === 'supplier-tax-identifiers').status, 'ready');
  assert.equal(result.checklist.find((item) => item.id === 'purchase-detail-form').status, 'ready');
  assert.equal(result.checklist.find((item) => item.id === 'name-unit-match').status, 'ready');
  assert.equal(result.checklist.find((item) => item.id === 'transport-documents').status, 'ready');
});

test('buildTaxRefundPreparation: 缺报关单或发票号码时明确阻塞，发票文件仍为选填', () => {
  const result = buildTaxRefundPreparation({
    salesContract: {
      ...salesContract,
      customsDeclarations: [],
      taxRefunds: [],
      packingListChecks: [],
      files: [],
    },
    purchases: [{ ...purchase, invoiceNo: null, files: [purchase.files[0]] }],
    exportReadiness: { taxRefundReady: false, issues: [{ message: '缺少当前退税率' }] },
  });

  assert.equal(result.preparationReady, false);
  assert.ok(result.blockers.some((message) => /报关单/.test(message)));
  assert.ok(result.blockers.some((message) => /发票号码/.test(message)));
  assert.equal(result.checklist.find((item) => item.id === 'supplier-invoices').status, 'missing');
  assert.equal(result.invoiceLinks[0].invoiceFileRequired, false);
});

test('buildTaxRefundPreparation: 发票号虽已登记但退税关联未校验通过时不得宣称材料已齐', () => {
  const result = buildTaxRefundPreparation({
    salesContract: {
      ...salesContract,
      taxRefunds: [{
        id: 'refund-pending',
        status: 'DRAFT',
        relation_no: 'PO260001',
        invoice_no: 'INV-001',
        match_status: 'pending',
      }],
    },
    purchases: [{
      ...purchase,
      supplier: { ...purchase.supplier, taxId: null },
    }],
    exportReadiness: { taxRefundReady: true, issues: [] },
  });

  assert.equal(result.preparationReady, false);
  assert.equal(result.checklist.find((item) => item.id === 'supplier-tax-identifiers').status, 'missing');
  assert.equal(result.checklist.find((item) => item.id === 'purchase-detail-form').status, 'missing');
  assert.ok(result.blockers.some((message) => /纳税人识别号/.test(message)));
  assert.ok(result.blockers.some((message) => /关联校验/.test(message)));
});

test('buildTaxRefundPreparation: 同一发票号属于多个采购合同时阻止材料齐套', () => {
  const secondPurchase = {
    ...purchase,
    id: 'purchase-2',
    contractNo: 'PO260002',
    supplier: { id: 'supplier-2', name: '供应商B', taxId: '91310000TEST000002' },
    items: purchase.items.map((item) => ({ ...item, id: 'purchase-item-2' })),
    invoiceNo: 'INV-001',
  };
  const result = buildTaxRefundPreparation({
    salesContract: {
      ...salesContract,
      taxRefunds: [
        ...salesContract.taxRefunds,
        {
          id: 'refund-duplicate',
          status: 'DRAFT',
          relation_no: 'PO260002',
          invoice_no: 'INV-001',
          match_status: 'passed',
        },
      ],
    },
    purchases: [purchase, secondPurchase],
    exportReadiness: { taxRefundReady: true, issues: [] },
  });

  assert.equal(result.preparationReady, false);
  assert.ok(result.blockers.some((message) => /多个采购合同/.test(message)));
});

test('buildTaxRefundPreparationWorkbook: 导出清单、关联发票和规则口径三张表', async () => {
  const preparation = buildTaxRefundPreparation({
    salesContract,
    purchases: [purchase],
    exportReadiness: { taxRefundReady: true, issues: [] },
  });
  const buffer = await buildTaxRefundPreparationWorkbook(preparation);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['准备清单', '关联发票', '规则口径']);
  assert.match(String(workbook.getWorksheet('规则口径').getCell('B2').value), /2026年第11号/);
  assert.equal(workbook.getWorksheet('关联发票').getCell('E2').value, 'INV-001、INV-002');
});
