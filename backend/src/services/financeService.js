/**
 * Input: 财务请求参数
 * Output: 付款记录与应收应付统计
 * Pos: 财务业务服务层，负责幂等写入与聚合计算
 */

const prisma = require('../utils/prisma');

const trimIdempotencyKey = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
};

const includePaymentRelations = {
  purchaseContract: { include: { supplier: true } },
  salesContract: true,
};

const syncContractPaymentAmounts = async (tx, { purchaseContractId, salesContractId }) => {
  if (purchaseContractId) {
    const total = await tx.payment.aggregate({
      where: { purchaseContractId },
      _sum: { amount: true },
    });
    await tx.purchaseContract.update({
      where: { id: purchaseContractId },
      data: { paidAmount: total._sum.amount || 0 },
    });
  }

  if (salesContractId) {
    const total = await tx.payment.aggregate({
      where: { salesContractId },
      _sum: { amount: true },
    });
    await tx.salesContract.update({
      where: { id: salesContractId },
      data: { receivedAmount: total._sum.amount || 0 },
    });
  }
};

const listPayments = async ({ page, pageSize, skip, type }) => {
  const where = type ? { type } : {};

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip,
      take: pageSize,
      include: includePaymentRelations,
      orderBy: { paymentDate: 'desc' },
    }),
    prisma.payment.count({ where }),
  ]);

  return { payments, total };
};

const createPayment = async (data = {}, options = {}) => {
  const idempotencyKey = trimIdempotencyKey(options.idempotencyKey);

  if (idempotencyKey) {
    const existing = await prisma.payment.findUnique({
      where: { idempotencyKey },
      include: includePaymentRelations,
    });
    if (existing) {
      return { payment: existing, reused: true };
    }
  }

  try {
    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          type: data.type,
          purchaseContractId: data.purchaseContractId,
          salesContractId: data.salesContractId,
          amount: data.amount,
          currency: data.currency || 'CNY',
          paymentMethod: data.paymentMethod,
          paymentDate: new Date(data.paymentDate),
          note: data.note,
          idempotencyKey,
        },
      });

      await syncContractPaymentAmounts(tx, {
        purchaseContractId: data.purchaseContractId,
        salesContractId: data.salesContractId,
      });

      return created;
    });

    return { payment, reused: false };
  } catch (error) {
    // Concurrent requests with the same idempotency key can race on insert.
    if (idempotencyKey && error?.code === 'P2002') {
      const existing = await prisma.payment.findUnique({
        where: { idempotencyKey },
        include: includePaymentRelations,
      });
      if (existing) {
        return { payment: existing, reused: true };
      }
    }
    throw error;
  }
};

const getPayables = async ({ page, pageSize, skip }) => {
  const where = {
    totalAmount: { gt: 0 },
    NOT: { status: 'CANCELLED' },
  };

  const [contracts, total] = await Promise.all([
    prisma.purchaseContract.findMany({
      where,
      skip,
      take: pageSize,
      include: { supplier: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.purchaseContract.count({ where }),
  ]);

  return {
    payables: contracts.map((contract) => ({
      ...contract,
      unpaidAmount: contract.totalAmount - contract.paidAmount,
    })),
    total,
    page,
    pageSize,
  };
};

const getReceivables = async ({ page, pageSize, skip }) => {
  const where = {
    totalAmount: { gt: 0 },
    NOT: { status: 'CANCELLED' },
  };

  const [contracts, total] = await Promise.all([
    prisma.salesContract.findMany({
      where,
      skip,
      take: pageSize,
      include: {
        packingItems: { include: { store: true } },
        port: true,
      },
      orderBy: { contractNo: 'desc' },
    }),
    prisma.salesContract.count({ where }),
  ]);

  const receivables = contracts.map((contract) => {
    const storeMap = new Map();
    contract.packingItems?.forEach((item) => {
      if (item.store && !storeMap.has(item.store.id)) {
        storeMap.set(item.store.id, item.store.name);
      }
    });
    let stores = Array.from(storeMap.values());
    if (!stores.length && contract.port?.name) {
      stores = [contract.port.name];
    }

    return {
      ...contract,
      unreceiveAmount: contract.totalAmount - contract.receivedAmount,
      stores,
      packingItems: undefined,
      port: undefined,
    };
  });

  return { receivables, total, page, pageSize };
};

const getStats = async () => {
  const payableStats = await prisma.purchaseContract.aggregate({
    where: { NOT: { status: 'CANCELLED' } },
    _sum: { totalAmount: true, paidAmount: true },
  });

  const receivableStats = await prisma.salesContract.aggregate({
    where: { NOT: { status: 'CANCELLED' } },
    _sum: { totalAmount: true, receivedAmount: true },
  });

  return {
    payable: {
      total: payableStats._sum.totalAmount || 0,
      paid: payableStats._sum.paidAmount || 0,
      unpaid: (payableStats._sum.totalAmount || 0) - (payableStats._sum.paidAmount || 0),
    },
    receivable: {
      total: receivableStats._sum.totalAmount || 0,
      received: receivableStats._sum.receivedAmount || 0,
      unreceived: (receivableStats._sum.totalAmount || 0) - (receivableStats._sum.receivedAmount || 0),
    },
  };
};

module.exports = {
  listPayments,
  createPayment,
  getPayables,
  getReceivables,
  getStats,
};
