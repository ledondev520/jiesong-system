/**
 * Input: customsDeclarationService、prisma
 * Output: 报关单服务 CRUD 单元测试
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const customsDeclarationService = require('./customsDeclarationService');

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

test('listCustomsDeclarations: 组装筛选条件并分页查询', async () => {
  let findManyArgs = null;

  await withMockDelegate('customsDeclaration', {
    findMany: async (args) => {
      findManyArgs = args;
      return [{ id: 'cd-1', declarationNo: 'DEC-001' }];
    },
    count: async () => 1,
  }, async () => {
    const result = await customsDeclarationService.listCustomsDeclarations({
      page: 2,
      pageSize: 5,
      salesContractId: 'sc-1',
      status: 'SUBMITTED',
      keyword: 'DEC',
    });

    assert.deepEqual(findManyArgs.where, {
      salesContractId: 'sc-1',
      status: 'SUBMITTED',
      OR: [
        { declarationNo: { contains: 'DEC' } },
        { customsBroker: { contains: 'DEC' } },
      ],
    });
    assert.equal(findManyArgs.skip, 5);
    assert.equal(findManyArgs.take, 5);
    assert.equal(result.total, 1);
    assert.equal(result.items[0].declarationNo, 'DEC-001');
  });
});

test('getCustomsDeclarationById: 记录不存在时抛出404', async () => {
  await withMockDelegate('customsDeclaration', {
    findUnique: async () => null,
  }, async () => {
    await assert.rejects(
      () => customsDeclarationService.getCustomsDeclarationById('missing-id'),
      (error) => error.statusCode === 404 && error.message === '报关单不存在',
    );
  });
});

test('createCustomsDeclaration: 转换金额与日期字段后写入', async () => {
  let createArgs = null;

  await withMockDelegate('customsDeclaration', {
    create: async (args) => {
      createArgs = args;
      return { id: 'cd-2', ...args.data };
    },
  }, async () => {
    const result = await customsDeclarationService.createCustomsDeclaration({
      salesContractId: 'sc-1',
      declarationNo: 'DEC-20260307-01',
      status: 'DRAFT',
      customsBroker: 'ABC Broker',
      declaredAt: '2026-03-06',
      exportDate: '2026-03-07',
      totalAmount: '1024.5',
      totalQuantity: '88',
      totalNetWeight: '900.5',
      totalGrossWeight: '930.25',
      currency: 'USD',
      exchangeRate: '7.18',
      note: 'first draft',
    });

    assert.equal(createArgs.data.totalAmount, 1024.5);
    assert.equal(createArgs.data.totalQuantity, 88);
    assert.equal(createArgs.data.totalNetWeight, 900.5);
    assert.equal(createArgs.data.totalGrossWeight, 930.25);
    assert.equal(createArgs.data.exchangeRate, 7.18);
    assert.ok(createArgs.data.declaredAt instanceof Date);
    assert.ok(createArgs.data.exportDate instanceof Date);
    assert.equal(result.declarationNo, 'DEC-20260307-01');
  });
});

test('updateCustomsDeclaration: 记录存在时更新并保留空值语义', async () => {
  let updateArgs = null;

  await withMockDelegate('customsDeclaration', {
    findUnique: async () => ({ id: 'cd-3' }),
    update: async (args) => {
      updateArgs = args;
      return { id: 'cd-3', ...args.data };
    },
  }, async () => {
    const result = await customsDeclarationService.updateCustomsDeclaration('cd-3', {
      customsBroker: 'Updated Broker',
      exportDate: '2026-03-08',
      totalAmount: '2048',
      note: null,
    });

    assert.equal(updateArgs.where.id, 'cd-3');
    assert.equal(updateArgs.data.customsBroker, 'Updated Broker');
    assert.equal(updateArgs.data.totalAmount, 2048);
    assert.ok(updateArgs.data.exportDate instanceof Date);
    assert.equal(result.id, 'cd-3');
  });
});

test('removeCustomsDeclaration: 记录存在时执行删除', async () => {
  let deleteArgs = null;

  await withMockDelegate('customsDeclaration', {
    findUnique: async () => ({ id: 'cd-4' }),
    delete: async (args) => {
      deleteArgs = args;
      return { id: 'cd-4' };
    },
  }, async () => {
    await customsDeclarationService.removeCustomsDeclaration('cd-4');
    assert.deepEqual(deleteArgs, { where: { id: 'cd-4' } });
  });
});
