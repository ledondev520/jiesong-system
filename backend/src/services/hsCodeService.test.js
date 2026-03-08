/**
 * Input: hsCodeService、prisma
 * Output: HSCode 服务层搜索测试
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const hsCodeService = require('./hsCodeService');

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

test('searchByProductName: 按商品名称检索并返回前 10 条结果', async () => {
  let findManyArgs = null;

  await withMockDelegate('hsCode', {
    findMany: async (args) => {
      findManyArgs = args;
      return [
        { id: '1', hsCode: '69072190', productName: '抛光瓷砖', taxRate: 13, unit: '平方米', note: '', effectiveDate: new Date('2026-01-01') },
      ];
    },
  }, async () => {
    const result = await hsCodeService.searchByProductName('瓷砖');

    assert.deepEqual(findManyArgs, {
      where: {
        productName: {
          contains: '瓷砖',
        },
      },
      orderBy: [
        { effectiveDate: 'desc' },
        { hsCode: 'asc' },
      ],
      take: 10,
    });
    assert.equal(result[0].hsCode, '69072190');
  });
});

test('searchByHsCode: 按编码精确检索单条记录', async () => {
  let findFirstArgs = null;

  await withMockDelegate('hsCode', {
    findFirst: async (args) => {
      findFirstArgs = args;
      return { id: '2', hsCode: '39241000', productName: '塑料餐具', taxRate: 13 };
    },
  }, async () => {
    const result = await hsCodeService.searchByHsCode('39241000');

    assert.deepEqual(findFirstArgs, {
      where: { hsCode: '39241000' },
      orderBy: { effectiveDate: 'desc' },
    });
    assert.equal(result?.productName, '塑料餐具');
  });
});

test('getTaxRate: 未命中时返回 null，命中时返回税率', async () => {
  await withMockDelegate('hsCode', {
    findFirst: async () => ({ id: '3', hsCode: '44101100', productName: '纤维板', taxRate: 9 }),
  }, async () => {
    const result = await hsCodeService.getTaxRate('44101100');
    assert.equal(result, 9);
  });

  await withMockDelegate('hsCode', {
    findFirst: async () => null,
  }, async () => {
    const result = await hsCodeService.getTaxRate('00000000');
    assert.equal(result, null);
  });
});
