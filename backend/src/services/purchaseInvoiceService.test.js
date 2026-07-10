/**
 * Input: purchaseInvoiceService 与采购合同/附件伪造数据
 * Output: 发票号码规范化、催票明细和登记状态回归测试
 * Pos: 供应商发票准备 Module 测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPurchaseInvoicePreparation,
  normalizeInvoiceNumbers,
  registerPurchaseInvoiceNumbers,
} = require('./purchaseInvoiceService');

const buildContract = (overrides = {}) => ({
  id: 'purchase-1',
  contractNo: 'PO260001',
  invoiceNo: ' 25442000000012345678，25442000000012345678 ; INV-002 ',
  taxRate: 13,
  totalAmount: 226,
  paidAmount: 226,
  supplier: { id: 'supplier-1', name: '供应商A', taxId: '91310000TEST000001' },
  items: [
    {
      id: 'item-1',
      productId: 'product-1',
      quantity: 2,
      unit: '件',
      unitPrice: 100,
      totalPrice: 226,
      specification: '红色',
      product: { customsName: '餐盘', unit: '件' },
    },
  ],
  files: [
    { id: 'file-1', category: 'SUPPLIER_INVOICE', fileName: '发票.pdf', uploadedAt: new Date('2026-07-06') },
    { id: 'file-2', category: 'SIGNED_CONTRACT', fileName: '合同.pdf', uploadedAt: new Date('2026-07-01') },
  ],
  ...overrides,
});

test('normalizeInvoiceNumbers: 支持中英文分隔符、换行并按首次出现顺序去重', () => {
  assert.deepEqual(
    normalizeInvoiceNumbers(' 25442000000012345678，25442000000012345678 ;\nINV-002 '),
    ['25442000000012345678', 'INV-002'],
  );
});

test('buildPurchaseInvoicePreparation: 从采购明细形成催票清单并识别号码/可选附件', () => {
  const result = buildPurchaseInvoicePreparation(buildContract());

  assert.equal(result.complete, true);
  assert.deepEqual(result.invoiceNumbers, ['25442000000012345678', 'INV-002']);
  assert.equal(result.invoiceFiles.length, 1);
  assert.equal(result.request.contractNo, 'CG260001');
  assert.equal(result.request.supplierTaxId, '91310000TEST000001');
  assert.equal(result.request.lines[0].productName, '餐盘');
  assert.equal(result.request.lines[0].grossAmount, 226);
  assert.deepEqual(result.amounts, {
    taxRate: 13,
    netAmount: 200,
    taxAmount: 26,
    grossAmount: 226,
  });
});

test('registerPurchaseInvoiceNumbers: 以规范化号码更新合同并返回最新准备状态', async () => {
  let updateArgs;
  const prismaClient = {
    purchaseContract: {
      findUnique: async () => ({ id: 'purchase-1' }),
      update: async (args) => {
        updateArgs = args;
        return buildContract({ invoiceNo: args.data.invoiceNo, files: [] });
      },
    },
  };

  const result = await registerPurchaseInvoiceNumbers('purchase-1', {
    invoiceNumbers: ['INV-002', 'INV-001', 'INV-002'],
  }, prismaClient);

  assert.equal(updateArgs.data.invoiceNo, 'INV-002，INV-001');
  assert.deepEqual(result.invoiceNumbers, ['INV-002', 'INV-001']);
  assert.equal(result.complete, true);
});

test('registerPurchaseInvoiceNumbers: 空号码不得把供应商发票阶段伪装完成', async () => {
  await assert.rejects(
    () => registerPurchaseInvoiceNumbers('purchase-1', { invoiceNumbers: '  ， ; ' }, {
      purchaseContract: { findUnique: async () => ({ id: 'purchase-1' }) },
    }),
    (error) => error.statusCode === 400 && /至少登记一个发票号码/.test(error.message),
  );
});
