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
