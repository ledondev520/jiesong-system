/**
 * Input: containerService、prisma
 * Output: 货柜服务关键路径测试（筛选/创建/状态/装箱明细）
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const containerService = require('./containerService');

test('list: 组装筛选条件并返回 containerNo 映射', async () => {
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
      status: 'PENDING',
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
    assert.equal(result.items[0].containerNo, '25-001-LA');
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
  const originalFindUnique = prisma.packingItem.findUnique;
  prisma.packingItem.findUnique = async () => null;

  try {
    await assert.rejects(
      () => containerService.updateItem('sc-1', 'missing-item', { quantity: 1 }),
      (error) => error.statusCode === 404 && error.message === '装箱明细不存在',
    );
  } finally {
    prisma.packingItem.findUnique = originalFindUnique;
  }
});

test('updateItem: 更新数量和单价时重算 totalPrice', async () => {
  const originalFindUnique = prisma.packingItem.findUnique;
  const originalUpdate = prisma.packingItem.update;
  const originalAggregate = prisma.packingItem.aggregate;
  const originalContractUpdate = prisma.salesContract.update;
  let updateArgs = null;

  prisma.packingItem.findUnique = async () => ({ quantity: 3, unitPrice: 6 });
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
    prisma.packingItem.findUnique = originalFindUnique;
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
    assert.equal(result.containerNo, '25-001-LA');
  } finally {
    prisma.salesContract.update = originalUpdate;
  }
});
