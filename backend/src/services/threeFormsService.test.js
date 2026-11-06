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
      findMany: async () => [],
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

test('单据编号取最大后缀 + 1：删除中间单据后不撞号，且不误计其他合同前缀', async () => {
  const originalTransaction = prisma.$transaction;
  let created = null;
  const tx = {
    salesContract: { findUnique: async () => ({ id: 's1', contractNo: 'XS260001' }) },
    taxRefund: {
      // 已删除 -2，仍剩 base 与 -3；XS2600011 属于另一合同，不得计入
      findMany: async () => [{ refundNo: 'TX260001' }, { refundNo: 'TX260001-3' }, { refundNo: 'TX2600011-9' }],
      create: async ({ data }) => { created = data; return { id: 'r1', ...data }; },
    },
  };
  prisma.$transaction = async (cb) => cb(tx);
  try {
    await generateTaxRefund({ salesContractId: 's1', customsDeclarationId: 'c', forexVerificationId: 'f', itemsPrepared: true, items: [] });
    assert.equal(created.refundNo, 'TX260001-4');
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

test('单据编号遇 P2002 并发撞号整笔重试', async () => {
  const originalTransaction = prisma.$transaction;
  let attempts = 0;
  const tx = {
    salesContract: { findUnique: async () => ({ id: 's1', contractNo: 'XS260001' }) },
    taxRefund: {
      findMany: async () => (attempts > 1 ? [{ refundNo: 'TX260001' }] : []),
      create: async ({ data }) => {
        if (attempts === 1) throw Object.assign(new Error('dup'), { code: 'P2002' });
        return { id: 'r1', ...data };
      },
    },
  };
  prisma.$transaction = async (cb) => { attempts++; return cb(tx); };
  try {
    const r = await generateTaxRefund({ salesContractId: 's1', customsDeclarationId: 'c', forexVerificationId: 'f', itemsPrepared: true, items: [] });
    assert.equal(attempts, 2);
    assert.equal(r.refundNo, 'TX260001-2');
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

test('exportThreeFormsExcel: 指定的单据 ID 必须属于该合同', async () => {
  const names = ['salesContract', 'customsDeclaration', 'forexVerification', 'taxRefund'];
  const originals = Object.fromEntries(names.map((n) => [n, prisma[n]]));
  const wheres = {};
  prisma.salesContract = { findUnique: async () => ({ contractNo: 'XS260001', totalAmount: 1 }) };
  for (const n of names.slice(1)) prisma[n] = { findFirst: async (a) => { wheres[n] = a.where; return null; } };
  try {
    await exportThreeFormsExcel('s1', { customsDeclarationId: 'cd', forexId: 'fv', taxRefundId: 'tr' });
    assert.deepEqual(wheres.customsDeclaration, { id: 'cd', salesContractId: 's1' });
    assert.deepEqual(wheres.forexVerification, { id: 'fv', salesContractId: 's1' });
    assert.deepEqual(wheres.taxRefund, { id: 'tr', salesContractId: 's1' });
  } finally {
    for (const n of names) prisma[n] = originals[n];
  }
});
