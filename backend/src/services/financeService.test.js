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
    ['sales', 'COMPLETED', 110, 'ARRIVED'], ['sales', 'ARRIVED', 0, 'ARRIVED'],
  ];
  for (const [kind, initialStatus, amount, expected] of cases) {
    let status = initialStatus;
    const model = { update: async ({ data }) => { status = data.status || status; return { status, totalAmount: 100, ...data }; } };
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
    assert.deepEqual(aggregateArgs.where, { purchaseContractId: 'pc-1', currency: 'CNY' });
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
    assert.deepEqual(salesUpdateArgs, {
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

test('listUnallocatedPayments: 兼容历史 INCOME 并按待分配收款返回', async () => {
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
    payment: {
      create: async (args) => {
        createArgs = args;
        return { id: 'alloc-1', ...args.data };
      },
      aggregate: async (args) => {
        aggregateCalls.push(args);
        if (args.where?.sourcePaymentId === 'legacy-income-2') {
          return { _sum: { amount: 300 } };
        }
        return { _sum: { amount: 300 } };
      },
      update: async (args) => {
        updateArgs = args;
        return { id: args.where.id, ...args.data };
      },
    },
    salesContract: {
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

test('autoMatchUnallocatedPayments: 非 USD 到账不与美元出口合同自动挂账', async () => {
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

test('autoMatchUnallocatedPayments: 命中唯一合同号且金额一致时自动挂账', async () => {
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
    payment: {
      create: async (args) => {
        createArgs = args;
        return { id: 'alloc-auto-1', ...args.data };
      },
      aggregate: async () => ({ _sum: { amount: 68006 } }),
      update: async (args) => {
        paymentUpdateArgs = args;
        return { id: args.where.id };
      },
    },
    salesContract: {
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

test('autoMatchUnallocatedPayments: 备注模糊或金额不一致时保留在收款池', async () => {
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
    payment: {
      create: async (args) => ({ id: 'alloc-partial-1', ...args.data }),
      aggregate: async (args) => {
        if (args.where?.sourcePaymentId === 'receipt-partial-2') {
          return { _sum: { amount: 30000 } };
        }
        return { _sum: { amount: 30000 } };
      },
      update: async (args) => {
        updateArgs = args;
        return { id: args.where.id };
      },
    },
    salesContract: {
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

test('getReceivables: 混柜合同回款按自有收入比例归属', async () => {
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
    assert.equal(result.receivables[0].receivedAmount, 240);
    assert.equal(result.receivables[0].unreceiveAmount, 360);
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
  const originalPurchaseAggregate = prisma.purchaseContract.aggregate;
  const originalSalesFindMany = prisma.salesContract.findMany;
  const originalPackingItemGroupBy = prisma.packingItem.groupBy;

  prisma.purchaseContract.aggregate = async () => ({
    _sum: { totalAmount: 1000, paidAmount: 200 },
  });
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
    prisma.purchaseContract.aggregate = originalPurchaseAggregate;
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
