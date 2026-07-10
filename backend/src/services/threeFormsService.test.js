/**
 * Input: threeFormsService、Prisma mock delegates
 * Output: 三表准备、生成与导出服务单元测试
 * Pos: 后端服务层测试，覆盖 HS 覆盖来源、退税口径及三表导出错误路径 Interface
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const {
  _internal,
  exportThreeFormsExcel,
  generateTaxRefund,
} = require('./threeFormsService');

test('extractHsOverrides: 只接受本次人工确认或 AI 建议，不把档案/历史值伪装成人工覆盖', () => {
  const result = _internal.extractHsOverrides([
    { packingItemId: 'pk-manual', hsCode: '6907219000', hsSource: 'manual' },
    { packingItemId: 'pk-ai', hsCode: '3924100000', hsSource: 'ai' },
    { packingItemId: 'pk-history', hsCode: '6911101900', hsSource: 'history' },
    { packingItemId: 'pk-archive', hsCode: '0808100000', hsSource: 'stored' },
  ]);

  assert.deepEqual(result, [
    { packingItemId: 'pk-manual', hsCode: '6907219000' },
    { packingItemId: 'pk-ai', hsCode: '3924100000' },
  ]);
});

test('generateTaxRefund: 按采购专票估算基数和当前退税率落库，不再用出口货值或固定13%', async () => {
  const originalTransaction = prisma.$transaction;
  let createdData = null;
  const tx = {
    salesContract: {
      findUnique: async () => ({ id: 'sales-1', contractNo: 'XS260001', totalAmount: 99999 }),
    },
    taxRefund: {
      count: async () => 0,
      create: async ({ data }) => {
        createdData = data;
        return { id: 'refund-1', ...data };
      },
    },
  };
  prisma.$transaction = async (callback) => callback(tx);

  try {
    const result = await generateTaxRefund({
      salesContractId: 'sales-1',
      customsDeclarationId: 'customs-1',
      forexVerificationId: 'forex-1',
      itemsPrepared: true,
      items: [
        { refundBaseCny: 1000, estimatedRefundCny: 90, purchaseVatRate: 13 },
        { refundBaseCny: 500, estimatedRefundCny: 0, purchaseVatRate: 13 },
      ],
    });

    assert.equal(result.id, 'refund-1');
    assert.equal(createdData.declaredAmount, 1500);
    assert.equal(createdData.refundableAmount, 90);
    assert.equal(createdData.vat_rate_type, 13);
    assert.doesNotMatch(createdData.note, /出口货值/);
    assert.match(createdData.note, /预计值/);
    assert.match(createdData.note, /最终以供应商发票/);
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

test('exportThreeFormsExcel: 合同不存在时返回受控 404 且不查询旧 currency 字段', async () => {
  const originalSalesContract = prisma.salesContract;
  let findUniqueArgs = null;

  prisma.salesContract = {
    findUnique: async (args) => {
      findUniqueArgs = args;
      return null;
    },
  };

  try {
    await assert.rejects(
      () => exportThreeFormsExcel('missing-sales'),
      (error) => error.statusCode === 404 && error.message === '合同不存在',
    );
    assert.deepEqual(findUniqueArgs.select, {
      contractNo: true,
      totalAmount: true,
    });
  } finally {
    prisma.salesContract = originalSalesContract;
  }
});
