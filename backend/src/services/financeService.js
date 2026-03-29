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

/**
 * 职责：获取待分配收款列表（无关联合同的收款记录）
 */
const listUnallocatedPayments = async () => {
  const payments = await prisma.payment.findMany({
    where: {
      type: 'RECEIVABLE_RECEIPT',
      salesContractId: null,
      purchaseContractId: null,
    },
    orderBy: { paymentDate: 'desc' },
  });
  return payments;
};

/**
 * 职责：将一笔待分配收款分配到多张销售合同
 * 思路：
 *   1. 验证 paymentId 存在且类型为 RECEIVABLE_RECEIPT
 *   2. 为每条 allocation 创建新的 Payment 记录（RECEIVABLE_COLLECTION 类型，关联合同）
 *   3. 同步更新每张销售合同的 receivedAmount
 * @param {string} paymentId - 待分配收款 ID
 * @param {Array<{salesContractId: string, amount: number, note?: string}>} allocations - 分配明细
 */
const allocatePaymentToContracts = async (paymentId, allocations) => {
  const receipt = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!receipt) throw new Error('收款记录不存在');
  if (receipt.type !== 'RECEIVABLE_RECEIPT') throw new Error('该记录不是待分配收款');

  const result = await prisma.$transaction(async (tx) => {
    const created = [];

    for (const alloc of allocations) {
      // 1. 创建关联合同的分配记录
      const payment = await tx.payment.create({
        data: {
          type: 'RECEIVABLE_COLLECTION',
          salesContractId: alloc.salesContractId,
          amount: alloc.amount,
          currency: receipt.currency,
          paymentMethod: receipt.paymentMethod,
          paymentDate: receipt.paymentDate,
          note: alloc.note || `来自收款 #${paymentId.slice(-6)}`,
        },
      });
      created.push(payment);

      // 2. 同步合同已收金额
      await syncContractPaymentAmounts(tx, { salesContractId: alloc.salesContractId });
    }

    return created;
  });

  return result;
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

/**
 * 职责：按周聚合近 N 天的收付款流水，用于财务趋势折线图
 * 思路：
 *   1. 查询最近 days 天的 payment 记录
 *   2. 按 ISO 周分组，累加应收回款（RECEIVABLE_COLLECTION）与应付付款（PAYABLE_PAYMENT）
 *   3. 填充无流水的周为 0，保证折线图连续
 * @param {number} days - 统计天数（30 或 90）
 * @returns {{ label: string, receivables: number, payables: number }[]}
 */
const getPaymentTrends = async (days = 90) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const payments = await prisma.payment.findMany({
    where: { paymentDate: { gte: since } },
    select: { paymentDate: true, amount: true, type: true },
    orderBy: { paymentDate: 'asc' },
  });

  // 1. 按 ISO 周（YYYY-Www）归组
  const weekMap = new Map();

  const toWeekKey = (date) => {
    const d = new Date(date);
    // 周起点为周一
    const day = d.getDay() === 0 ? 7 : d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day - 1));
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, '0');
    const md = String(monday.getDate()).padStart(2, '0');
    return `${y}-${m}-${md}`;
  };

  const toLabel = (weekKey) => {
    const d = new Date(weekKey);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  payments.forEach((p) => {
    const key = toWeekKey(p.paymentDate);
    if (!weekMap.has(key)) {
      weekMap.set(key, { label: toLabel(key), receivables: 0, payables: 0 });
    }
    const entry = weekMap.get(key);
    if (p.type === 'RECEIVABLE_COLLECTION') {
      entry.receivables += Number(p.amount);
    } else if (p.type === 'PAYABLE_PAYMENT') {
      entry.payables += Number(p.amount);
    }
  });

  // 2. 排序并返回
  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
};

/**
 * 职责：获取应收逾期预警列表
 * 思路：
 *   已发货（shippedAt 非空）且距发货超过 overdueDays 天、仍有未收款余额的销售合同
 *   视为逾期，返回合同列表用于前端预警展示。
 * @param {number} overdueDays - 发货后多少天仍未收视为逾期（默认 30）
 */
const getOverdueReceivables = async (overdueDays = 30) => {
  const cutoff = new Date(Date.now() - overdueDays * 24 * 60 * 60 * 1000);

  const overdue = await prisma.salesContract.findMany({
    where: {
      shippedAt: { not: null, lte: cutoff },
      // 仍有未收余额：receivedAmount < totalAmount
      NOT: { status: 'CANCELLED' },
    },
    select: {
      id: true,
      contractNo: true,
      totalAmount: true,
      receivedAmount: true,
      shippedAt: true,
      status: true,
    },
    orderBy: { shippedAt: 'asc' },
  });

  // 过滤出真正有未收余额的合同
  return overdue
    .filter((c) => c.receivedAmount < c.totalAmount)
    .map((c) => ({
      id: c.id,
      contractNo: c.contractNo,
      totalAmount: c.totalAmount,
      receivedAmount: c.receivedAmount,
      unreceived: c.totalAmount - c.receivedAmount,
      shippedAt: c.shippedAt,
      overdueDays: Math.floor((Date.now() - new Date(c.shippedAt).getTime()) / (24 * 60 * 60 * 1000)) - overdueDays,
      status: c.status,
    }));
};

module.exports = {
  listPayments,
  createPayment,
  listUnallocatedPayments,
  allocatePaymentToContracts,
  getPayables,
  getReceivables,
  getStats,
  getPaymentTrends,
  getOverdueReceivables,
};
