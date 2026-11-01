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

// 最小的 hsCode 内存表：只支持本检索用到的 where（contains/startsWith/OR/AND/id in）。
const makeHsTable = (rows) => {
  const matches = (row, where = {}) =>
    Object.entries(where).every(([key, cond]) => {
      if (key === 'OR') return cond.some((c) => matches(row, c));
      if (key === 'AND') return cond.every((c) => matches(row, c));
      if (cond && typeof cond === 'object') {
        if ('contains' in cond) return String(row[key] || '').toLowerCase().includes(cond.contains.toLowerCase());
        if ('startsWith' in cond) return String(row[key] || '').startsWith(cond.startsWith);
        if ('in' in cond) return cond.in.includes(row[key]);
      }
      return row[key] === cond;
    });
  return {
    findMany: async ({ where, take }) => rows.filter((row) => matches(row, where)).slice(0, take),
    count: async ({ where } = {}) => rows.filter((row) => matches(row, where)).length,
  };
};

const hsRows = [
  { id: '1', hsCode: '3924100000', productName: '塑料制餐具及厨房用具', title: null },
  { id: '2', hsCode: '6911100000', productName: '瓷制餐具', title: null },
  { id: '3', hsCode: '3909200000', productName: '密胺塑料', title: null },
  { id: '4', hsCode: '7323930000', productName: '不锈钢制餐桌用具', title: 'Stainless steel tableware' },
];

test('fuzzySearchHsCodes: 英文品名 melamine 通过别名命中中文品名（原先 0 条）', async () => {
  await withMockDelegate('hsCode', makeHsTable(hsRows), async () => {
    const result = await hsCodeService.fuzzySearchHsCodes({ keyword: 'melamine' });
    const codes = result.items.map((item) => item.hsCode);
    assert.ok(codes.includes('3909200000'), '密胺塑料应命中');
    assert.ok(codes.includes('3924100000'), '塑料餐具应命中');
    assert.ok(!codes.includes('6911100000'), '无关陶瓷餐具不应命中');
  });
});

test('fuzzySearchHsCodes: 大小写与复数不影响别名，多词只扩展已知词', async () => {
  await withMockDelegate('hsCode', makeHsTable(hsRows), async () => {
    const upper = await hsCodeService.fuzzySearchHsCodes({ keyword: 'MELAMINE Plates' });
    assert.ok(upper.items.some((item) => item.hsCode === '3909200000'));
    const unknown = await hsCodeService.fuzzySearchHsCodes({ keyword: 'zzzunknown' });
    assert.equal(unknown.items.length, 0);
  });
});

test('fuzzySearchHsCodes: 仅标题含英文词的记录也能被找到', async () => {
  await withMockDelegate('hsCode', makeHsTable(hsRows), async () => {
    const result = await hsCodeService.fuzzySearchHsCodes({ keyword: 'Stainless steel' });
    assert.deepEqual(result.items.map((item) => item.hsCode), ['7323930000']);
  });
});

test('fuzzySearchHsCodes: 中文关键词与纯数字编码检索行为不变', async () => {
  await withMockDelegate('hsCode', makeHsTable(hsRows), async () => {
    const byName = await hsCodeService.fuzzySearchHsCodes({ keyword: '瓷制餐具' });
    assert.equal(byName.items[0].hsCode, '6911100000');
    const byCode = await hsCodeService.fuzzySearchHsCodes({ keyword: '3924' });
    assert.deepEqual(byCode.items.map((item) => item.hsCode), ['3924100000']);
  });
});

test('fuzzySearchHsCodes: 同时给编码前缀与英文品名，按别名收紧', async () => {
  await withMockDelegate('hsCode', makeHsTable(hsRows), async () => {
    const result = await hsCodeService.fuzzySearchHsCodes({ keyword: 'melamine', code: '39' });
    assert.deepEqual(result.items.map((item) => item.hsCode).sort(), ['3909200000', '3924100000']);
  });
});
