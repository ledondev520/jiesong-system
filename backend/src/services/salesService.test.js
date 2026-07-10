/**
 * Input: salesService、prisma
 * Output: 销售服务关键路径测试（合同/明细/计算）
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const salesService = require('./salesService');
const inventorySnapshot = require('./inventorySnapshot');

test('getSalesContracts: 组装筛选条件并分页查询', async () => {
  const originalFindMany = prisma.salesContract.findMany;
  const originalCount = prisma.salesContract.count;
  let findManyArgs = null;

  prisma.salesContract.findMany = async (args) => {
    findManyArgs = args;
    return [{
      id: 'sc-1',
      contractNo: 'EXP260001',
      packingItems: [
        {
          id: 'pk-1',
          isOwnedByJiesong: true,
          sourceParty: null,
          store: { id: 'store-1', name: '圣荷西2115' },
        },
        {
          id: 'pk-2',
          isOwnedByJiesong: false,
          sourceParty: '阿珍贵州',
          store: { id: 'store-2', name: '禧瑞都' },
        },
        {
          id: 'pk-3',
          isOwnedByJiesong: false,
          sourceParty: '阿珍贵州',
          store: { id: 'store-1', name: '圣荷西2115' },
        },
      ],
    }];
  };
  prisma.salesContract.count = async () => 1;

  try {
    const result = await salesService.getSalesContracts({
      page: 3,
      pageSize: 5,
      status: 'DRAFT',
      storeId: 'store-1',
      keyword: 'EXP',
    });

    assert.deepEqual(findManyArgs.where, {
      status: 'DRAFT',
      items: { some: { storeId: 'store-1' } },
      contractNo: { contains: 'EXP' },
    });
    assert.equal(findManyArgs.skip, 10);
    assert.equal(findManyArgs.take, 5);
    assert.equal(result.total, 1);
    assert.equal(result.contracts.length, 1);
    assert.deepEqual(result.contracts[0].stores, ['圣荷西2115', '禧瑞都']);
    assert.equal(result.contracts[0].hasThirdPartyCargo, true);
    assert.deepEqual(result.contracts[0].sourceParties, ['阿珍贵州']);
  } finally {
    prisma.salesContract.findMany = originalFindMany;
    prisma.salesContract.count = originalCount;
  }
});

test('getSalesContractById: 合同不存在时抛出404', async () => {
  const originalFindUnique = prisma.salesContract.findUnique;
  prisma.salesContract.findUnique = async () => null;

  try {
    await assert.rejects(
      () => salesService.getSalesContractById('missing'),
      (error) => error.statusCode === 404 && error.message === '出口合同不存在',
    );
  } finally {
    prisma.salesContract.findUnique = originalFindUnique;
  }
});

test('getSalesContractById: 返回第三方拼柜标记与来源方', async () => {
  const originalFindUnique = prisma.salesContract.findUnique;
  prisma.salesContract.findUnique = async () => ({
    id: 'sc-2',
    contractNo: 'EXP260002',
    packingItems: [
      { id: 'pk-1', isOwnedByJiesong: true, sourceParty: null },
      { id: 'pk-2', isOwnedByJiesong: false, sourceParty: '绿零' },
      { id: 'pk-3', isOwnedByJiesong: false, sourceParty: '' },
    ],
  });

  try {
    const result = await salesService.getSalesContractById('sc-2');
    assert.equal(result.hasThirdPartyCargo, true);
    assert.deepEqual(result.sourceParties, ['绿零', '第三方拼柜']);
  } finally {
    prisma.salesContract.findUnique = originalFindUnique;
  }
});

test('createSalesContract: 未传合同号时自动生成并写入', async () => {
  const originalCount = prisma.salesContract.count;
  const originalCreate = prisma.salesContract.create;
  let createArgs = null;

  prisma.salesContract.count = async () => 7;
  prisma.salesContract.create = async (args) => {
    createArgs = args;
    return { id: 'sc-1', ...args.data };
  };

  try {
    const result = await salesService.createSalesContract({ exchangeRate: '6.5' });
    const year = new Date().getFullYear().toString().slice(-2);

    assert.equal(createArgs.data.contractNo, `EXP${year}00008`);
    assert.equal(createArgs.data.exchangeRate, 6.5);
    assert.equal(result.contractNo, `EXP${year}00008`);
  } finally {
    prisma.salesContract.count = originalCount;
    prisma.salesContract.create = originalCreate;
  }
});

test('addSalesItem: 未传 sellingPrice 时按汇率与利润率计算并回写总额', async () => {
  const originalFindUnique = prisma.salesContract.findUnique;
  const originalCreate = prisma.salesItem.create;
  const originalFindMany = prisma.salesItem.findMany;
  const originalUpdate = prisma.salesContract.update;
  let createArgs = null;
  let updateArgs = null;

  prisma.salesContract.findUnique = async () => ({ id: 'sc-1', exchangeRate: 5 });
  prisma.salesItem.create = async (args) => {
    createArgs = args;
    return { id: 'si-1', ...args.data };
  };
  prisma.salesItem.findMany = async () => [{
    quantity: 2,
    sellingPrice: 13,
    costPrice: 50,
  }];
  prisma.salesContract.update = async (args) => {
    updateArgs = args;
    return { id: 'sc-1' };
  };

  try {
    await salesService.addSalesItem('sc-1', {
      productId: 'p-1',
      storeId: 's-1',
      quantity: 2,
      unit: '件',
      costPrice: 50,
    });

    assert.equal(createArgs.data.sellingPrice, 13);
    assert.deepEqual(updateArgs, {
      where: { id: 'sc-1' },
      data: { totalAmount: 26 },
    });
  } finally {
    prisma.salesContract.findUnique = originalFindUnique;
    prisma.salesItem.create = originalCreate;
    prisma.salesItem.findMany = originalFindMany;
    prisma.salesContract.update = originalUpdate;
  }
});

test('updateSalesStatus: 历史 out_stock 会规范为 SHIPPED 并触发自动出库扣减', async () => {
  const originalTransaction = prisma.$transaction;
  const originalApplySalesOutStock = inventorySnapshot.applySalesOutStock;
  let updatedStatus = null;
  let updatedData = null;
  let outStockCalled = false;

  prisma.$transaction = async (fn) => fn({
    salesContract: {
      findUnique: async () => ({
        id: 'sc-1',
        status: 'PENDING_SHIPMENT',
        grossWeight: 1000,
        volume: 60,
        packingItems: [{
          id: 'pk-1',
          boxes: 1,
          quantity: 1,
          volume: 60,
          length: 1000,
          width: 1000,
          height: 1000,
          product: { customsName: '可装货物' },
        }],
      }),
      update: async (args) => {
        updatedData = args.data;
        updatedStatus = args.data.status;
        return { id: 'sc-1', status: args.data.status };
      },
    },
  });
  inventorySnapshot.applySalesOutStock = async (_tx, salesContractId) => {
    outStockCalled = salesContractId === 'sc-1';
    return { results: [] };
  };

  try {
    const contract = await salesService.updateSalesStatus('sc-1', 'out_stock');
    assert.equal(updatedStatus, 'SHIPPED');
    assert.ok(updatedData.shippedAt instanceof Date);
    assert.equal(outStockCalled, true);
    assert.equal(contract.status, 'SHIPPED');
  } finally {
    prisma.$transaction = originalTransaction;
    inventorySnapshot.applySalesOutStock = originalApplySalesOutStock;
  }
});

test('updateSalesStatus: 有箱件无法放入时拒绝确认发运', async () => {
  const originalTransaction = prisma.$transaction;
  const originalApplySalesOutStock = inventorySnapshot.applySalesOutStock;
  let outStockCalled = false;

  prisma.$transaction = async (fn) => fn({
    salesContract: {
      findUnique: async () => ({
        id: 'sc-1',
        status: 'PACKING',
        grossWeight: 1000,
        volume: 60,
        packingItems: [{
          id: 'pk-1',
          boxes: 1,
          quantity: 1,
          volume: 60,
          length: 13000,
          width: 1000,
          height: 1000,
          product: { customsName: '超长货物' },
        }],
      }),
      update: async () => {
        throw new Error('不应更新');
      },
    },
  });
  inventorySnapshot.applySalesOutStock = async () => {
    outStockCalled = true;
    return { results: [] };
  };

  try {
    await assert.rejects(
      () => salesService.updateSalesStatus('sc-1', 'SHIPPED'),
      (error) => error.statusCode === 400 && /仍有 1 箱无法装入/.test(error.message),
    );
    assert.equal(outStockCalled, false);
  } finally {
    prisma.$transaction = originalTransaction;
    inventorySnapshot.applySalesOutStock = originalApplySalesOutStock;
  }
});

test('calculateSellingPrice: 输入非法时抛错，合法时返回四种结果', () => {
  assert.throws(
    () => salesService.calculateSellingPrice({ costPrice: 100, exchangeRate: 0 }),
    (error) => error.statusCode === 400 && error.message === 'exchangeRate 必须大于0',
  );

  const result = salesService.calculateSellingPrice({
    costPrice: 130,
    exchangeRate: 10,
    profitRate: 1.3,
  });

  assert.deepEqual(result, {
    exact: '16.90',
    roundedUp: 17,
    roundedDown: 16,
    recommended: 17,
  });
});

test('addPackingItem: 计算 totalPrice 并回写货柜统计', async () => {
  const originalCreate = prisma.packingItem.create;
  const originalAggregate = prisma.packingItem.aggregate;
  const originalUpdate = prisma.salesContract.update;
  let createArgs = null;
  let updateArgs = null;

  prisma.packingItem.create = async (args) => {
    createArgs = args;
    return { id: 'pk-1', ...args.data };
  };
  prisma.packingItem.aggregate = async () => ({
    _sum: { boxes: 2, grossWeight: 5, netWeight: 4, volume: 1.2, totalPrice: 80 },
  });
  prisma.salesContract.update = async (args) => {
    updateArgs = args;
    return { id: 'sc-1' };
  };

  try {
    await salesService.addPackingItem('sc-1', {
      productId: 'p-1',
      quantity: 4,
      unitPrice: 20,
    });

    assert.equal(createArgs.data.totalPrice, 80);
    assert.deepEqual(updateArgs, {
      where: { id: 'sc-1' },
      data: {
        totalBoxes: 2,
        grossWeight: 5,
        netWeight: 4,
        volume: 1.2,
        totalAmount: 80,
      },
    });
  } finally {
    prisma.packingItem.create = originalCreate;
    prisma.packingItem.aggregate = originalAggregate;
    prisma.salesContract.update = originalUpdate;
  }
});
