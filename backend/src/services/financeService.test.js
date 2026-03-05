/**
 * Input: financeService、prisma
 * Output: 财务服务关键路径测试（幂等创建与金额回写）
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const financeService = require('./financeService');

test('createPayment: 幂等键命中时直接返回历史记录', async () => {
  const originalFindUnique = prisma.payment.findUnique;
  const originalTransaction = prisma.$transaction;
  let transactionCalled = false;

  prisma.payment.findUnique = async () => ({ id: 'pay-1', amount: 100, idempotencyKey: 'idem-1' });
  prisma.$transaction = async () => {
    transactionCalled = true;
    throw new Error('should not call transaction');
  };

  try {
    const result = await financeService.createPayment(
      { type: 'PAYABLE', amount: 100, paymentDate: '2026-03-05' },
      { idempotencyKey: ' idem-1 ' },
    );

    assert.equal(result.reused, true);
    assert.equal(result.payment.id, 'pay-1');
    assert.equal(transactionCalled, false);
  } finally {
    prisma.payment.findUnique = originalFindUnique;
    prisma.$transaction = originalTransaction;
  }
});

test('createPayment: 新建付款并回写采购已付金额', async () => {
  const originalFindUnique = prisma.payment.findUnique;
  const originalTransaction = prisma.$transaction;
  let createArgs = null;
  let aggregateArgs = null;
  let purchaseUpdateArgs = null;

  prisma.payment.findUnique = async () => null;
  prisma.$transaction = async (callback) => callback({
    payment: {
      create: async (args) => {
        createArgs = args;
        return { id: 'pay-2', ...args.data };
      },
      aggregate: async (args) => {
        aggregateArgs = args;
        return { _sum: { amount: 888 } };
      },
    },
    purchaseContract: {
      update: async (args) => {
        purchaseUpdateArgs = args;
        return { id: args.where.id };
      },
    },
    salesContract: {
      update: async () => {
        throw new Error('sales update should not be called');
      },
    },
  });

  try {
    const result = await financeService.createPayment(
      {
        type: 'PAYABLE',
        purchaseContractId: 'pc-1',
        amount: 888,
        currency: 'CNY',
        paymentDate: '2026-03-05',
      },
      { idempotencyKey: 'idem-2' },
    );

    assert.equal(result.reused, false);
    assert.equal(createArgs.data.idempotencyKey, 'idem-2');
    assert.deepEqual(aggregateArgs.where, { purchaseContractId: 'pc-1' });
    assert.deepEqual(purchaseUpdateArgs, {
      where: { id: 'pc-1' },
      data: { paidAmount: 888 },
    });
  } finally {
    prisma.payment.findUnique = originalFindUnique;
    prisma.$transaction = originalTransaction;
  }
});

test('createPayment: 并发唯一键冲突时返回已创建记录', async () => {
  const originalFindUnique = prisma.payment.findUnique;
  const originalTransaction = prisma.$transaction;
  let findUniqueCalls = 0;

  prisma.payment.findUnique = async () => {
    findUniqueCalls += 1;
    if (findUniqueCalls === 1) {
      return null;
    }
    return { id: 'pay-3', amount: 200, idempotencyKey: 'idem-race' };
  };
  prisma.$transaction = async () => {
    const error = new Error('unique constraint conflict');
    error.code = 'P2002';
    throw error;
  };

  try {
    const result = await financeService.createPayment(
      { type: 'PAYABLE', amount: 200, paymentDate: '2026-03-05' },
      { idempotencyKey: 'idem-race' },
    );

    assert.equal(result.reused, true);
    assert.equal(result.payment.id, 'pay-3');
    assert.equal(findUniqueCalls, 2);
  } finally {
    prisma.payment.findUnique = originalFindUnique;
    prisma.$transaction = originalTransaction;
  }
});
