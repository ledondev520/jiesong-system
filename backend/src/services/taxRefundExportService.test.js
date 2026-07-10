/**
 * Input: taxRefundExportService、prisma
 * Output: 退税导出前校验与导出结果单元测试
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const taxRefundExportService = require('./taxRefundExportService');

const withMockDelegates = async (delegates, callback) => {
  const originals = new Map();

  Object.entries(delegates).forEach(([delegateName, mockDelegate]) => {
    originals.set(delegateName, prisma[delegateName]);
    prisma[delegateName] = mockDelegate;
  });

  try {
    await callback();
  } finally {
    originals.forEach((originalDelegate, delegateName) => {
      if (typeof originalDelegate === 'undefined') {
        delete prisma[delegateName];
      } else {
        prisma[delegateName] = originalDelegate;
      }
    });
  }
};

const buildRecord = (overrides = {}) => ({
  id: 'tr-1',
  refundNo: 'TR-001',
  salesContractId: 'sc-1',
  customsDeclarationId: 'cd-1',
  forexVerificationId: null,
  status: 'DRAFT',
  declaredAmount: 1000,
  refundableAmount: 130,
  refundedAmount: 0,
  relation_no: 'PC-001',
  invoice_no: 'INV-001',
  vat_rate_type: 13,
  match_status: 'pending',
  appliedAt: new Date('2026-03-08T00:00:00.000Z'),
  refundedAt: null,
  note: 'test note',
  createdAt: new Date('2026-03-08T00:00:00.000Z'),
  updatedAt: new Date('2026-03-08T00:00:00.000Z'),
  ...overrides,
});

test('exportTaxRefunds: P0 缺失字段与税率不一致时阻断导出并写回 match_status', async () => {
  const updateCalls = [];

  await withMockDelegates({
    taxRefund: {
      findMany: async () => ([
        buildRecord({ id: 'tr-1', relation_no: null }),
        buildRecord({ id: 'tr-2', refundNo: 'TR-002', relation_no: 'PC-002', invoice_no: '   ' }),
        buildRecord({ id: 'tr-3', refundNo: 'TR-003', relation_no: 'PC-003', invoice_no: 'INV-003', vat_rate_type: 1 }),
        buildRecord({ id: 'tr-4', refundNo: 'TR-004', relation_no: 'PC-004', invoice_no: 'INV-WRONG' }),
        buildRecord({ id: 'tr-5', refundNo: 'TR-005', relation_no: 'PC-UNKNOWN', invoice_no: 'INV-005' }),
      ]),
      update: async (args) => {
        updateCalls.push(args);
        return { id: args.where.id, ...args.data };
      },
    },
    purchaseContract: {
      findMany: async () => ([
        { id: 'pc-3', contractNo: 'PC-003', invoiceNo: 'INV-003', taxRate: 13 },
        { id: 'pc-4', contractNo: 'PC-004', invoiceNo: 'INV-004', taxRate: 13 },
      ]),
    },
  }, async () => {
    const result = await taxRefundExportService.exportTaxRefunds();

    assert.equal(result.blocked, true);
    assert.equal(result.items.length, 0);
    assert.equal(result.exportedCount, 0);
    assert.ok(result.errors.some((item) => item.taxRefundId === 'tr-1' && item.code === 'missing_relation_no'));
    assert.ok(result.errors.some((item) => item.taxRefundId === 'tr-2' && item.code === 'missing_invoice_no'));
    assert.ok(result.errors.some((item) => item.taxRefundId === 'tr-3' && item.code === 'vat_rate_mismatch'));
    assert.ok(result.errors.some((item) => item.taxRefundId === 'tr-4' && item.code === 'invoice_no_mismatch'));
    assert.ok(result.errors.some((item) => item.taxRefundId === 'tr-5' && item.code === 'relation_not_found'));
    assert.deepEqual(
      updateCalls.map((item) => ({ id: item.where.id, match_status: item.data.match_status })),
      [
        { id: 'tr-1', match_status: 'blocked' },
        { id: 'tr-2', match_status: 'blocked' },
        { id: 'tr-3', match_status: 'blocked' },
        { id: 'tr-4', match_status: 'blocked' },
        { id: 'tr-5', match_status: 'blocked' },
      ],
    );
  });
});

test('exportTaxRefunds: 规范化可修复格式并仅导出 passed 记录', async () => {
  const updateCalls = [];

  await withMockDelegates({
    taxRefund: {
      findMany: async () => ([
        buildRecord({
          id: 'tr-4',
          refundNo: 'TR-004',
          relation_no: ' 000PC-004 ',
          invoice_no: '  000INV-004  ',
          vat_rate_type: '9',
        }),
      ]),
      update: async (args) => {
        updateCalls.push(args);
        return { id: args.where.id, ...args.data };
      },
    },
    purchaseContract: {
      findMany: async () => ([
        { id: 'pc-4', contractNo: 'PC-004', invoiceNo: '000INV-004', taxRate: 9 },
      ]),
    },
  }, async () => {
    const result = await taxRefundExportService.exportTaxRefunds();

    assert.equal(result.blocked, false);
    assert.equal(result.exportedCount, 1);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].relation_no, 'PC-004');
    assert.equal(result.items[0].invoice_no, '000INV-004');
    assert.equal(result.items[0].match_status, 'passed');
    assert.ok(result.fixes.some((item) => item.taxRefundId === 'tr-4' && item.field === 'relation_no'));
    assert.ok(result.fixes.some((item) => item.taxRefundId === 'tr-4' && item.field === 'invoice_no'));
    assert.match(result.csv, /PC-004/);
    assert.match(result.csv, /000INV-004/);
    assert.deepEqual(
      updateCalls.map((item) => ({ id: item.where.id, match_status: item.data.match_status })),
      [{ id: 'tr-4', match_status: 'passed' }],
    );
  });
});

test('exportTaxRefunds: 同一发票号关联多个采购合同时阻断整批导出', async () => {
  const updateCalls = [];

  await withMockDelegates({
    taxRefund: {
      findMany: async () => ([
        buildRecord({ id: 'tr-a', refundNo: 'TR-A', relation_no: 'PC-A', invoice_no: 'INV-DUP' }),
        buildRecord({ id: 'tr-b', refundNo: 'TR-B', relation_no: 'PC-B', invoice_no: 'INV-DUP' }),
      ]),
      update: async (args) => {
        updateCalls.push(args);
        return { id: args.where.id, ...args.data };
      },
    },
    purchaseContract: {
      findMany: async () => ([
        { id: 'pc-a', contractNo: 'PC-A', invoiceNo: 'INV-DUP', taxRate: 13 },
        { id: 'pc-b', contractNo: 'PC-B', invoiceNo: 'INV-DUP', taxRate: 13 },
      ]),
    },
  }, async () => {
    const result = await taxRefundExportService.exportTaxRefunds();

    assert.equal(result.blocked, true);
    assert.equal(result.exportedCount, 0);
    assert.equal(result.errors.filter((item) => item.code === 'invoice_relation_conflict').length, 2);
    assert.deepEqual(
      updateCalls.map((item) => item.data.match_status),
      ['blocked', 'blocked'],
    );
  });
});
