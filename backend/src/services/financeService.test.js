/**
 * Input: financeService、prisma
 * Output: 财务服务关键路径测试（幂等创建与金额回写）
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const financeService = require('./financeService');

test('收付款记录自动结清已收货/已到港合同，金额差异重新打开待结清且不改物理状态', async (t) => {
  const cases = [
    ['purchase', 'RECEIVED', 100, 'COMPLETED'], ['purchase', 'RECEIVED', 50, 'RECEIVED'],
    ['purchase', 'SIGNED', 100, 'SIGNED'], ['purchase', 'COMPLETED', 90, 'RECEIVED'],
    ['sales', 'ARRIVED', 100, 'COMPLETED'], ['sales', 'SHIPPED', 100, 'SHIPPED'],
    ['sales', 'COMPLETED', 110, 'ARRIVED'], 
  ];
  for (const [kind, initialStatus, amount, expected] of cases) {
    let status = initialStatus;
    const model = { findUnique: async () => ({ status: 'SIGNED' }), update: async ({ data }) => { status = data.status || status; return { status, totalAmount: 100, ...data }; } };
    t.mock.method(prisma, '$transaction', async fn => fn({
      payment: { create: async ({ data }) => ({ id: 'test-payment', ...data }), aggregate: async () => ({ _sum: { amount } }) },
      purchaseContract: model, salesContract: model,
    }));
    await financeService.createPayment({ type: kind === 'purchase' ? 'PAYABLE_PAYMENT' : 'RECEIVABLE_COLLECTION',
      [kind === 'purchase' ? 'purchaseContractId' : 'salesContractId']: 'test-contract', amount, currency: kind === 'purchase' ? 'CNY' : 'USD', paymentDate: '2026-10-01' });
    assert.equal(status, expected);
  }
});

test('createPayment: 幂等键命中时直接返回历史记录', async () => {
  const originalFindUnique = prisma.payment.findUnique;
  const originalTransaction = prisma.$transaction;
  let transactionCalled = false;

  prisma.payment.findUnique = async () => ({ id: 'pay-1', type: 'PAYABLE', purchaseContractId: 'pc-1', amount: 100, currency: 'CNY', paymentDate: new Date('2026-03-05'), idempotencyKey: 'idem-1' });
  prisma.$transaction = async () => {
    transactionCalled = true;
    throw new Error('should not call transaction');
  };

  try {
    const result = await financeService.createPayment(
      { type: 'PAYABLE', purchaseContractId: 'pc-1', amount: 100, paymentDate: '2026-03-05' },
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
      findUnique: async () => ({ status: 'SIGNED' }),
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
    assert.deepEqual(aggregateArgs.where, { purchaseContractId: 'pc-1', currency: 'CNY', type: { in: ['PAYABLE', 'PAYABLE_PAYMENT', 'EXPENSE'] } });
    assert.deepEqual(purchaseUpdateArgs, {
      where: { id: 'pc-1' },
      data: { paidAmount: 888 },
    });
  } finally {
    prisma.payment.findUnique = originalFindUnique;
    prisma.$transaction = originalTransaction;
  }
});

test('createPayment: 销售合同已收金额只统计收入类 payment', async () => {
  const originalFindUnique = prisma.payment.findUnique;
  const originalTransaction = prisma.$transaction;
  let aggregateArgs = null;
  let salesUpdateArgs = null;

  prisma.payment.findUnique = async () => null;
  prisma.$transaction = async (callback) => callback({
    payment: {
      create: async (args) => ({ id: 'pay-sales-1', ...args.data }),
      aggregate: async (args) => {
        aggregateArgs = args;
        return { _sum: { amount: 1234 } };
      },
    },
    purchaseContract: {
      update: async () => {
        throw new Error('purchase update should not be called');
      },
    },
    salesContract: {
      findUnique: async () => ({ status: 'SIGNED' }),
      update: async (args) => {
        salesUpdateArgs = args;
        return { id: args.where.id };
      },
    },
  });

  try {
    await financeService.createPayment(
      {
        type: 'RECEIVABLE',
        salesContractId: 'sc-9',
        amount: 1234,
        currency: 'USD',
        paymentDate: '2026-04-02',
      },
      { idempotencyKey: 'idem-sales-1' },
    );

    assert.deepEqual(aggregateArgs.where, {
      salesContractId: 'sc-9',
      type: { in: ['RECEIVABLE', 'RECEIVABLE_COLLECTION', 'INCOME'] },
      currency: 'USD',
    });
    assert.deepEqual({ where: salesUpdateArgs.where, data: salesUpdateArgs.data }, {
      where: { id: 'sc-9' },
      data: { receivedAmount: 1234 },
    });
  } finally {
    prisma.payment.findUnique = originalFindUnique;
    prisma.$transaction = originalTransaction;
  }
});

test('createPayment: 销售收款只接受 USD，采购付款只接受 CNY', async () => {
  await assert.rejects(
    () => financeService.createPayment({
      type: 'RECEIVABLE',
      salesContractId: 'sc-1',
      amount: 700,
      currency: 'CNY',
      paymentDate: '2026-07-01',
    }),
    /出口合同收款只支持 USD/,
  );
  await assert.rejects(
    () => financeService.createPayment({
      type: 'PAYABLE',
      purchaseContractId: 'pc-1',
      amount: 100,
      currency: 'USD',
      paymentDate: '2026-07-01',
    }),
    /采购合同付款只支持 CNY/,
  );
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
    return { id: 'pay-3', type: 'PAYABLE', purchaseContractId: 'pc-1', amount: 200, currency: 'CNY', paymentDate: new Date('2026-03-05'), idempotencyKey: 'idem-race' };
  };
  prisma.$transaction = async () => {
    const error = new Error('unique constraint conflict');
    error.code = 'P2002';
    throw error;
  };

  try {
    const result = await financeService.createPayment(
      { type: 'PAYABLE', purchaseContractId: 'pc-1', amount: 200, paymentDate: '2026-03-05' },
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

test('listUnallocatedPayments: 兼容历史 INCOME 并按待分配收款返回', async (t) => {
  const originalGroupBy = prisma.payment.groupBy;
  prisma.payment.groupBy = async () => [];
  t.after(() => { prisma.payment.groupBy = originalGroupBy; });
  const originalFindMany = prisma.payment.findMany;
  let findManyArgs = null;

  prisma.payment.findMany = async (args) => {
    findManyArgs = args;
    return [
      {
        id: 'legacy-income-1',
        type: 'INCOME',
        amount: 1200,
        currency: 'USD',
        paymentDate: new Date('2026-03-01T00:00:00.000Z'),
      },
    ];
  };

  try {
    const payments = await financeService.listUnallocatedPayments();

    assert.deepEqual(findManyArgs.where, {
      OR: [
        {
          type: 'RECEIVABLE_RECEIPT',
          salesContractId: null,
          purchaseContractId: null,
        },
        {
          type: 'INCOME',
          salesContractId: null,
          purchaseContractId: null,
        },
      ],
    });
    assert.equal(payments.length, 1);
    assert.equal(payments[0].type, 'RECEIVABLE_RECEIPT');
  } finally {
    prisma.payment.findMany = originalFindMany;
  }
});

test('allocatePaymentToContracts: 兼容历史 INCOME 收款进行分配', async () => {
  const originalFindUnique = prisma.payment.findUnique;
  const originalTransaction = prisma.$transaction;
  let createArgs = null;
  let updateArgs = null;
  let aggregateCalls = [];

  prisma.payment.findUnique = async () => ({
    id: 'legacy-income-2',
    type: 'INCOME',
    currency: 'USD',
    paymentMethod: 'wire',
    paymentDate: new Date('2026-03-05T00:00:00.000Z'),
    amount: 300,
    customerName: 'Sp food trading LLC',
  });
  prisma.$transaction = async (callback) => callback({
    $executeRaw: async () => 1,
    payment: {
      findUnique: prisma.payment.findUnique,
      create: async (args) => {
        createArgs = args;
        return { id: 'alloc-1', ...args.data };
      },
      aggregate: async (args) => {
        aggregateCalls.push(args);
        if (args.where?.sourcePaymentId === 'legacy-income-2') {
          return { _sum: { amount: createArgs ? 300 : 0 } };
        }
        return { _sum: { amount: 300 } };
      },
      update: async (args) => {
        updateArgs = args;
        return { id: args.where.id, ...args.data };
      },
    },
    salesContract: {
      findMany: async ({ where }) => where.id.in.map(id => ({ id, contractNo: id, status: 'SHIPPED', totalAmount: 1e9, receivedAmount: 0 })),
      update: async (args) => ({ id: args.where.id }),
    },
  });

  try {
    const result = await financeService.allocatePaymentToContracts('legacy-income-2', [
      { salesContractId: 'sc-1', amount: 300 },
    ]);

    assert.equal(result.length, 1);
    assert.equal(createArgs.data.type, 'RECEIVABLE_COLLECTION');
    assert.equal(createArgs.data.salesContractId, 'sc-1');
    assert.equal(createArgs.data.amount, 300);
    assert.equal(createArgs.data.sourcePaymentId, 'legacy-income-2');
    assert.equal(createArgs.data.customerName, 'Sp food trading LLC');
    assert.deepEqual(updateArgs, {
      where: { id: 'legacy-income-2' },
      data: { type: 'RECEIVABLE_RECEIPT_ALLOCATED' },
    });
    assert.equal(aggregateCalls.some((args) => args.where?.sourcePaymentId === 'legacy-income-2'), true);
  } finally {
    prisma.payment.findUnique = originalFindUnique;
    prisma.$transaction = originalTransaction;
  }
});

test('getPaymentTrends: 兼容历史 INCOME/EXPENSE 流水', async () => {
  const originalFindMany = prisma.payment.findMany;

  prisma.payment.findMany = async () => [
    {
      paymentDate: new Date('2026-03-03T00:00:00.000Z'),
      amount: 500,
      type: 'INCOME',
      currency: 'USD',
    },
    {
      paymentDate: new Date('2026-03-04T00:00:00.000Z'),
      amount: 200,
      type: 'EXPENSE',
      currency: 'CNY',
    },
    {
      paymentDate: new Date('2026-03-04T00:00:00.000Z'),
      amount: 999,
      type: 'EXPENSE',
      currency: 'USD',
    },
  ];

  try {
    const trends = await financeService.getPaymentTrends(30);

    assert.deepEqual(trends, [
      {
        label: '3/2',
        receivables: 500,
        payables: 200,
      },
    ]);
  } finally {
    prisma.payment.findMany = originalFindMany;
  }
});

test('autoMatchUnallocatedPayments: 非 USD 到账不与美元出口合同自动挂账', async (t) => {
  const originalGroupBy = prisma.payment.groupBy;
  prisma.payment.groupBy = async () => [];
  t.after(() => { prisma.payment.groupBy = originalGroupBy; });
  const originalPaymentFindMany = prisma.payment.findMany;
  const originalSalesContractFindMany = prisma.salesContract.findMany;
  const originalTransaction = prisma.$transaction;
  let transactionCalled = false;

  prisma.payment.findMany = async () => ([{
    id: 'receipt-cny',
    type: 'INCOME',
    amount: 68006,
    currency: 'CNY',
    note: 'EXP250024 回款',
    paymentDate: new Date('2026-03-10T00:00:00.000Z'),
  }]);
  prisma.salesContract.findMany = async () => ([{
    id: 'sc-24',
    contractNo: 'EXP250024',
    totalAmount: 68006,
    receivedAmount: 0,
    status: 'SHIPPED',
  }]);
  prisma.$transaction = async () => {
    transactionCalled = true;
    throw new Error('should not allocate unsupported currency');
  };

  try {
    const result = await financeService.autoMatchUnallocatedPayments();

    assert.equal(result.matchedCount, 0);
    assert.deepEqual(result.skipped, [{ paymentId: 'receipt-cny', reason: 'unsupported_currency' }]);
    assert.equal(transactionCalled, false);
  } finally {
    prisma.payment.findMany = originalPaymentFindMany;
    prisma.salesContract.findMany = originalSalesContractFindMany;
    prisma.$transaction = originalTransaction;
  }
});

test('autoMatchUnallocatedPayments: 命中唯一合同号且金额一致时自动挂账', async (t) => {
  const originalGroupBy = prisma.payment.groupBy;
  prisma.payment.groupBy = async () => [];
  t.after(() => { prisma.payment.groupBy = originalGroupBy; });
  const originalPaymentFindMany = prisma.payment.findMany;
  const originalPaymentFindUnique = prisma.payment.findUnique;
  const originalSalesContractFindUnique = prisma.salesContract.findUnique;
  const originalSalesContractFindMany = prisma.salesContract.findMany;
  const originalTransaction = prisma.$transaction;
  let createArgs = null;
  let paymentUpdateArgs = null;

  prisma.payment.findMany = async () => ([
    {
      id: 'receipt-1',
      type: 'INCOME',
      amount: 68006,
      currency: 'USD',
      note: 'EXP250024 回款',
      paymentDate: new Date('2026-03-10T00:00:00.000Z'),
      customerName: 'Sp food trading LLC',
    },
  ]);
  prisma.salesContract.findUnique = async ({ where }) => {
    if (where.contractNo === 'EXP250024') {
      return {
        id: 'sc-24',
        contractNo: 'EXP250024',
        totalAmount: 68006,
        receivedAmount: 0,
        status: 'SHIPPED',
      };
    }
    return null;
  };
  prisma.salesContract.findMany = async () => ([
    {
      id: 'sc-24',
      contractNo: 'EXP250024',
      totalAmount: 68006,
      receivedAmount: 0,
      status: 'SHIPPED',
    },
  ]);
  prisma.payment.findUnique = async ({ where }) => {
    if (where.id === 'receipt-1') {
      return {
        id: 'receipt-1',
        type: 'INCOME',
        amount: 68006,
        currency: 'USD',
        paymentMethod: '电汇',
        paymentDate: new Date('2026-03-10T00:00:00.000Z'),
        note: 'EXP250024 回款',
        customerName: 'Sp food trading LLC',
      };
    }
    return null;
  };
  prisma.$transaction = async (callback) => callback({
    $executeRaw: async () => 1,
    payment: {
      findUnique: prisma.payment.findUnique,
      create: async (args) => {
        createArgs = args;
        return { id: 'alloc-auto-1', ...args.data };
      },
      aggregate: async () => ({ _sum: { amount: createArgs ? 68006 : 0 } }),
      update: async (args) => {
        paymentUpdateArgs = args;
        return { id: args.where.id };
      },
    },
    salesContract: {
      findMany: async ({ where }) => where.id.in.map(id => ({ id, contractNo: id, status: 'SHIPPED', totalAmount: 1e9, receivedAmount: 0 })),
      update: async (args) => ({ id: args.where.id }),
    },
  });

  try {
    const result = await financeService.autoMatchUnallocatedPayments();

    assert.equal(result.inspectedCount, 1);
    assert.equal(result.matchedCount, 1);
    assert.equal(result.skippedCount, 0);
    assert.deepEqual(result.matched[0], {
      paymentId: 'receipt-1',
      salesContractId: 'sc-24',
      contractNo: 'EXP250024',
      amount: 68006,
      rule: 'exact_contract_no_and_full_amount',
      confidence: 'high',
    });
    assert.equal(createArgs.data.salesContractId, 'sc-24');
    assert.equal(createArgs.data.customerName, 'Sp food trading LLC');
    assert.match(createArgs.data.note, /自动匹配/);
    assert.deepEqual(paymentUpdateArgs, {
      where: { id: 'receipt-1' },
      data: { type: 'RECEIVABLE_RECEIPT_ALLOCATED' },
    });
  } finally {
    prisma.payment.findMany = originalPaymentFindMany;
    prisma.payment.findUnique = originalPaymentFindUnique;
    prisma.salesContract.findUnique = originalSalesContractFindUnique;
    prisma.salesContract.findMany = originalSalesContractFindMany;
    prisma.$transaction = originalTransaction;
  }
});

test('autoMatchUnallocatedPayments: 备注模糊或金额不一致时保留在收款池', async (t) => {
  const originalGroupBy = prisma.payment.groupBy;
  prisma.payment.groupBy = async () => [];
  t.after(() => { prisma.payment.groupBy = originalGroupBy; });
  const originalPaymentFindMany = prisma.payment.findMany;
  const originalSalesContractFindUnique = prisma.salesContract.findUnique;
  const originalSalesContractFindMany = prisma.salesContract.findMany;
  const originalPaymentFindUnique = prisma.payment.findUnique;
  const originalTransaction = prisma.$transaction;
  let transactionCalled = false;

  prisma.payment.findMany = async () => ([
    {
      id: 'receipt-2',
      type: 'INCOME',
      amount: 50000,
      currency: 'USD',
      note: 'EXP250024 回款',
      paymentDate: new Date('2026-03-11T00:00:00.000Z'),
    },
    {
      id: 'receipt-3',
      type: 'INCOME',
      amount: 30000,
      currency: 'USD',
      note: '2025年收入',
      paymentDate: new Date('2026-03-12T00:00:00.000Z'),
    },
  ]);
  prisma.salesContract.findUnique = async ({ where }) => {
    if (where.contractNo === 'EXP250024') {
      return {
        id: 'sc-24',
        contractNo: 'EXP250024',
        totalAmount: 68006,
        receivedAmount: 0,
        status: 'SHIPPED',
      };
    }
    return null;
  };
  prisma.salesContract.findMany = async () => ([
    {
      id: 'sc-24',
      contractNo: 'EXP250024',
      totalAmount: 68006,
      receivedAmount: 0,
      status: 'SHIPPED',
    },
  ]);
  prisma.payment.findUnique = async () => {
    throw new Error('should not try allocate skipped receipts');
  };
  prisma.$transaction = async () => {
    transactionCalled = true;
    throw new Error('should not open transaction');
  };

  try {
    const result = await financeService.autoMatchUnallocatedPayments();

    assert.equal(result.inspectedCount, 2);
    assert.equal(result.matchedCount, 0);
    assert.equal(result.skippedCount, 2);
    assert.equal(transactionCalled, false);
    assert.deepEqual(result.skipped, [
      { paymentId: 'receipt-2', reason: 'amount_mismatch' },
      { paymentId: 'receipt-3', reason: 'no_contract_reference' },
    ]);
  } finally {
    prisma.payment.findMany = originalPaymentFindMany;
    prisma.salesContract.findUnique = originalSalesContractFindUnique;
    prisma.salesContract.findMany = originalSalesContractFindMany;
    prisma.payment.findUnique = originalPaymentFindUnique;
    prisma.$transaction = originalTransaction;
  }
});

test('listUnallocatedPayments: 返回客户名与剩余可分配金额', async () => {
  const originalFindMany = prisma.payment.findMany;
  const originalGroupBy = prisma.payment.groupBy;

  prisma.payment.findMany = async () => ([
    {
      id: 'receipt-partial-1',
      type: 'INCOME',
      amount: 33000,
      currency: 'USD',
      customerName: 'Sp food trading LLC',
      paymentDate: new Date('2026-03-20T00:00:00.000Z'),
      note: '客户整笔回款',
    },
  ]);
  prisma.payment.groupBy = async () => ([
    {
      sourcePaymentId: 'receipt-partial-1',
      _sum: { amount: 30000 },
    },
  ]);

  try {
    const payments = await financeService.listUnallocatedPayments();

    assert.equal(payments.length, 1);
    assert.equal(payments[0].customerName, 'Sp food trading LLC');
    assert.equal(payments[0].allocatedAmount, 30000);
    assert.equal(payments[0].remainingAmount, 3000);
  } finally {
    prisma.payment.findMany = originalFindMany;
    prisma.payment.groupBy = originalGroupBy;
  }
});

test('allocatePaymentToContracts: 部分分配后保留在收款池', async () => {
  const originalFindUnique = prisma.payment.findUnique;
  const originalTransaction = prisma.$transaction;
  let updateArgs = null;
  let created = false;

  prisma.payment.findUnique = async () => ({
    id: 'receipt-partial-2',
    type: 'RECEIVABLE_RECEIPT',
    amount: 33000,
    currency: 'USD',
    paymentMethod: 'wire',
    paymentDate: new Date('2026-03-20T00:00:00.000Z'),
    customerName: 'Sp food trading LLC',
  });
  prisma.$transaction = async (callback) => callback({
    $executeRaw: async () => 1,
    payment: {
      findUnique: prisma.payment.findUnique,
      create: async (args) => { created = true; return { id: 'alloc-partial-1', ...args.data }; },
      aggregate: async (args) => {
        if (args.where?.sourcePaymentId === 'receipt-partial-2') {
          return { _sum: { amount: created ? 30000 : 0 } };
        }
        return { _sum: { amount: 30000 } };
      },
      update: async (args) => {
        updateArgs = args;
        return { id: args.where.id };
      },
    },
    salesContract: {
      findMany: async ({ where }) => where.id.in.map(id => ({ id, contractNo: id, status: 'SHIPPED', totalAmount: 1e9, receivedAmount: 0 })),
      update: async (args) => ({ id: args.where.id }),
    },
  });

  try {
    await financeService.allocatePaymentToContracts('receipt-partial-2', [
      { salesContractId: 'sc-a', amount: 30000 },
    ]);

    assert.equal(updateArgs, null);
  } finally {
    prisma.payment.findUnique = originalFindUnique;
    prisma.$transaction = originalTransaction;
  }
});

test('getReceivables: 只统计捷淞自有货物金额', async () => {
  const originalFindMany = prisma.salesContract.findMany;
  const originalCount = prisma.salesContract.count;

  prisma.salesContract.findMany = async () => ([
    {
      id: 'sc-owned-1',
      contractNo: 'EXP250013',
      totalAmount: 903233.0524,
      receivedAmount: 0,
      status: 'SHIPPED',
      packingItems: [
        {
          totalPrice: 774800,
          isOwnedByJiesong: false,
          note: '非捷淞报关，属拼船或他方自行报关',
          store: { id: 'store-1', name: '禧瑞都' },
        },
        {
          totalPrice: 83578.05,
          isOwnedByJiesong: true,
          note: '喜安一起',
          store: { id: 'store-1', name: '禧瑞都' },
        },
        {
          totalPrice: 11100,
          isOwnedByJiesong: true,
          note: null,
          store: { id: 'store-1', name: '禧瑞都' },
        },
      ],
      port: null,
    },
  ]);
  prisma.salesContract.count = async () => 1;

  try {
    const result = await financeService.getReceivables({ page: 1, pageSize: 20, skip: 0 });
    assert.equal(result.receivables.length, 1);
    assert.equal(result.receivables[0].contractNo, 'EXP250013');
    assert.equal(result.receivables[0].totalAmount, 128433.05);
    assert.equal(result.receivables[0].unreceiveAmount, 128433.05);
  } finally {
    prisma.salesContract.findMany = originalFindMany;
    prisma.salesContract.count = originalCount;
  }
});

test('getReceivables: 混柜合同回款按自有美元收款计入，不再按比例折算', async () => {
  const originalFindMany = prisma.salesContract.findMany;
  const originalCount = prisma.salesContract.count;

  prisma.salesContract.findMany = async () => ([{
    id: 'sc-mixed-receipt',
    contractNo: 'EXP260019',
    totalAmount: 1000,
    receivedAmount: 400,
    status: 'SHIPPED',
    packingItems: [
      { totalPrice: 600, isOwnedByJiesong: true, store: null },
      { totalPrice: 400, isOwnedByJiesong: false, sourceParty: '第三方拼柜', store: null },
    ],
    port: null,
  }]);
  prisma.salesContract.count = async () => 1;

  try {
    const result = await financeService.getReceivables({ page: 1, pageSize: 20, skip: 0 });
    assert.equal(result.receivables[0].totalAmount, 600);
    assert.equal(result.receivables[0].receivedAmount, 400);
    assert.equal(result.receivables[0].unreceiveAmount, 200);
  } finally {
    prisma.salesContract.findMany = originalFindMany;
    prisma.salesContract.count = originalCount;
  }
});

test('getReceivables: 正式合同金额不再扣除第三方装箱货值', async () => {
  const originalFindMany = prisma.salesContract.findMany;
  const originalCount = prisma.salesContract.count;

  prisma.salesContract.findMany = async () => ([{
    id: 'sc-formal',
    contractNo: 'EXP260020',
    amountSource: 'FORMAL_DOCUMENT',
    totalAmount: 600,
    receivedAmount: 300,
    status: 'SHIPPED',
    packingItems: [
      { totalPrice: 600, isOwnedByJiesong: true, store: null },
      { totalPrice: 400, isOwnedByJiesong: false, sourceParty: '第三方拼柜', store: null },
    ],
    port: null,
  }]);
  prisma.salesContract.count = async () => 1;

  try {
    const result = await financeService.getReceivables({ page: 1, pageSize: 20, skip: 0 });
    assert.equal(result.receivables[0].totalAmount, 600);
    assert.equal(result.receivables[0].receivedAmount, 300);
    assert.equal(result.receivables[0].unreceiveAmount, 300);
  } finally {
    prisma.salesContract.findMany = originalFindMany;
    prisma.salesContract.count = originalCount;
  }
});

test('getStats: 排除第三方拼柜金额后计算真实应收', async () => {
  const originalPurchaseFindMany = prisma.purchaseContract.findMany;
  const originalSalesFindMany = prisma.salesContract.findMany;
  const originalPackingItemGroupBy = prisma.packingItem.groupBy;

  // 只返回已生效合同（payablesService 在查询层按状态过滤）；这里再混入草稿证明汇总层也会剔除。
  prisma.purchaseContract.findMany = async () => ([
    { id: 'p1', status: 'SIGNED', totalAmount: 1000, paidAmount: 200, expectedDate: null },
    { id: 'p-draft', status: 'DRAFT', totalAmount: 5000, paidAmount: 0, expectedDate: null },
  ]);
  prisma.salesContract.findMany = async () => ([
    {
      id: 'contract-1',
      totalAmount: 903233.0524,
      receivedAmount: 0,
    },
    {
      id: 'contract-2',
      totalAmount: 3130,
      receivedAmount: 0,
    },
  ]);
  prisma.packingItem.groupBy = async ({ where }) => {
    if (where.isOwnedByJiesong === false) {
      return [
        { salesContractId: 'contract-1', _sum: { totalPrice: 774800 } },
        { salesContractId: 'contract-2', _sum: { totalPrice: 880 } },
      ];
    }
    return [
      { salesContractId: 'contract-1', _sum: { totalPrice: 869478.05 } },
      { salesContractId: 'contract-2', _sum: { totalPrice: 1580 } },
    ];
  };

  try {
    const stats = await financeService.getStats();

    assert.deepEqual(stats, {
      payable: {
        total: 1000,
        paid: 200,
        unpaid: 800,
      },
      receivable: {
        total: 130683.05,
        received: 0,
        unreceived: 130683.05,
      },
    });
  } finally {
    prisma.purchaseContract.findMany = originalPurchaseFindMany;
    prisma.salesContract.findMany = originalSalesFindMany;
    prisma.packingItem.groupBy = originalPackingItemGroupBy;
  }
});

test('getReceivables: 先过滤所有权及未收金额，再分页，total为全量匹配数', async () => {
 const original=prisma.salesContract.findMany;
 const contracts=[
  {id:'third-party',contractNo:'EXP-9',totalAmount:100,receivedAmount:0,packingItems:[{totalPrice:100,isOwnedByJiesong:false}]},
  {id:'paid',contractNo:'EXP-8',totalAmount:100,receivedAmount:100,packingItems:[]},
  {id:'first',contractNo:'EXP-7',totalAmount:100,receivedAmount:20,packingItems:[]},
  {id:'second',contractNo:'EXP-6',totalAmount:100,receivedAmount:0,packingItems:[]},
 ];
 prisma.salesContract.findMany=async(args)=> args.take ? contracts.slice(args.skip,args.skip+args.take) : contracts;
 const originalCount=prisma.salesContract.count;prisma.salesContract.count=async()=>contracts.length;
 try {
  const result=await financeService.getReceivables({page:2,pageSize:1,skip:1,outstandingOnly:true});
  assert.equal(result.total,2);
  assert.deepEqual(result.receivables.map(c=>c.id),['second']);
  const searched=await financeService.getReceivables({page:1,pageSize:1,skip:0,search:'EXP-6',outstandingOnly:true});
  assert.equal(searched.total,1);assert.equal(searched.receivables[0].id,'second');
 } finally {prisma.salesContract.findMany=original;prisma.salesContract.count=originalCount;}
});

// 混装柜：totalAmount 是整柜货值，捷淞自有额 = 扣除第三方装箱后；结清与逾期都按自有额。
const mixedCargo = (extra = {}) => ({
  status: 'ARRIVED', totalAmount: 1000, amountSource: 'DERIVED', receivedAmount: 0,
  packingItems: [{ totalPrice: 600, isOwnedByJiesong: true }, { totalPrice: 400, isOwnedByJiesong: false }],
  ...extra,
});

test('混装柜：收齐捷淞自有额即结清为 COMPLETED', async (t) => {
  let status = 'ARRIVED';
  t.mock.method(prisma, '$transaction', async fn => fn({
    payment: { create: async ({ data }) => ({ id: 'p', ...data }), aggregate: async () => ({ _sum: { amount: 600 } }) },
    salesContract: { findUnique: async () => ({ status: 'ARRIVED' }), update: async ({ data }) => { if (data.status) status = data.status; return mixedCargo(); } },
  }));
  await financeService.createPayment({ type: 'RECEIVABLE_COLLECTION', salesContractId: 'c', amount: 600, currency: 'USD', paymentDate: '2026-10-01' });
  assert.equal(status, 'COMPLETED');
});

test('getOverdueReceivables: 混装柜收齐自有额不逾期，未收齐按自有额计未收', async (t) => {
  const shippedAt = new Date('2026-01-01');
  const original = prisma.salesContract;
  t.after(() => { prisma.salesContract = original; });
  prisma.salesContract = { findMany: async () => [
    { id: 'paid', contractNo: 'A', shippedAt, ...mixedCargo({ receivedAmount: 599.995 }) },
    { id: 'open', contractNo: 'B', shippedAt, ...mixedCargo({ receivedAmount: 100 }) },
  ] };
  const rows = await financeService.getOverdueReceivables(30);
  assert.deepEqual(rows.map((r) => [r.id, r.totalAmount, r.unreceived]), [['open', 600, 500]]);
});

test('createPayment: 拒绝非正/非数字金额、无效日期、无效类型和错误合同关联', async () => {
  const base = { type: 'PAYABLE', purchaseContractId: 'pc-1', amount: 100, paymentDate: '2026-03-05' };
  const bad = [
    { amount: -5000 }, { amount: 0 }, { amount: 'abc' }, { amount: NaN }, { amount: 10.123 },
    { paymentDate: 'not-a-date' }, { type: 'RECEIVABLE_RECEIPT_ALLOCATED' }, { type: 'BOGUS' },
    { salesContractId: 'sc-1' }, { purchaseContractId: undefined },
    { type: 'RECEIVABLE', purchaseContractId: undefined }, { type: 'RECEIVABLE_RECEIPT', purchaseContractId: undefined, currency: 'CNY' },
  ];
  for (const override of bad) {
    await assert.rejects(financeService.createPayment({ ...base, ...override }), (e) => e.statusCode === 400, JSON.stringify(override));
  }
});

test('createPayment: 已取消或不存在的合同不能登记款项', async (t) => {
  for (const found of [null, { status: 'CANCELLED' }]) {
    t.mock.method(prisma, '$transaction', async (fn) => fn({ purchaseContract: { findUnique: async () => found } }));
    await assert.rejects(
      financeService.createPayment({ type: 'PAYABLE', purchaseContractId: 'pc-1', amount: 1, paymentDate: '2026-03-05' }),
      (e) => e.statusCode === 400,
    );
  }
});

test('createPayment: 幂等键对应不同金额时 409，而不是静默返回他人记录', async (t) => {
  const original = prisma.payment.findUnique;
  t.after(() => { prisma.payment.findUnique = original; });
  prisma.payment.findUnique = async () => ({
    id: 'pay-1', type: 'PAYABLE', purchaseContractId: 'pc-1', amount: 100, currency: 'CNY', paymentDate: new Date('2026-03-05'),
  });
  await assert.rejects(
    financeService.createPayment({ type: 'PAYABLE', purchaseContractId: 'pc-1', amount: 250, paymentDate: '2026-03-05' }, { idempotencyKey: 'k' }),
    (e) => e.statusCode === 409,
  );
});

test('allocatePaymentToContracts: 拒绝已取消合同和超出未收余额的分配', async (t) => {
  for (const [target, message] of [
    [{ status: 'CANCELLED', totalAmount: 1000, receivedAmount: 0 }, /已取消/],
    [{ status: 'SHIPPED', totalAmount: 1000, receivedAmount: 900 }, /超出/],
  ]) {
    t.mock.method(prisma, '$transaction', async (fn) => fn({
      $executeRaw: async () => 1,
      payment: {
        findUnique: async () => ({ id: 'r1', type: 'RECEIVABLE_RECEIPT', amount: 500, currency: 'USD' }),
        aggregate: async () => ({ _sum: { amount: 0 } }),
        create: async () => { throw new Error('must not create'); },
      },
      salesContract: { findMany: async () => [{ id: 'sc-1', contractNo: 'EXP1', ...target }] },
    }));
    await assert.rejects(
      financeService.allocatePaymentToContracts('r1', [{ salesContractId: 'sc-1', amount: 500 }]),
      (e) => e.statusCode === 400 && message.test(e.message),
    );
  }
});

// B68 (P1-2): 同一合同号被多笔未分配到账引用
const withAutoMatchFixture = async (t, { receipts, contract }) => {
  const saved = {
    groupBy: prisma.payment.groupBy,
    paymentFindMany: prisma.payment.findMany,
    paymentFindUnique: prisma.payment.findUnique,
    contractFindMany: prisma.salesContract.findMany,
    transaction: prisma.$transaction,
  };
  t.after(() => {
    prisma.payment.groupBy = saved.groupBy;
    prisma.payment.findMany = saved.paymentFindMany;
    prisma.payment.findUnique = saved.paymentFindUnique;
    prisma.salesContract.findMany = saved.contractFindMany;
    prisma.$transaction = saved.transaction;
  });
  const created = [];
  prisma.payment.groupBy = async () => [];
  prisma.payment.findMany = async () => receipts;
  prisma.salesContract.findMany = async () => [contract];
  prisma.payment.findUnique = async ({ where }) => receipts.find((r) => r.id === where.id) || null;
  prisma.$transaction = async (callback) => callback({
    $executeRaw: async () => 1,
    payment: {
      findUnique: prisma.payment.findUnique,
      create: async (args) => { created.push(args.data); return { id: `alloc-${created.length}`, ...args.data }; },
      aggregate: async () => ({ _sum: { amount: 0 } }),
      update: async (args) => ({ id: args.where.id }),
    },
    salesContract: {
      findMany: async () => [contract],
      update: async (args) => ({ id: args.where.id }),
    },
  });
  return created;
};

const syntheticReceipt = (id, amount) => ({
  id, type: 'INCOME', amount, currency: 'USD', note: 'EXP250024 回款', paymentDate: new Date('2026-03-10T00:00:00.000Z'), customerName: 'Synthetic Buyer',
});
const syntheticContract = { id: 'sc-24', contractNo: 'EXP250024', totalAmount: 500, receivedAmount: 0, status: 'SHIPPED' };

test('autoMatchUnallocatedPayments: 两笔到账引用同一合同号，不再互相覆盖（旧代码把第一笔误报为 no_contract_reference）', async (t) => {
  const created = await withAutoMatchFixture(t, {
    receipts: [syntheticReceipt('r-full', 500), syntheticReceipt('r-part', 300)],
    contract: syntheticContract,
  });
  const result = await financeService.autoMatchUnallocatedPayments();
  assert.equal(result.matchedCount, 1);
  assert.equal(result.matched[0].paymentId, 'r-full');
  assert.deepEqual(result.skipped, [{ paymentId: 'r-part', reason: 'amount_mismatch' }]);
  assert.equal(created.length, 1);
});

test('autoMatchUnallocatedPayments: 两笔到账各自都等于合同待收余额时全部交人工，不猜', async (t) => {
  const created = await withAutoMatchFixture(t, {
    receipts: [syntheticReceipt('r-a', 500), syntheticReceipt('r-b', 500)],
    contract: syntheticContract,
  });
  const result = await financeService.autoMatchUnallocatedPayments();
  assert.equal(result.matchedCount, 0);
  assert.deepEqual(result.skipped.map((s) => s.reason), ['ambiguous_multiple_receipts_for_contract', 'ambiguous_multiple_receipts_for_contract']);
  assert.equal(created.length, 0, '不得向同一合同分配 2x 余额');
});

test('autoMatchUnallocatedPayments: 三笔到账引用同一合同，累计分配不超过待收余额且部分款不被吞掉', async (t) => {
  const created = await withAutoMatchFixture(t, {
    receipts: [syntheticReceipt('r-c', 200), syntheticReceipt('r-a', 500), syntheticReceipt('r-b', 500)],
    contract: syntheticContract,
  });
  const result = await financeService.autoMatchUnallocatedPayments();
  assert.equal(result.matchedCount, 0);
  assert.equal(result.skipped.find((s) => s.paymentId === 'r-c').reason, 'amount_mismatch');
  assert.ok(created.reduce((sum, row) => sum + row.amount, 0) <= 500 + 0.01);
});
