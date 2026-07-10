/**
 * Input: purchaseController 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const purchaseController = require('./purchaseController');

test('purchaseController: 模块可正常加载并导出', () => {
  assert.ok(purchaseController !== undefined);
});

test('getById: 返回与状态门禁共用的生产资料完整性', async () => {
  const originalFindUnique = prisma.purchaseContract.findUnique;
  prisma.purchaseContract.findUnique = async () => ({
    id: 'pc-1',
    items: [{
      id: 'pi-1',
      specification: '',
      boxes: null,
      grossWeight: null,
      netWeight: null,
      volume: null,
    }],
  });
  let payload = null;
  const res = {
    status: () => res,
    json: (value) => { payload = value; },
  };

  try {
    await purchaseController.getById({ params: { id: 'pc-1' } }, res, (error) => { throw error; });
    assert.equal(payload.data.productionReadiness.ready, false);
    assert.equal(payload.data.productionReadiness.incompleteItemCount, 1);
  } finally {
    prisma.purchaseContract.findUnique = originalFindUnique;
  }
});

test('updateStatus: 生产资料缺失时后端拒绝从生产中推进到完成', async () => {
  const originalTransaction = prisma.$transaction;
  let updateCalled = false;
  prisma.$transaction = async (callback) => callback({
    purchaseContract: {
      findUnique: async () => ({
        id: 'pc-1',
        status: 'PRODUCING',
        items: [{
          id: 'pi-1',
          specification: '',
          boxes: null,
          grossWeight: null,
          netWeight: null,
          volume: null,
          length: null,
          width: null,
          height: null,
        }],
      }),
      update: async () => {
        updateCalled = true;
        return { id: 'pc-1' };
      },
    },
  });
  let caught = null;

  try {
    await purchaseController.updateStatus(
      { params: { id: 'pc-1' }, body: { status: 'READY' }, user: { id: 'u-1' } },
      {},
      (error) => { caught = error; },
    );
    assert.equal(caught.statusCode, 400);
    assert.match(caught.message, /生产资料未完整/);
    assert.equal(updateCalled, false);
  } finally {
    prisma.$transaction = originalTransaction;
  }
});
