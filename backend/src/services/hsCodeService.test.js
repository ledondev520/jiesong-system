/**
 * Input: hsCodeService、prisma
 * Output: HSCode 搜索与人工证据化更新测试
 * Pos: 后端服务层测试，锁定当前税则快照的可追溯更新 Interface
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

test('listHsCodes: 空关键字时返回分页全量列表', async () => {
  let findManyArgs = null;
  let countArgs = null;

  await withMockDelegate('hsCode', {
    findMany: async (args) => {
      findManyArgs = args;
      return [
        { id: '1', hsCode: '01010101', productName: '商品A' },
        { id: '2', hsCode: '01010102', productName: '商品B' },
      ];
    },
    count: async (args) => {
      countArgs = args;
      return 2;
    },
  }, async () => {
    const result = await hsCodeService.listHsCodes({ keyword: '', page: 1, pageSize: 20 });

    assert.deepEqual(findManyArgs, {
      where: {},
      orderBy: [
        { effectiveDate: 'desc' },
        { hsCode: 'asc' },
      ],
      skip: 0,
      take: 20,
    });
    assert.deepEqual(countArgs, { where: {} });
    assert.deepEqual(result.pagination, {
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
    assert.equal(result.items.length, 2);
  });
});

test('listHsCodes: 纯数字关键词同时查商品名包含与 hsCode 前缀', async () => {
  let findManyArgs = null;

  await withMockDelegate('hsCode', {
    findMany: async (args) => {
      findManyArgs = args;
      return [{ id: '1', hsCode: '0802909020', productName: '某水果' }];
    },
    count: async () => 1,
  }, async () => {
    await hsCodeService.listHsCodes({ keyword: '0802909020', page: 1, pageSize: 20 });

    assert.deepEqual(findManyArgs.where, {
      OR: [
        { productName: { contains: '0802909020' } },
        { hsCode: { startsWith: '0802909020' } },
      ],
    });
  });
});

test('updateHsCode: 税率更新必须同时提交生效日期和官方来源，并刷新采集时间', async () => {
  let updatedArgs = null;

  await withMockDelegate('hsCode', {
    findUnique: async () => ({
      id: 'hs-1',
      hsCode: '6907219000',
      effectiveDate: new Date('2025-01-01T00:00:00.000Z'),
      sourceUrl: null,
    }),
    update: async (args) => {
      updatedArgs = args;
      return { id: 'hs-1', ...args.data, hsCode: '6907219000' };
    },
  }, async () => {
    const result = await hsCodeService.updateHsCode('6907219000', {
      refundRate: 0,
      vatRate: 13,
      effectiveDate: '2026-01-01',
      sourceUrl: 'https://www.chinatax.gov.cn/example',
      note: '2026 年人工复核',
    });

    assert.equal(updatedArgs.where.hsCode, '6907219000');
    assert.equal(updatedArgs.data.refundRate, 0);
    assert.equal(updatedArgs.data.vatRate, 13);
    assert.equal(updatedArgs.data.sourceUrl, 'https://www.chinatax.gov.cn/example');
    assert.equal(updatedArgs.data.effectiveDate.toISOString(), '2026-01-01T00:00:00.000Z');
    assert.ok(updatedArgs.data.fetchedAt instanceof Date);
    assert.equal(result.note, '2026 年人工复核');
  });
});

test('updateHsCode: 无来源的税率修改被拒绝，防止无证据覆盖当前税则', async () => {
  await withMockDelegate('hsCode', {
    findUnique: async () => ({
      id: 'hs-1',
      hsCode: '6907219000',
      effectiveDate: new Date('2025-01-01T00:00:00.000Z'),
      sourceUrl: null,
    }),
  }, async () => {
    await assert.rejects(
      () => hsCodeService.updateHsCode('6907219000', {
        refundRate: 0,
        effectiveDate: '2026-01-01',
      }),
      (error) => error.statusCode === 400 && /来源链接/.test(error.message),
    );
  });
});
