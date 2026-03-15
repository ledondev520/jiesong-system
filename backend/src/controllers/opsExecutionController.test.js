/**
 * Input: opsExecutionController、prisma
 * Output: 经营执行中台控制器测试
 * Pos: 验证未发货聚合与负责人分发逻辑
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const controller = require('./opsExecutionController');

const createMockRes = () => {
  const res = {
    statusCode: null,
    payload: null,
  };

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (payload) => {
    res.payload = payload;
    return res;
  };

  return res;
};

test('getUnshippedList: 聚合未出库库存并合并负责人', async () => {
  const originalInventoryFindMany = prisma.inventory.findMany;
  const originalSystemConfigFindUnique = prisma.systemConfig.findUnique;

  prisma.inventory.findMany = async () => ([
    {
      id: 'inv-1',
      salesContractId: 'sales-1',
      productId: 'prod-1',
      quantity: 10,
      status: 'PACKING',
      updatedAt: new Date('2026-03-15T10:00:00.000Z'),
      product: { id: 'prod-1', customsName: '餐桌', hsCode: '9403609990', unit: '件' },
      salesContract: { id: 'sales-1', contractNo: 'EXP001', status: 'PACKING' },
    },
    {
      id: 'inv-2',
      salesContractId: 'sales-1',
      productId: 'prod-1',
      quantity: 5,
      status: 'PACKING',
      updatedAt: new Date('2026-03-15T11:00:00.000Z'),
      product: { id: 'prod-1', customsName: '餐桌', hsCode: '9403609990', unit: '件' },
      salesContract: { id: 'sales-1', contractNo: 'EXP001', status: 'PACKING' },
    },
    {
      id: 'inv-3',
      salesContractId: 'sales-2',
      productId: 'prod-2',
      quantity: 3,
      status: 'INBOUND',
      updatedAt: new Date('2026-03-15T09:00:00.000Z'),
      product: { id: 'prod-2', customsName: '餐椅', hsCode: '9401719000', unit: '件' },
      salesContract: { id: 'sales-2', contractNo: 'EXP002', status: 'SHIPPED' },
    },
  ]);

  prisma.systemConfig.findUnique = async () => ({
    key: 'ops_execution_unshipped_assignments',
    value: JSON.stringify({
      'sales-1:prod-1:PACKING': {
        assigneeName: '小周',
        updatedAt: '2026-03-15T12:00:00.000Z',
      },
    }),
  });

  try {
    const req = { query: { page: '1', pageSize: '20' } };
    const res = createMockRes();
    let capturedError = null;

    await controller.getUnshippedList(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.items.length, 2);
    assert.equal(res.payload.data.summary.totalItems, 2);
    assert.equal(res.payload.data.summary.unassignedItems, 1);

    const assignedItem = res.payload.data.items.find((item) => item.key === 'sales-1:prod-1:PACKING');
    assert.deepEqual(assignedItem, {
      key: 'sales-1:prod-1:PACKING',
      salesContractId: 'sales-1',
      orderNo: 'EXP001',
      productId: 'prod-1',
      skuName: '餐桌',
      skuCode: '9403609990',
      status: 'PACKING',
      quantity: 15,
      unit: '件',
      recordCount: 2,
      assigneeName: '小周',
      assigneeUpdatedAt: '2026-03-15T12:00:00.000Z',
      latestUpdatedAt: '2026-03-15T11:00:00.000Z',
    });
  } finally {
    prisma.inventory.findMany = originalInventoryFindMany;
    prisma.systemConfig.findUnique = originalSystemConfigFindUnique;
  }
});

test('assignUnshippedAssignee: 写入负责人映射到 system config', async () => {
  const originalSystemConfigFindUnique = prisma.systemConfig.findUnique;
  const originalSystemConfigUpsert = prisma.systemConfig.upsert;
  let capturedUpsertArgs = null;

  prisma.systemConfig.findUnique = async () => ({
    key: 'ops_execution_unshipped_assignments',
    value: JSON.stringify({
      'sales-1:prod-1:PACKING': {
        assigneeName: '旧负责人',
        updatedAt: '2026-03-15T09:00:00.000Z',
      },
    }),
  });
  prisma.systemConfig.upsert = async (args) => {
    capturedUpsertArgs = args;
    return args.update;
  };

  try {
    const req = {
      body: {
        salesContractId: 'sales-2',
        productId: 'prod-2',
        status: 'INBOUND',
        assigneeName: '小周',
      },
    };
    const res = createMockRes();
    let capturedError = null;

    await controller.assignUnshippedAssignee(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.key, 'sales-2:prod-2:INBOUND');
    assert.equal(res.payload.data.assigneeName, '小周');
    assert.ok(capturedUpsertArgs);

    const storedPayload = JSON.parse(capturedUpsertArgs.update.value);
    assert.equal(storedPayload['sales-1:prod-1:PACKING'].assigneeName, '旧负责人');
    assert.equal(storedPayload['sales-2:prod-2:INBOUND'].assigneeName, '小周');
  } finally {
    prisma.systemConfig.findUnique = originalSystemConfigFindUnique;
    prisma.systemConfig.upsert = originalSystemConfigUpsert;
  }
});

test('assignUnshippedAssignee: 缺少关键字段时返回 400', async () => {
  const req = {
    body: {
      salesContractId: 'sales-2',
      productId: 'prod-2',
      assigneeName: '',
    },
  };
  const res = createMockRes();
  let capturedError = null;

  await controller.assignUnshippedAssignee(req, res, (error) => {
    capturedError = error;
  });

  assert.ok(capturedError);
  assert.equal(capturedError.statusCode, 400);
  assert.equal(capturedError.message, 'salesContractId、productId、status、assigneeName 不能为空');
});

test('generatePurchaseChecklist: 按店型和开店阶段返回模板清单', async () => {
  const req = {
    body: {
      storeType: '标准店',
      openingStage: '筹备期',
    },
  };
  const res = createMockRes();
  let capturedError = null;

  await controller.generatePurchaseChecklist(req, res, (error) => {
    capturedError = error;
  });

  assert.equal(capturedError, null);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.storeType, '标准店');
  assert.equal(res.payload.data.openingStage, '筹备期');
  assert.ok(Array.isArray(res.payload.data.items));
  assert.ok(res.payload.data.items.length > 0);
  assert.equal(typeof res.payload.data.summary.requiredCount, 'number');
});

test('createTask: 支持自然语言创建任务并解析提醒时间', async () => {
  const originalSystemConfigFindUnique = prisma.systemConfig.findUnique;
  const originalSystemConfigUpsert = prisma.systemConfig.upsert;
  let capturedUpsertArgs = null;

  prisma.systemConfig.findUnique = async () => null;
  prisma.systemConfig.upsert = async (args) => {
    capturedUpsertArgs = args;
    return args.create;
  };

  try {
    const req = {
      body: {
        naturalLanguageInput: '提醒小周明天10点跟进EXP001未发货，高优先级',
      },
    };
    const res = createMockRes();
    let capturedError = null;

    await controller.createTask(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.assigneeName, '小周');
    assert.equal(res.payload.data.priority, 'HIGH');
    assert.match(res.payload.data.title, /EXP001未发货/);
    assert.ok(res.payload.data.remindAt);
    assert.ok(res.payload.data.secondRemindAt);

    const storedTasks = JSON.parse(capturedUpsertArgs.create.value);
    assert.equal(storedTasks.length, 1);
    assert.equal(storedTasks[0].sourceText, '提醒小周明天10点跟进EXP001未发货，高优先级');
  } finally {
    prisma.systemConfig.findUnique = originalSystemConfigFindUnique;
    prisma.systemConfig.upsert = originalSystemConfigUpsert;
  }
});
