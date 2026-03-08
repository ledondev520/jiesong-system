/**
 * Input: taxRefundDraftService、prisma
 * Output: 自动生成退税草稿测试
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const prisma = require('../utils/prisma');
const taxRefundDraftService = require('./taxRefundDraftService');

const withMockDelegates = async (mockMap, callback) => {
  const originals = new Map();

  Object.entries(mockMap).forEach(([key, value]) => {
    originals.set(key, prisma[key]);
    prisma[key] = value;
  });

  try {
    await callback();
  } finally {
    originals.forEach((value, key) => {
      if (typeof value === 'undefined') {
        delete prisma[key];
      } else {
        prisma[key] = value;
      }
    });
  }
};

test('generateTaxRefundDrafts: 按报关单明细匹配 HSCode 退税率并生成草稿', async () => {
  const createdPayloads = [];

  await withMockDelegates({
    customsDeclaration: {
      findMany: async () => ([
        {
          id: 'cd-1',
          declarationNo: 'CUS-2026-001',
          salesContractId: 'sc-1',
          totalAmount: 120000,
          items: [
            { id: 'item-1', hsCode: '6904100000', totalPrice: 80000, customsName: '陶瓷制建筑用砖' },
            { id: 'item-2', hsCode: '6907219000', totalPrice: 40000, customsName: '抛光砖' },
          ],
        },
      ]),
    },
    taxRefund: {
      findFirst: async () => null,
      create: async ({ data }) => {
        createdPayloads.push(data);
        return { id: 'tr-1', ...data };
      },
    },
    hsCode: {
      findFirst: async ({ where }) => {
        if (where.hsCode === '6904100000') {
          return { hsCode: '6904100000', refundRate: 9, taxRate: 9 };
        }
        if (where.hsCode === '6907219000') {
          return { hsCode: '6907219000', refundRate: 13, taxRate: 13 };
        }
        return null;
      },
    },
    forexVerification: {
      findFirst: async () => ({
        id: 'fv-1',
        verificationNo: 'FV-2026-001',
      }),
    },
  }, async () => {
    const result = await taxRefundDraftService.generateTaxRefundDrafts({
      customsDeclarationId: 'cd-1',
    });

    assert.equal(result.created, 1);
    assert.equal(result.skipped, 0);
    assert.equal(result.items[0].customsDeclarationId, 'cd-1');
    assert.equal(createdPayloads.length, 1);
    assert.equal(createdPayloads[0].salesContractId, 'sc-1');
    assert.equal(createdPayloads[0].customsDeclarationId, 'cd-1');
    assert.equal(createdPayloads[0].forexVerificationId, 'fv-1');
    assert.equal(createdPayloads[0].declaredAmount, 120000);
    assert.equal(createdPayloads[0].refundableAmount, 12400);
    assert.equal(createdPayloads[0].status, 'DRAFT');
    assert.match(createdPayloads[0].refundNo, /^TR-AUTO-\d{8}-001$/);
    assert.match(createdPayloads[0].note, /自动生成/);
  });
});

test('generateTaxRefundDrafts: 已有退税记录时默认跳过', async () => {
  await withMockDelegates({
    customsDeclaration: {
      findMany: async () => ([
        {
          id: 'cd-2',
          declarationNo: 'CUS-2026-002',
          salesContractId: 'sc-2',
          totalAmount: 50000,
          items: [],
        },
      ]),
    },
    taxRefund: {
      findFirst: async () => ({ id: 'tr-existing' }),
      create: async () => {
        throw new Error('should not create');
      },
    },
    hsCode: {
      findFirst: async () => null,
    },
    forexVerification: {
      findFirst: async () => null,
    },
  }, async () => {
    const result = await taxRefundDraftService.generateTaxRefundDrafts({
      customsDeclarationId: 'cd-2',
    });

    assert.equal(result.created, 0);
    assert.equal(result.skipped, 1);
    assert.equal(result.items[0].reason, 'existing_refund');
  });
});
