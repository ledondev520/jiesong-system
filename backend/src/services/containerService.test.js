/**
 * Input: containerService、prisma
 * Output: 货柜服务关键路径测试（筛选/创建/状态/装箱明细）
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const containerService = require('./containerService');

// 单元测试只运行合成事务桩；真实事务/SQLite 的一致性由 sales-cargo-lifecycle.integration.js 验证。
const baseTransaction = prisma.$transaction;
const baseSalesFindUnique = prisma.salesContract.findUnique;
test.beforeEach(() => {
  prisma.$transaction = async callback => callback(prisma);
  prisma.salesContract.findUnique = async () => ({ id: 'sc-1', status: 'DRAFT', inventories: [] });
});
test.afterEach(() => {
  prisma.$transaction = baseTransaction;
  prisma.salesContract.findUnique = baseSalesFindUnique;
});

test('list: 组装筛选条件并返回合同号字段', async () => {
  const originalFindMany = prisma.salesContract.findMany;
  const originalCount = prisma.salesContract.count;
  let findManyArgs = null;

  prisma.salesContract.findMany = async (args) => {
    findManyArgs = args;
    return [{ id: 'c-1', contractNo: '25-001-LA' }];
  };
  prisma.salesContract.count = async () => 1;

  try {
    const result = await containerService.list({
      page: 2,
      pageSize: 10,
      status: 'DRAFT',
      portId: 'port-1',
      keyword: '25-001',
    });

    assert.deepEqual(findManyArgs.where, {
      status: 'DRAFT',
      portId: 'port-1',
      contractNo: { contains: '25-001' },
    });
    assert.equal(findManyArgs.skip, 10);
    assert.equal(findManyArgs.take, 10);
    assert.equal(result.total, 1);
    assert.equal(result.items[0].contractNo, '25-001-LA');
  } finally {
    prisma.salesContract.findMany = originalFindMany;
    prisma.salesContract.count = originalCount;
  }
});

test('getById: 货柜不存在时抛出404', async () => {
  const originalFindUnique = prisma.salesContract.findUnique;
  prisma.salesContract.findUnique = async () => null;

  try {
    await assert.rejects(
      () => containerService.getById('missing-id'),
      (error) => error.statusCode === 404 && error.message === '货柜不存在',
    );
  } finally {
    prisma.salesContract.findUnique = originalFindUnique;
  }
});

test('addItem: 计算 totalPrice 并回写货柜统计', async () => {
  const originalCreate = prisma.packingItem.create;
  const originalAggregate = prisma.packingItem.aggregate;
  const originalUpdate = prisma.salesContract.update;
  let createArgs = null;
  let updateArgs = null;

  prisma.packingItem.create = async (args) => {
    createArgs = args;
    return { id: 'item-1', ...args.data, product: { id: 'p-1' } };
  };
  prisma.packingItem.aggregate = async () => ({
    _sum: { boxes: 3, grossWeight: 20, netWeight: 18, volume: 2.5, totalPrice: 100 },
  });
  prisma.salesContract.update = async (args) => {
    updateArgs = args;
    return { id: 'sc-1', contractNo: '25-001-LA' };
  };

  try {
    await containerService.addItem('sc-1', {
      productId: 'p-1',
      storeId: 's-1',
      quantity: '2',
      unitPrice: '10',
      unit: '件',
    });

    assert.equal(createArgs.data.quantity, 2);
    assert.equal(createArgs.data.unitPrice, 10);
    assert.equal(createArgs.data.totalPrice, 20);
    assert.deepEqual(updateArgs, {
      where: { id: 'sc-1' },
      data: {
        totalBoxes: 3,
        grossWeight: 20,
        netWeight: 18,
        volume: 2.5,
        totalAmount: 100,
      },
    });
  } finally {
    prisma.packingItem.create = originalCreate;
    prisma.packingItem.aggregate = originalAggregate;
    prisma.salesContract.update = originalUpdate;
  }
});

test('updateItem: 装箱明细不存在时抛出404', async () => {
  const originalFindUnique = prisma.packingItem.findFirst;
  prisma.packingItem.findFirst = async () => null;

  try {
    await assert.rejects(
      () => containerService.updateItem('sc-1', 'missing-item', { quantity: 1 }),
      (error) => error.statusCode === 404 && error.message === '装箱明细不存在',
    );
  } finally {
    prisma.packingItem.findFirst = originalFindUnique;
  }
});

test('updateItem: 更新数量和单价时重算 totalPrice', async () => {
  const originalFindUnique = prisma.packingItem.findFirst;
  const originalUpdate = prisma.packingItem.update;
  const originalAggregate = prisma.packingItem.aggregate;
  const originalContractUpdate = prisma.salesContract.update;
  let updateArgs = null;

  prisma.packingItem.findFirst = async () => ({ quantity: 3, unitPrice: 6 });
  prisma.packingItem.update = async (args) => {
    updateArgs = args;
    return { id: 'item-1', ...args.data, product: { id: 'p-1' } };
  };
  prisma.packingItem.aggregate = async () => ({
    _sum: { boxes: 4, grossWeight: 30, netWeight: 28, volume: 3.1, totalPrice: 120 },
  });
  prisma.salesContract.update = async () => ({ id: 'sc-1' });

  try {
    await containerService.updateItem('sc-1', 'item-1', {
      quantity: '4',
      unitPrice: '5',
      unit: '件',
    });

    assert.equal(updateArgs.data.quantity, 4);
    assert.equal(updateArgs.data.unitPrice, 5);
    assert.equal(updateArgs.data.totalPrice, 20);
    assert.equal(updateArgs.data.unit, '件');
  } finally {
    prisma.packingItem.findFirst = originalFindUnique;
    prisma.packingItem.update = originalUpdate;
    prisma.packingItem.aggregate = originalAggregate;
    prisma.salesContract.update = originalContractUpdate;
  }
});

test('updateStatus: SHIPPED 状态会写入 shippedAt', async () => {
  const originalUpdate = prisma.salesContract.update;
  let updateArgs = null;

  prisma.salesContract.update = async (args) => {
    updateArgs = args;
    return { id: 'sc-1', contractNo: '25-001-LA', status: 'SHIPPED' };
  };

  try {
    const result = await containerService.updateStatus('sc-1', 'SHIPPED');

    assert.equal(updateArgs.data.status, 'SHIPPED');
    assert.ok(updateArgs.data.shippedAt instanceof Date);
    assert.equal(result.contractNo, '25-001-LA');
  } finally {
    prisma.salesContract.update = originalUpdate;
  }
});

test('getVisualization: 货柜不存在时抛出404', async () => {
  const originalFindUnique = prisma.salesContract.findUnique;
  prisma.salesContract.findUnique = async () => null;

  try {
    await assert.rejects(
      () => containerService.getVisualization('missing-id'),
      (error) => error.statusCode === 404 && error.message === '货柜不存在',
    );
  } finally {
    prisma.salesContract.findUnique = originalFindUnique;
  }
});

test('getVisualization: 返回布局、重量体积汇总和ASCII图', async () => {
  const originalFindUnique = prisma.salesContract.findUnique;

  prisma.salesContract.findUnique = async () => ({
    id: 'sc-1',
    contractNo: '26-001-LA',
    status: 'PACKING',
    totalBoxes: 11,
    grossWeight: 560,
    netWeight: 485,
    volume: 7.5,
    port: { id: 'port-1', name: 'Los Angeles', code: 'LA' },
    packingItems: [
      {
        id: 'pi-1',
        quantity: 2,
        boxes: 5,
        grossWeight: 400,
        netWeight: 350,
        volume: 4,
        length: 7000,
        width: 1200,
        height: 1200,
        note: 'front',
        product: { id: 'p-1', name: 'Apple', hsCode: '0808', unit: 'box' },
        store: { id: 's-1', name: 'Store 1' },
      },
      {
        id: 'pi-2',
        quantity: 3,
        boxes: 4,
        grossWeight: null,
        netWeight: null,
        volume: null,
        length: null,
        width: null,
        height: null,
        product: {
          id: 'p-2',
          name: 'Banana',
          hsCode: '0803',
          unit: 'box',
          length: 6000,
          width: 1200,
          height: 800,
          grossWeight: 20,
          netWeight: 15,
          volume: 0.5,
        },
        store: { id: 's-2', name: 'Store 2' },
      },
      {
        id: 'pi-3',
        quantity: 1,
        boxes: 2,
        grossWeight: 100,
        netWeight: 90,
        volume: 2,
        length: 7000,
        width: 1000,
        height: 2000,
        product: { id: 'p-3', name: 'Cherry', hsCode: '0809', unit: 'box' },
        store: null,
      },
    ],
  });

  try {
    const result = await containerService.getVisualization('sc-1');

    assert.equal(result.container.contractNo, '26-001-LA');
    assert.equal(result.layout.length, 3);
    assert.equal(result.layout[0].positionMm.x, 0);
    assert.equal(result.layout[1].positionMm.z, 1200);
    assert.equal(result.layout[2].overflow, true);
    assert.equal(result.layout[2].positionMm.x, null);

    assert.equal(result.summary.itemCount, 3);
    assert.equal(result.summary.overflowItemCount, 1);
    assert.equal(result.summary.totalBoxes, 11);
    assert.equal(result.summary.totalGrossWeight, 560);
    assert.equal(result.summary.totalNetWeight, 485);
    assert.equal(result.summary.totalVolume, 7.5);
    assert.ok(result.summary.volumeUtilizationRate > 9);
    assert.ok(result.summary.volumeUtilizationRate < 10);

    assert.ok(result.asciiArt.includes('Legend (3):'));
    assert.ok(result.asciiArt.includes('A=Apple'));
    assert.ok(result.asciiArt.includes('C=Cherry qty:1 boxes:2 [OVERFLOW]'));
  } finally {
    prisma.salesContract.findUnique = originalFindUnique;
  }
});
