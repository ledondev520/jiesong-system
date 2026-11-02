/**
 * Input: productController、prisma
 * Output: 商品控制器写入字段回归测试
 * Pos: 后端控制器测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const productController = require('./productController');

const createMockRes = () => {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    },
  };
};

const withMockProductDelegate = async (mockDelegate, callback) => {
  const originalDelegate = prisma.product;
  prisma.product = mockDelegate;

  try {
    await callback();
  } finally {
    prisma.product = originalDelegate;
  }
};

test('create: 会写入 hsCode 与 declaration 字段', async () => {
  let createArgs = null;
  const res = createMockRes();

  await withMockProductDelegate({
    create: async (args) => {
      createArgs = args;
      return { id: 'product-1', ...args.data };
    },
  }, async () => {
    await productController.create({
      body: {
        customsName: '测试瓷砖',
        hsCode: '69072190',
        declaration: '釉面砖',
      },
    }, res, () => {});
  });

  assert.equal(createArgs.data.hsCode, '69072190');
  assert.equal(createArgs.data.declaration, '釉面砖');
  assert.equal(res.statusCode, 201);
});

test('update: 会更新 hsCode 与 declaration 字段', async () => {
  let updateArgs = null;
  const res = createMockRes();

  await withMockProductDelegate({
    update: async (args) => {
      updateArgs = args;
      return { id: 'product-1', ...args.data };
    },
  }, async () => {
    await productController.update({
      params: { id: 'product-1' },
      body: {
        customsName: '测试瓷砖',
        hsCode: '69072290',
        declaration: '其他釉面砖',
      },
    }, res, () => {});
  });

  assert.equal(updateArgs.data.hsCode, '69072290');
  assert.equal(updateArgs.data.declaration, '其他釉面砖');
  assert.equal(res.statusCode, 200);
});


test('list: 低库存按已入库商品汇总筛选再分页，包含零库存商品', async () => {
  const originalInventory = prisma.inventory;
  let listWhere;
  let nextError;
  const res = createMockRes();
  prisma.inventory = { groupBy: async ({where}) => {
    assert.equal(where.status, 'INBOUND');
    return [{productId:'healthy',_sum:{quantity:6}}];
  }};
  try {
    await withMockProductDelegate({
      findMany: async (args) => {
        if (args.where.lowStockThreshold) return [
          {id:'zero',customsName:'零库存',lowStockThreshold:5},
          {id:'healthy',customsName:'正常商品',lowStockThreshold:5},
        ];
        listWhere = args.where;
        return [{id:'zero',customsName:'零库存'}];
      },
      count: async () => 1,
    }, async () => productController.list({query:{lowStock:'true',page:'1',pageSize:'20'}},res,error=>{nextError=error;}));
    assert.ifError(nextError);
    assert.deepEqual(listWhere.id.in,['zero']);
    assert.equal(res.payload.data.pagination.total,1);
    assert.equal(res.payload.data.items[0].availableStock,0);
  } finally { prisma.inventory=originalInventory; }
});

test('list: 资料不全筛选毛重/体积/HS 缺失，并保留关键词的 OR 条件', async () => {
  let listWhere;
  let nextError;
  const res = createMockRes();
  const originalRaw = prisma.$queryRaw;
  prisma.$queryRaw = async () => [];
  try {
    await withMockProductDelegate({
      findMany: async (args) => { listWhere = args.where; return []; },
      count: async () => 0,
    }, async () => productController.list({ query: { incomplete: 'true', keyword: '砖', page: '1', pageSize: '20' } }, res, error => { nextError = error; }));
  } finally { prisma.$queryRaw = originalRaw; }
  assert.ifError(nextError);
  assert.equal(listWhere.OR.length, 2);
  const fields = listWhere.AND[0].OR.map(clause => Object.keys(clause)[0]);
  assert.deepEqual([...new Set(fields)], ['grossWeight', 'volume', 'hsCode']);
});

test('list: 资料不全筛选把仅空白的 HS 编码视为缺失（按原始查询得到的 id 加入 OR）', async () => {
  let listWhere;
  let rawSql;
  const originalRaw = prisma.$queryRaw;
  prisma.$queryRaw = async (strings) => { rawSql = strings.join('?'); return [{ id: 'blank-hs' }]; };
  try {
    await withMockProductDelegate({
      findMany: async (args) => { listWhere = args.where; return []; },
      count: async () => 0,
    }, async () => productController.list({ query: { incomplete: 'true', page: '1', pageSize: '20' } }, createMockRes(), error => { throw error; }));
  } finally { prisma.$queryRaw = originalRaw; }
  assert.match(rawSql, /TRIM\(hsCode,/);
  assert.deepEqual(listWhere.AND[0].OR.at(-1), { id: { in: ['blank-hs'] } });
});

test('list: 未传 incomplete 时不加资料不全条件', async () => {
  let listWhere;
  const res = createMockRes();
  await withMockProductDelegate({
    findMany: async (args) => { listWhere = args.where; return []; },
    count: async () => 0,
  }, async () => productController.list({ query: { page: '1', pageSize: '20' } }, res, () => {}));
  assert.equal(listWhere.AND, undefined);
});

test('请求体校验：数组/对象/非十进制数值 400，空串为 null，数字字符串转数字，更新时未传字段省略', async () => {
  const run = async (method, body) => {
    const res = createMockRes();
    let args = null;
    let error = null;
    await withMockProductDelegate({
      create: async (a) => { args = a; return { id: 'p', ...a.data }; },
      update: async (a) => { args = a; return { id: 'p', ...a.data }; },
    }, async () => {
      await productController[method]({ params: { id: 'p' }, body }, res, (e) => { error = e; });
    });
    return { args, error };
  };
  for (const body of [
    { customsName: ['x'] },
    { grossWeight: {} },
    { grossWeight: '0x10' },
    { grossWeight: 'abc' },
  ]) {
    const { args, error } = await run('create', body);
    assert.equal(error?.statusCode, 400);
    assert.equal(args, null);
  }
  const ok = await run('create', { customsName: 'n', grossWeight: '1.5', netWeight: '', volume: '  ' });
  assert.equal(ok.error, null);
  assert.equal(ok.args.data.grossWeight, 1.5);
  assert.equal(ok.args.data.netWeight, null);
  assert.equal(ok.args.data.volume, null);
  // 旧 Number() 写法的小数字符串继续接受（.5 / 1. / +1），只拒绝非十进制写法
  for (const [raw, want] of [['.5', 0.5], ['1.', 1], ['+1', 1]]) {
    const res = await run('create', { customsName: 'n', grossWeight: raw });
    assert.equal(res.args.data.grossWeight, want, raw);
  }
  const partial = await run('update', { customsName: 'n' });
  assert.equal(partial.args.data.grossWeight, undefined);
});

test('请求体校验：超长数字串不触发正则回溯（ReDoS 回归），失败匹配快速返回 400', async () => {
  const run = async (grossWeight) => {
    const res = createMockRes();
    let error = null;
    await withMockProductDelegate({ create: async (a) => ({ id: 'p', ...a.data }) }, async () => {
      await productController.create({ params: {}, body: { customsName: 'n', grossWeight } }, res, (e) => { error = e; });
    });
    return error;
  };
  // 旧正则 \d+\.?\d* 对 20k 个 0 + 非法尾字符为 O(n^2)（约 3 秒）；线性正则应在毫秒级
  for (const raw of ['0'.repeat(20000) + 'x', '0'.repeat(20000) + '.' + '0'.repeat(20000) + 'x', '0'.repeat(20000) + 'e']) {
    const start = process.hrtime.bigint();
    const error = await run(raw);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    assert.equal(error?.statusCode, 400);
    assert.ok(ms < 500, `took ${ms}ms`);
  }
  assert.equal(await run('0'.repeat(20000)), null); // 合法的超长数字串仍可通过
});

test('请求体不是普通对象（null/数组/字符串）时 create 与 update 返回 400', async () => {
  for (const method of ['create', 'update']) {
    for (const body of [null, [], ['x'], 'abc']) {
      let error = null;
      let called = false;
      await withMockProductDelegate({
        create: async () => { called = true; return {}; },
        update: async () => { called = true; return {}; },
      }, async () => {
        await productController[method]({ params: { id: 'p' }, body }, createMockRes(), (e) => { error = e; });
      });
      assert.equal(error?.statusCode, 400);
      assert.equal(called, false);
    }
  }
});

test('list: 普通列表每个商品带可用库存(已入库合计)，无库存记录为 0', async () => {
  const originalInventory = prisma.inventory;
  const res = createMockRes();
  let stockWhere;
  prisma.inventory = { groupBy: async ({ where }) => {
    stockWhere = where;
    return [{ productId: 'a', _sum: { quantity: 12 } }];
  } };
  try {
    await withMockProductDelegate({
      findMany: async () => [{ id: 'a', customsName: '有库存' }, { id: 'b', customsName: '无库存记录' }],
      count: async () => 2,
    }, async () => productController.list({ query: { page: '1', pageSize: '20' } }, res, (error) => { throw error; }));
    assert.equal(stockWhere.status, 'INBOUND');
    assert.deepEqual(stockWhere.productId.in, ['a', 'b']);
    assert.deepEqual(res.payload.data.items.map(item => item.availableStock), [12, 0]);
  } finally { prisma.inventory = originalInventory; }
});

test('getById: 详情带可用库存', async () => {
  const originalInventory = prisma.inventory;
  const res = createMockRes();
  prisma.inventory = { groupBy: async () => [{ productId: 'a', _sum: { quantity: 7 } }] };
  try {
    await withMockProductDelegate({
      findUnique: async () => ({ id: 'a', customsName: '详情商品' }),
    }, async () => productController.getById({ params: { id: 'a' } }, res, (error) => { throw error; }));
    assert.equal(res.payload.data.availableStock, 7);
  } finally { prisma.inventory = originalInventory; }
});
