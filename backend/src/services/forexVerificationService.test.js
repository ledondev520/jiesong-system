/**
 * Input: forexVerificationService、prisma
 * Output: 收汇核销服务 CRUD 单元测试
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const forexVerificationService = require('./forexVerificationService');

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

test('listForexVerifications: 支持合同、报关单与关键字筛选', async () => {
  let findManyArgs = null;

  await withMockDelegate('forexVerification', {
    findMany: async (args) => {
      findManyArgs = args;
      return [{ id: 'fv-1', verificationNo: 'FX-001' }];
    },
    count: async () => 1,
  }, async () => {
    const result = await forexVerificationService.listForexVerifications({
      page: 1,
      pageSize: 10,
      salesContractId: 'sc-1',
      customsDeclarationId: 'cd-1',
      status: 'PENDING',
      keyword: 'Bank',
    });

    assert.deepEqual(findManyArgs.where, {
      salesContractId: 'sc-1',
      customsDeclarationId: 'cd-1',
      status: 'PENDING',
      OR: [
        { verificationNo: { contains: 'Bank' } },
        { bankName: { contains: 'Bank' } },
      ],
    });
    assert.equal(result.items[0].verificationNo, 'FX-001');
  });
});

test('getForexVerificationById: 记录不存在时抛出404', async () => {
  await withMockDelegate('forexVerification', {
    findUnique: async () => null,
  }, async () => {
    await assert.rejects(
      () => forexVerificationService.getForexVerificationById('missing-id'),
      (error) => error.statusCode === 404 && error.message === '收汇核销记录不存在',
    );
  });
});

test('createForexVerification: 转换汇率、金额和时间字段', async () => {
  let createArgs = null;

  await withMockDelegate('forexVerification', {
    create: async (args) => {
      createArgs = args;
      return { id: 'fv-2', ...args.data };
    },
  }, async () => {
    const result = await forexVerificationService.createForexVerification({
      salesContractId: 'sc-2',
      customsDeclarationId: 'cd-2',
      verificationNo: 'FX-20260307-01',
      status: 'APPROVED',
      bankName: 'Bank of China',
      receivedAmount: '3000.25',
      settledAmount: '21331.78',
      currency: 'USD',
      exchangeRate: '7.11',
      verifiedAt: '2026-03-06T10:00:00.000Z',
      note: 'verified',
    });

    assert.equal(createArgs.data.receivedAmount, 3000.25);
    assert.equal(createArgs.data.settledAmount, 21331.78);
    assert.equal(createArgs.data.exchangeRate, 7.11);
    assert.ok(createArgs.data.verifiedAt instanceof Date);
    assert.equal(result.verificationNo, 'FX-20260307-01');
  });
});

test('updateForexVerification: 记录存在时执行更新', async () => {
  let updateArgs = null;

  await withMockDelegate('forexVerification', {
    findUnique: async () => ({ id: 'fv-3' }),
    update: async (args) => {
      updateArgs = args;
      return { id: 'fv-3', ...args.data };
    },
  }, async () => {
    await forexVerificationService.updateForexVerification('fv-3', {
      status: 'REMITTED',
      receivedAmount: '5000',
      verifiedAt: '2026-03-07',
    });

    assert.equal(updateArgs.data.status, 'REMITTED');
    assert.equal(updateArgs.data.receivedAmount, 5000);
    assert.ok(updateArgs.data.verifiedAt instanceof Date);
  });
});

test('removeForexVerification: 记录存在时执行删除', async () => {
  let deleteArgs = null;

  await withMockDelegate('forexVerification', {
    findUnique: async () => ({ id: 'fv-4' }),
    delete: async (args) => {
      deleteArgs = args;
      return { id: 'fv-4' };
    },
  }, async () => {
    await forexVerificationService.removeForexVerification('fv-4');
    assert.deepEqual(deleteArgs, { where: { id: 'fv-4' } });
  });
});
