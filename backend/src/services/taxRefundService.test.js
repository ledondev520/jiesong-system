/**
 * Input: taxRefundService、prisma
 * Output: 退税服务 CRUD 单元测试
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const taxRefundService = require('./taxRefundService');

const withMockDelegate = async (delegateName, mockDelegate, callback) => {
  const originalDelegate = prisma[delegateName];
  prisma[delegateName] = mockDelegate;

  try {
    await callback();
  } finally {
    if (typeof originalDelegate === 'undefined') {
      delete prisma[delegateName];
    } else {
      prisma[delegateName] = originalDelegate;
    }
  }
};

test('listTaxRefunds: 支持状态与关键字筛选', async () => {
  let findManyArgs = null;

  await withMockDelegate('taxRefund', {
    findMany: async (args) => {
      findManyArgs = args;
      return [{ id: 'tr-1', refundNo: 'TR-001' }];
    },
    count: async () => 1,
  }, async () => {
    const result = await taxRefundService.listTaxRefunds({
      page: 3,
      pageSize: 3,
      salesContractId: 'sc-3',
      status: 'PROCESSING',
      keyword: '2026',
    });

    assert.deepEqual(findManyArgs.where, {
      salesContractId: 'sc-3',
      status: 'PROCESSING',
      OR: [
        { refundNo: { contains: '2026' } },
        { note: { contains: '2026' } },
      ],
    });
    assert.equal(findManyArgs.skip, 6);
    assert.equal(findManyArgs.take, 3);
    assert.equal(result.items[0].refundNo, 'TR-001');
  });
});

test('getTaxRefundById: 记录不存在时抛出404', async () => {
  await withMockDelegate('taxRefund', {
    findUnique: async () => null,
  }, async () => {
    await assert.rejects(
      () => taxRefundService.getTaxRefundById('missing-id'),
      (error) => error.statusCode === 404 && error.message === '退税记录不存在',
    );
  });
});

test('createTaxRefund: 转换金额与申请时间字段', async () => {
  let createArgs = null;

  await withMockDelegate('taxRefund', {
    create: async (args) => {
      createArgs = args;
      return { id: 'tr-2', ...args.data };
    },
  }, async () => {
    const result = await taxRefundService.createTaxRefund({
      salesContractId: 'sc-4',
      customsDeclarationId: 'cd-4',
      forexVerificationId: 'fv-4',
      refundNo: 'TR-20260307-01',
      status: 'APPLIED',
      declaredAmount: '12000',
      refundableAmount: '8888.66',
      refundedAmount: '0',
      appliedAt: '2026-03-07',
      refundedAt: '2026-03-10',
      note: 'apply submitted',
    });

    assert.equal(createArgs.data.declaredAmount, 12000);
    assert.equal(createArgs.data.refundableAmount, 8888.66);
    assert.equal(createArgs.data.refundedAmount, 0);
    assert.ok(createArgs.data.appliedAt instanceof Date);
    assert.ok(createArgs.data.refundedAt instanceof Date);
    assert.equal(result.refundNo, 'TR-20260307-01');
  });
});

test('updateTaxRefund: 记录存在时更新状态和金额', async () => {
  let updateArgs = null;

  await withMockDelegate('taxRefund', {
    findUnique: async () => ({ id: 'tr-3' }),
    update: async (args) => {
      updateArgs = args;
      return { id: 'tr-3', ...args.data };
    },
  }, async () => {
    await taxRefundService.updateTaxRefund('tr-3', {
      status: 'REFUNDED',
      refundedAmount: '9999',
      refundedAt: '2026-03-12',
    });

    assert.equal(updateArgs.data.status, 'REFUNDED');
    assert.equal(updateArgs.data.refundedAmount, 9999);
    assert.ok(updateArgs.data.refundedAt instanceof Date);
  });
});

test('removeTaxRefund: 记录存在时执行删除', async () => {
  let deleteArgs = null;

  await withMockDelegate('taxRefund', {
    findUnique: async () => ({ id: 'tr-4' }),
    delete: async (args) => {
      deleteArgs = args;
      return { id: 'tr-4' };
    },
  }, async () => {
    await taxRefundService.removeTaxRefund('tr-4');
    assert.deepEqual(deleteArgs, { where: { id: 'tr-4' } });
  });
});
