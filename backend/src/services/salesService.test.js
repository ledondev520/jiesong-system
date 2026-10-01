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

test('登记到港后保留出库，已收齐合同自动完成；未收齐不能手动假结清', async () => {
  const originalTransaction = prisma.$transaction;
  const originalRevert = inventorySnapshot.revertSalesOutStock;
  let receivedAmount = 100;
  let currentStatus = 'SHIPPED';
  let reverted = false;
  prisma.$transaction = async fn => fn({ salesContract: {
    findUnique: async () => ({ id: 'sc-1', status: currentStatus, totalAmount: 100, receivedAmount, packingItems: [] }),
    update: async ({ data }) => ({ id: 'sc-1', ...data }),
  } });
  inventorySnapshot.revertSalesOutStock = async () => { reverted = true; return { reverted: 1 }; };
  try {
    assert.equal((await salesService.updateSalesStatus('sc-1', 'ARRIVED')).status, 'COMPLETED');
    assert.equal(reverted, false);
    receivedAmount = 50;
    assert.equal((await salesService.updateSalesStatus('sc-1', 'ARRIVED')).status, 'ARRIVED');
    currentStatus = 'ARRIVED';
    await assert.rejects(salesService.updateSalesStatus('sc-1', 'COMPLETED'), /款项尚未结清/);
  } finally { prisma.$transaction = originalTransaction; inventorySnapshot.revertSalesOutStock = originalRevert; }
});

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
      OR: [
        { contractNo: { contains: 'EXP' } },
        { port: { is: { name: { contains: 'EXP' } } } },
        { packingItems: { some: { store: { is: { name: { contains: 'EXP' } } } } } },
        { items: { some: { store: { is: { name: { contains: 'EXP' } } } } } },
      ],
    });
    assert.equal(findManyArgs.skip, 10);
    assert.equal(findManyArgs.take, 5);
    assert.deepEqual(findManyArgs.include.packingItems, {
      select: {
        isOwnedByJiesong: true,
        sourceParty: true,
        store: { select: { id: true, name: true } },
      },
    });
    assert.equal(result.total, 1);
    assert.equal(result.contracts.length, 1);
    assert.deepEqual(result.contracts[0].stores, ['圣荷西2115', '禧瑞都']);
    assert.equal(result.contracts[0].hasThirdPartyCargo, true);
    assert.deepEqual(result.contracts[0].sourceParties, ['阿珍贵州']);
    assert.equal(result.contracts[0].packingItems, undefined);

    const liteResult = await salesService.getSalesContracts({ page: 1, pageSize: 20, lite: true });
    assert.ok(findManyArgs.include.packingItems.select);
    assert.deepEqual(liteResult.contracts, result.contracts);
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

test('getAvailablePurchaseItems: 只返回已完工且仍有未排箱数的采购明细', async () => {
  const originalSalesFindUnique = prisma.salesContract.findUnique;
  const originalPurchaseFindMany = prisma.purchaseItem.findMany;
  prisma.salesContract.findUnique = async () => ({ id: 'sc-1' });
  prisma.purchaseItem.findMany = async () => [{
    id: 'pi-1',
    quantity: 100,
    unit: '件',
    totalPrice: 1130,
    specification: '标准箱',
    boxes: 10,
    grossWeight: 1000,
    netWeight: 950,
    volume: 5,
    length: 500,
    width: 400,
    height: 300,
    product: { id: 'p-1', customsName: '测试商品' },
    purchaseContract: {
      id: 'pc-1',
      contractNo: 'CG260001',
      status: 'READY',
      supplier: { id: 'supplier-1', name: '测试供应商' },
    },
    packingItems: [{ boxes: 4, quantity: 40, grossWeight: 400, netWeight: 380, volume: 2 }],
  }];

  try {
    const result = await salesService.getAvailablePurchaseItems('sc-1');
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].remaining, {
      boxes: 6,
      quantity: 60,
      grossWeight: 600,
      netWeight: 570,
      volume: 3,
    });
    assert.equal(result[0].totalPrice, undefined);
    assert.equal(result[0].unitPrice, undefined);
  } finally {
    prisma.salesContract.findUnique = originalSalesFindUnique;
    prisma.purchaseItem.findMany = originalPurchaseFindMany;
  }
});

