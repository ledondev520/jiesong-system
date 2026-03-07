/**
 * Input: taxRateService、prisma
 * Output: 退税率服务 CRUD 单元测试
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const taxRateService = require('./taxRateService');

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

test('listTaxRates: 支持 HSCode、生效状态和关键字筛选', async () => {
  let findManyArgs = null;

  await withMockDelegate('taxRate', {
    findMany: async (args) => {
      findManyArgs = args;
      return [{ id: 'rate-1', hsCode: '94032000', refundRate: 13 }];
    },
    count: async () => 1,
  }, async () => {
    const result = await taxRateService.listTaxRates({
      page: 1,
      pageSize: 20,
      productId: 'product-1',
      hsCode: '94032000',
      isActive: true,
      keyword: '桌子',
    });

    assert.deepEqual(findManyArgs.where, {
      productId: 'product-1',
      hsCode: '94032000',
      isActive: true,
      OR: [
        { hsCode: { contains: '桌子' } },
        { product: { customsName: { contains: '桌子' } } },
      ],
    });
    assert.equal(result.items[0].refundRate, 13);
  });
});

test('getTaxRateById: 记录不存在时抛出404', async () => {
  await withMockDelegate('taxRate', {
    findUnique: async () => null,
  }, async () => {
    await assert.rejects(
      () => taxRateService.getTaxRateById('missing-id'),
      (error) => error.statusCode === 404 && error.message === '退税率不存在',
    );
  });
});

test('createTaxRate: 转换税率和时间字段', async () => {
  let createArgs = null;

  await withMockDelegate('taxRate', {
    create: async (args) => {
      createArgs = args;
      return { id: 'rate-2', ...args.data };
    },
  }, async () => {
    const result = await taxRateService.createTaxRate({
      productId: 'product-2',
      hsCode: '39269090',
      purchaseTaxRate: '13',
      refundRate: '9',
      effectiveFrom: '2026-03-01',
      effectiveTo: '2026-12-31',
      isActive: true,
      note: 'new policy',
    });

    assert.equal(createArgs.data.purchaseTaxRate, 13);
    assert.equal(createArgs.data.refundRate, 9);
    assert.ok(createArgs.data.effectiveFrom instanceof Date);
    assert.ok(createArgs.data.effectiveTo instanceof Date);
    assert.equal(result.hsCode, '39269090');
  });
});

test('updateTaxRate: 记录存在时更新税率与失效时间', async () => {
  let updateArgs = null;

  await withMockDelegate('taxRate', {
    findUnique: async () => ({ id: 'rate-3' }),
    update: async (args) => {
      updateArgs = args;
      return { id: 'rate-3', ...args.data };
    },
  }, async () => {
    await taxRateService.updateTaxRate('rate-3', {
      purchaseTaxRate: '10',
      refundRate: '7',
      effectiveTo: '2027-03-01',
      isActive: false,
    });

    assert.equal(updateArgs.data.purchaseTaxRate, 10);
    assert.equal(updateArgs.data.refundRate, 7);
    assert.equal(updateArgs.data.isActive, false);
    assert.ok(updateArgs.data.effectiveTo instanceof Date);
  });
});

test('removeTaxRate: 记录存在时执行删除', async () => {
  let deleteArgs = null;

  await withMockDelegate('taxRate', {
    findUnique: async () => ({ id: 'rate-4' }),
    delete: async (args) => {
      deleteArgs = args;
      return { id: 'rate-4' };
    },
  }, async () => {
    await taxRateService.removeTaxRate('rate-4');
    assert.deepEqual(deleteArgs, { where: { id: 'rate-4' } });
  });
});
