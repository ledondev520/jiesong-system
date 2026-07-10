/**
 * Input: PDF 导出服务
 * Output: PDF 文档二进制产物与文件名
 * Pos: 服务层，覆盖新增接口（合同导出 + 系统导出）
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const { exportSalesContractPdf, exportSystemDataPdf } = require('./pdfExportService');

test('exportSalesContractPdf: 合同不存在时抛出404业务错误', async () => {
  const originalFindUnique = prisma.salesContract.findUnique;

  prisma.salesContract.findUnique = async () => null;
  try {
    await assert.rejects(
      () => exportSalesContractPdf('not-found-id'),
      (error) => error.statusCode === 404 && /合同不存在/.test(error.message),
    );
  } finally {
    prisma.salesContract.findUnique = originalFindUnique;
  }
});

test('exportSalesContractPdf: 生成合同 PDF', async () => {
  const originalFindUnique = prisma.salesContract.findUnique;
  const originalCustomsFindMany = prisma.customsDeclarationItem.findMany;
  const originalHsFindMany = prisma.hsCode.findMany;
  const originalTaxRateFindMany = prisma.taxRate.findMany;
  prisma.salesContract.findUnique = async () => ({
    id: 'contract-id',
    contractNo: 'EXP-0001',
    status: 'CONFIRMED',
    port: { name: 'Los Angeles' },
    signedAt: new Date('2026-01-10T00:00:00.000Z'),
    exchangeRate: 7.2,
    totalAmount: 1000,
    receivedAmount: 200,
    totalBoxes: 5,
    grossWeight: 120.5,
    netWeight: 110,
    volume: 2.8,
    shippedAt: null,
    estimatedArrival: null,
    customsBroker: 'ABC Customs',
    isFumigated: true,
    hasTaxRefund: false,
    note: 'demo',
    items: [
      {
        quantity: 10,
        unit: 'pcs',
        sellingPrice: 120,
        specification: 'spec-1',
        note: 'item note',
        product: {
          customsName: 'Widget',
          specification: 'spec-1',
        },
        store: {
          name: 'Demo Store',
        },
      },
    ],
    packingItems: [
      {
        id: 'packing-1',
        productId: 'product-1',
        quantity: 10,
        unit: 'pcs',
        boxes: 2,
        grossWeight: 12,
        netWeight: 11,
        volume: 1.2,
        unitPrice: 3,
        totalPrice: 30,
        purchaseCost: 113,
        note: '',
        purchaseItem: { purchaseContract: { taxRate: 13 } },
        product: {
          id: 'product-1',
          customsName: 'Widget',
          hsCode: '3924100000',
          declaration: '品牌类型:0|用途:餐厨收纳',
          unit: 'pcs',
        },
        store: {
          name: 'Demo Store',
        },
      },
    ],
  });
  prisma.customsDeclarationItem.findMany = async () => [];
  prisma.hsCode.findMany = async () => ([{
    hsCode: '3924100000',
    productName: '塑料制餐厨用品',
    refundRate: 13,
    vatRate: 13,
    effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
    fetchedAt: new Date('2026-03-01T00:00:00.000Z'),
    sourceUrl: 'https://example.test/3924100000',
  }]);
  prisma.taxRate.findMany = async () => [];

  try {
    const result = await exportSalesContractPdf('contract-id');
    assert.equal(result.contentType, 'application/pdf');
    assert.equal(result.filename, `EXP-0001_sales_contract_${new Date().toISOString().slice(0, 10)}.pdf`);
    assert.ok(Buffer.isBuffer(result.buffer));
    assert.ok(result.buffer.length > 0);
    assert.equal(result.buffer.slice(0, 4).toString(), '%PDF');
  } finally {
    prisma.salesContract.findUnique = originalFindUnique;
    prisma.customsDeclarationItem.findMany = originalCustomsFindMany;
    prisma.hsCode.findMany = originalHsFindMany;
    prisma.taxRate.findMany = originalTaxRateFindMany;
  }
});

test('exportSystemDataPdf: 生成系统导出 PDF', async () => {
  const originalFindMany = prisma.supplier.findMany;
  prisma.supplier.findMany = async () => ([
    {
      id: 's1',
      name: 'Supplier A',
      shortName: 'SA',
      contactName: 'Alice',
      contactPhone: '123',
      contactEmail: 'a@example.com',
      address: 'Addr',
      bankAccount: 'ACC',
      hasQualityIssue: false,
      aliases: [{ alias: 'AliasA' }, { alias: 'AliasB' }],
    },
  ]);

  try {
    const result = await exportSystemDataPdf('suppliers');
    assert.equal(result.contentType, 'application/pdf');
    assert.equal(result.filename, `suppliers_${new Date().toISOString().slice(0, 10)}.pdf`);
    assert.ok(result.buffer.toString('hex').startsWith('25504446'));
    assert.ok(result.buffer.length > 0);
  } finally {
    prisma.supplier.findMany = originalFindMany;
  }
});
