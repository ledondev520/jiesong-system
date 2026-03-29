const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../../utils/prisma');
const { searchEntities } = require('./searchEntities');

test('searchEntities: 统一聚合 product/supplier/purchase/sales 结果并按 score 排序', async () => {
  const originals = {
    productFindMany: prisma.product.findMany,
    supplierFindMany: prisma.supplier.findMany,
    purchaseFindMany: prisma.purchaseContract.findMany,
    salesFindMany: prisma.salesContract.findMany,
  };

  prisma.product.findMany = async () => ([
    {
      id: 'product-1',
      customsName: '瓷砖',
      specification: '600x600',
      unit: '片',
    },
  ]);
  prisma.supplier.findMany = async () => ([
    {
      id: 'supplier-1',
      name: '佛山瓷砖供应商',
      shortName: '佛山A厂',
    },
  ]);
  prisma.purchaseContract.findMany = async () => ([
    {
      id: 'purchase-1',
      contractNo: 'CG2600001',
      supplier: { name: '佛山瓷砖供应商' },
    },
  ]);
  prisma.salesContract.findMany = async () => ([
    {
      id: 'sales-1',
      contractNo: 'EXP2600001',
      totalAmount: 1200,
    },
  ]);

  try {
    const results = await searchEntities({ query: '瓷砖', limit: 6 });

    assert.equal(results.length, 4);
    assert.deepEqual(results.map((item) => item.type), ['product', 'supplier', 'purchase', 'sales']);
    assert.equal(results[0].title, '瓷砖');
    assert.match(results[1].subtitle, /佛山A厂/);
    assert.match(results[2].subtitle, /佛山瓷砖供应商/);
  } finally {
    prisma.product.findMany = originals.productFindMany;
    prisma.supplier.findMany = originals.supplierFindMany;
    prisma.purchaseContract.findMany = originals.purchaseFindMany;
    prisma.salesContract.findMany = originals.salesFindMany;
  }
});

test('searchEntities: 支持按 types 过滤并对过短查询直接返回空数组', async () => {
  const originalFindMany = prisma.product.findMany;
  let called = false;
  prisma.product.findMany = async () => {
    called = true;
    return [];
  };

  try {
    const shortResults = await searchEntities({ query: 'a', types: ['product'] });
    assert.deepEqual(shortResults, []);
    assert.equal(called, false);

    await searchEntities({ query: '瓷砖', types: ['product'] });
    assert.equal(called, true);
  } finally {
    prisma.product.findMany = originalFindMany;
  }
});