test('importPurchasePackingItems: 按选中箱数同比例带入数量、重量、体积和采购成本', async () => {
  const originalTransaction = prisma.$transaction;
  const createdRows = [];
  let updatedStats = null;
  const source = {
    id: 'pi-1',
    productId: 'p-1',
    quantity: 100,
    unit: '件',
    totalPrice: 1130,
    specification: '标准箱',
    boxes: 10,
    grossWeight: 1000,
    netWeight: 950,
    volume: 5,
    length: 500,
    width: 400,
    height: 300,
    purchaseContract: {
      contractNo: 'CG260001',
      status: 'READY',
      supplier: { name: '测试供应商' },
    },
    packingItems: [],
  };
  prisma.$transaction = async (callback) => callback({
    salesContract: {
      findUnique: async () => ({ id: 'sc-1', status: 'CONFIRMED' }),
      update: async (args) => {
        updatedStats = args.data;
        return args.data;
      },
    },
    purchaseItem: {
      findMany: async () => [source],
    },
    packingItem: {
      create: async (args) => {
        createdRows.push(args.data);
        return { id: 'pk-1', ...args.data };
      },
      aggregate: async () => ({
        _sum: { boxes: 4, grossWeight: 400, netWeight: 380, volume: 2, totalPrice: null },
      }),
    },
  });

  try {
    const result = await salesService.importPurchasePackingItems('sc-1', [{
      purchaseItemId: 'pi-1',
      boxes: 4,
    }]);

    assert.equal(result.importedCount, 1);
    assert.deepEqual(createdRows[0], {
      salesContractId: 'sc-1',
      purchaseItemId: 'pi-1',
      productId: 'p-1',
      quantity: 40,
      unit: '件',
      boxes: 4,
      grossWeight: 400,
      netWeight: 380,
      volume: 2,
      unitPrice: null,
      totalPrice: null,
      specification: '标准箱',
      manufacturer: '测试供应商',
      purchaseContractNo: 'CG260001',
      purchaseCost: 452,
      length: 500,
      width: 400,
      height: 300,
      isOwnedByJiesong: true,
      note: '从采购合同 CG260001 完工资料导入',
    });
    assert.deepEqual(updatedStats, {
      status: 'PACKING',
      totalBoxes: 4,
      grossWeight: 400,
      netWeight: 380,
      volume: 2,
      totalAmount: 0,
    });
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

test('updatePackingItem: 采购来源行的箱数和货物资料不可绕过导入剩余量直接修改', async () => {
  const originalFindFirst = prisma.packingItem.findFirst;
  const originalUpdate = prisma.packingItem.update;
  const originalAggregate = prisma.packingItem.aggregate;
  const originalSalesUpdate = prisma.salesContract.update;
  let updateCalled = false;

  prisma.packingItem.findFirst = async () => ({
    id: 'pk-imported',
    salesContractId: 'sc-1',
    purchaseItemId: 'pi-1',
    quantity: 40,
    boxes: 4,
    grossWeight: 400,
    netWeight: 380,
    volume: 2,
    length: 500,
    width: 400,
    height: 300,
  });
  prisma.packingItem.update = async () => {
    updateCalled = true;
    return { id: 'pk-imported' };
  };
  prisma.packingItem.aggregate = async () => ({ _sum: {} });
  prisma.salesContract.update = async () => ({ id: 'sc-1' });

  try {
    await assert.rejects(
      () => salesService.updatePackingItem('sc-1', 'pk-imported', {
        quantity: 40,
        boxes: 5,
        grossWeight: 400,
        netWeight: 380,
        volume: 2,
        length: 500,
        width: 400,
        height: 300,
        unitPrice: 12,
      }),
      (error) => error.statusCode === 400 && /删除后重新按箱数导入/.test(error.message),
    );
    assert.equal(updateCalled, false);
  } finally {
    prisma.packingItem.findFirst = originalFindFirst;
    prisma.packingItem.update = originalUpdate;
    prisma.packingItem.aggregate = originalAggregate;
    prisma.salesContract.update = originalSalesUpdate;
  }
});

test('removePackingItem: 不能通过其他出口合同编号删除不属于当前合同的装箱行', async () => {
  const originalFindFirst = prisma.packingItem.findFirst;
  const originalDelete = prisma.packingItem.delete;
  const originalAggregate = prisma.packingItem.aggregate;
  const originalSalesUpdate = prisma.salesContract.update;
  let deleteCalled = false;

  prisma.packingItem.findFirst = async () => null;
  prisma.packingItem.delete = async () => {
    deleteCalled = true;
  };
  prisma.packingItem.aggregate = async () => ({ _sum: {} });
  prisma.salesContract.update = async () => ({ id: 'sc-1' });

  try {
    await assert.rejects(
      () => salesService.removePackingItem('sc-other', 'pk-1'),
      (error) => error.statusCode === 404 && /装箱明细不存在/.test(error.message),
    );
    assert.equal(deleteCalled, false);
  } finally {
    prisma.packingItem.findFirst = originalFindFirst;
    prisma.packingItem.delete = originalDelete;
    prisma.packingItem.aggregate = originalAggregate;
    prisma.salesContract.update = originalSalesUpdate;
  }
});

test('经营钻取按上海发运日期过滤三种已发运状态，搜索港口/门店覆盖第101条', async () => {
  const originalFindMany = prisma.salesContract.findMany;
  const originalCount = prisma.salesContract.count;
  let args; let countWhere;
  prisma.salesContract.findMany = async (value) => { args = value; return [{ id: 'sale-101', contractNo: 'SYNTHETIC101', status: 'SHIPPED', packingItems: [] }]; };
  prisma.salesContract.count = async ({ where }) => { countWhere = where; return 121; };
  try {
    const result = await salesService.getSalesContracts({ page: 6, pageSize: 20, shipped: true, shippedFrom: '2026-09-01', shippedTo: '2026-09-30', keyword: '目标港口' });
    assert.equal(args.skip, 100); assert.equal(args.take, 20);
    assert.deepEqual(args.where.status, { in: ['SHIPPED', 'ARRIVED', 'COMPLETED'] });
    assert.equal(args.where.shippedAt.gte.toISOString(), '2026-08-31T16:00:00.000Z');
    assert.equal(args.where.shippedAt.lte.toISOString(), '2026-09-30T15:59:59.999Z');
    assert.ok(args.where.OR.some((item) => item.port?.is?.name?.contains === '目标港口'));
    assert.ok(args.where.OR.some((item) => item.packingItems?.some?.store?.is?.name?.contains === '目标港口'));
    assert.deepEqual(countWhere, args.where); assert.equal(result.total, 121);
    assert.equal(result.contracts[0].id, 'sale-101');
    await salesService.getSalesContracts({ page: 1, pageSize: 20, status: 'SHIPPED' });
    assert.equal(args.where.status, 'SHIPPED');
    await assert.rejects(salesService.getSalesContracts({ page: 1, pageSize: 20, shippedFrom: '2026-02-30' }), (error) => error.statusCode === 400);
    await assert.rejects(salesService.getSalesContracts({ page: 1, pageSize: 20, shippedFrom: '2026-10-01', shippedTo: '2026-09-30' }), /不能晚于/);
  } finally { prisma.salesContract.findMany = originalFindMany; prisma.salesContract.count = originalCount; }
});
