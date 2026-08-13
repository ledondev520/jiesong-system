/**
 * Input: 退税工作台聚合 Module 与仿真出口/采购/发票数据
 * Output: 候选筛选、发票核验和工作台阶段判断回归测试
 * Pos: 出口退税网页工作台 Module 测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildShipmentInvoiceRows,
  getTaxRefundWorkbench,
} = require('./taxRefundWorkbenchService');

const contract = {
  id: 'sc-1',
  contractNo: 'EXP260004',
  status: 'SHIPPED',
  shippedAt: new Date('2026-05-01T00:00:00.000Z'),
  customsBroker: '捷淞',
  packingItems: [{
    id: 'pi-1',
    isOwnedByJiesong: true,
    purchaseContractNo: 'CG260001',
    invoiceNo: '26110000000000000001',
    manufacturer: '测试供应商有限公司',
    purchaseCost: 113,
    supplement: '密胺',
    product: { customsName: '餐盘' },
  }],
  customsDeclarations: [{
    id: 'cd-1',
    declarationNo: '530420260000000001',
    status: 'RELEASED',
    exportDate: new Date('2026-05-01T00:00:00.000Z'),
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
  }],
  taxRefunds: [{
    id: 'tr-1',
    refundNo: 'TR-001',
    status: 'DRAFT',
    match_status: 'passed',
    refundableAmount: 13,
    createdAt: new Date('2026-05-02T00:00:00.000Z'),
  }],
};

const purchase = {
  id: 'pc-1',
  contractNo: 'CG260001',
  invoiceNo: '26110000000000000001',
  totalAmount: 113,
  taxRate: 13,
  supplier: { id: 'supplier-1', name: '测试供应商有限公司', taxId: 'TEST-TAX-ID' },
};

const invoice = {
  id: 'inv-1',
  invNo: '26110000000000000001',
  seller: '测试供应商有限公司',
  sellerTaxId: 'TEST-TAX-ID',
  invDate: '2026-04-30',
  itemName: '*塑料制品*餐盘',
  amount: 100,
  tax: 13,
  total: 113,
  status: '正常',
  isPositive: '是',
};

const createPrisma = (overrides = {}) => ({
  salesContract: {
    findMany: async () => [contract],
  },
  financeDataBatch: {
    findFirst: async () => ({
      fileName: '2026年4月进项发票.xlsx',
      dataStartDate: '2026-04-01',
      dataEndDate: '2026-04-30',
      importedAt: new Date('2026-05-02T00:00:00.000Z'),
      recordCount: 1,
    }),
  },
  purchaseContract: {
    findMany: async () => [purchase],
  },
  invoiceRecord: {
    findMany: async () => [invoice],
  },
  ...overrides,
});

test('buildShipmentInvoiceRows: 优先使用装箱行发票号并保留业务来源字段', () => {
  const map = new Map([['CG260001', purchase]]);
  const rows = buildShipmentInvoiceRows(contract, map);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].invoiceNo, '26110000000000000001');
  assert.equal(rows[0].expectedSeller, '测试供应商有限公司');
  assert.equal(rows[0].expectedTotal, 113);
});

test('getTaxRefundWorkbench: 资料和发票全通过时进入可生成申报明细阶段', async () => {
  const result = await getTaxRefundWorkbench({}, createPrisma());
  assert.equal(result.total, 1);
  assert.equal(result.items[0].stage, 'READY_TO_EXPORT');
  assert.equal(result.items[0].ready, true);
  assert.equal(result.items[0].invoiceSummary.pass, 1);
  assert.equal(result.summary.readyToExport, 1);
  assert.equal(result.summary.missingInvoices, 0);
  assert.equal(result.summary.latestInvoiceBatch.fileName, '2026年4月进项发票.xlsx');
  assert.equal(result.items[0].estimatedRefundableAmount, 13);
});

test('getTaxRefundWorkbench: 发票未导入时保留候选并明确缺票', async () => {
  const result = await getTaxRefundWorkbench({}, createPrisma({
    invoiceRecord: { findMany: async () => [] },
  }));
  assert.equal(result.items[0].ready, false);
  assert.equal(result.items[0].invoiceSummary.missing, 1);
  assert.match(result.items[0].issues.join('；'), /发票未命中台账/);
});
