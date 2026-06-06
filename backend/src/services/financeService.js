/**
 * Input: 财务请求参数
 * Output: 付款记录与应收应付统计
 * Pos: 财务业务服务层，负责幂等写入与聚合计算
 */

const prisma = require('../utils/prisma');

const PAYMENT_TYPES = {
  PAYABLE: 'PAYABLE',
  PAYABLE_PAYMENT: 'PAYABLE_PAYMENT',
  RECEIVABLE: 'RECEIVABLE',
  RECEIVABLE_RECEIPT: 'RECEIVABLE_RECEIPT',
  RECEIVABLE_RECEIPT_ALLOCATED: 'RECEIVABLE_RECEIPT_ALLOCATED',
  RECEIVABLE_COLLECTION: 'RECEIVABLE_COLLECTION',
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
};

const PAYABLE_FLOW_TYPES = new Set([
  PAYMENT_TYPES.PAYABLE,
  PAYMENT_TYPES.PAYABLE_PAYMENT,
  PAYMENT_TYPES.EXPENSE,
]);

const RECEIVABLE_FLOW_TYPES = new Set([
  PAYMENT_TYPES.RECEIVABLE,
  PAYMENT_TYPES.RECEIVABLE_COLLECTION,
  PAYMENT_TYPES.INCOME,
]);

const RECEIVABLE_SETTLEMENT_TYPES = [
  PAYMENT_TYPES.RECEIVABLE,
  PAYMENT_TYPES.RECEIVABLE_COLLECTION,
  PAYMENT_TYPES.INCOME,
];

const RECEIPT_POOL_TYPES = new Set([
  PAYMENT_TYPES.RECEIVABLE_RECEIPT,
  PAYMENT_TYPES.INCOME,
]);

const DEFAULT_RECEIVABLE_CUSTOMER_NAME = 'Sp food trading LLC';
const AUTO_MATCH_RULE = 'exact_contract_no_and_full_amount';
const AUTO_MATCH_CONFIDENCE = 'high';
const AUTO_MATCH_AMOUNT_TOLERANCE = 0.01;

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
  sourcePayment: true,
};

const OWNERSHIP_EXCLUSION_KEYWORDS = [
  '非捷淞报关',
  '拼船',
  '他方自行报关',
  '共用发票',
];

const withDefaultCustomerName = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || DEFAULT_RECEIVABLE_CUSTOMER_NAME;
};

const getReceiptAllocationTotals = async (receiptIds, db = prisma) => {
  if (!Array.isArray(receiptIds) || receiptIds.length === 0) {
    return new Map();
  }

  const grouped = await db.payment.groupBy({
    by: ['sourcePaymentId'],
    where: {
      sourcePaymentId: { in: receiptIds },
      type: PAYMENT_TYPES.RECEIVABLE_COLLECTION,
    },
    _sum: { amount: true },
  });

  return new Map(
    grouped.map((row) => [row.sourcePaymentId, Number(row._sum.amount || 0)]),
  );
};

const isJiesongOwnedPackingItem = (item) => {
  if (typeof item?.isOwnedByJiesong === 'boolean') {
    return item.isOwnedByJiesong;
  }

  const note = String(item?.note || '');
  return !OWNERSHIP_EXCLUSION_KEYWORDS.some((keyword) => note.includes(keyword));
};

const getEffectiveSalesContractTotal = (contract) => {
  if (!Array.isArray(contract?.packingItems) || contract.packingItems.length === 0) {
    return Number(contract?.totalAmount || 0);
  }

  const excludedAmount = contract.packingItems.reduce((sum, item) => {
    if (isJiesongOwnedPackingItem(item)) {
      return sum;
    }
    return sum + Number(item.totalPrice || 0);
  }, 0);

  return Number(Math.max(Number(contract.totalAmount || 0) - excludedAmount, 0).toFixed(2));
};

const getOwnedStores = (packingItems = [], port) => {
  const storeMap = new Map();
  packingItems.forEach((item) => {
    if (!isJiesongOwnedPackingItem(item)) {
      return;
    }
    if (item.store && !storeMap.has(item.store.id)) {
      storeMap.set(item.store.id, item.store.name);
    }
  });

  const stores = Array.from(storeMap.values());
  if (stores.length > 0) {
    return stores;
  }
  if (port?.name) {
    return [port.name];
  }
  return [];
};

const getThirdPartySources = (packingItems = []) => {
  return Array.from(new Set(
    packingItems
      .filter((item) => !isJiesongOwnedPackingItem(item))
      .map((item) => item.sourceParty || '第三方拼柜')
      .filter(Boolean),
  ));
};

const getPaymentAllocatedAmount = async (paymentId, db = prisma) => {
  const total = await db.payment.aggregate({
    where: {
      sourcePaymentId: paymentId,
      type: PAYMENT_TYPES.RECEIVABLE_COLLECTION,
    },
    _sum: { amount: true },
  });
  return Number(total._sum.amount || 0);
};

const attachReceiptBalance = (payment, allocationTotals = new Map()) => {
  if (!payment || !RECEIPT_POOL_TYPES.has(payment.type)) {
    return payment;
  }

  const allocatedAmount = Number(allocationTotals.get(payment.id) || 0);
  const remainingAmount = Math.max(Number(payment.amount || 0) - allocatedAmount, 0);

  return {
    ...payment,
    customerName: withDefaultCustomerName(payment.customerName),
    allocatedAmount,
    remainingAmount,
  };
};

const normalizePaymentForRead = (payment) => {
  if (!payment) {
    return payment;
  }

  if (!payment.salesContractId && !payment.purchaseContractId) {
    if (payment.type === PAYMENT_TYPES.INCOME) {
      return {
        ...payment,
        type: PAYMENT_TYPES.RECEIVABLE_RECEIPT,
        customerName: withDefaultCustomerName(payment.customerName),
      };
    }
  }

  if (PAYABLE_FLOW_TYPES.has(payment.type)) {
    return { ...payment, type: PAYMENT_TYPES.PAYABLE };
  }

  if (
    payment.type === PAYMENT_TYPES.RECEIVABLE
    || payment.type === PAYMENT_TYPES.RECEIVABLE_COLLECTION
  ) {
    return {
      ...payment,
      type: PAYMENT_TYPES.RECEIVABLE,
      customerName: payment.customerName || payment.sourcePayment?.customerName || null,
    };
  }

  return payment;
};

const buildPaymentListWhere = (type) => {
  if (!type) {
    return {};
  }

  if (type === PAYMENT_TYPES.PAYABLE) {
    return { type: { in: Array.from(PAYABLE_FLOW_TYPES) } };
  }

  if (type === PAYMENT_TYPES.RECEIVABLE) {
    return {
      type: {
        in: [
          PAYMENT_TYPES.RECEIVABLE,
          PAYMENT_TYPES.RECEIVABLE_COLLECTION,
          PAYMENT_TYPES.INCOME,
        ],
      },
    };
  }

  if (type === PAYMENT_TYPES.RECEIVABLE_RECEIPT) {
    return {
      OR: Array.from(RECEIPT_POOL_TYPES).map((receiptType) => ({
        type: receiptType,
        salesContractId: null,
        purchaseContractId: null,
      })),
    };
  }

  return { type };
};

const extractSalesContractRefs = (note) => {
  if (typeof note !== 'string') {
    return [];
  }

  return Array.from(new Set((note.toUpperCase().match(/EXP\d{5,}/g) || [])));
};

const evaluateMatch = (payment, contract) => {
  if (!contract || contract.status === 'CANCELLED') {
    return { matched: false, reason: 'contract_not_found' };
  }

  const unreceivedAmount = Math.max((contract.totalAmount || 0) - (contract.receivedAmount || 0), 0);
  if (unreceivedAmount <= 0) {
    return { matched: false, reason: 'contract_fully_received' };
  }

  const candidateAmount = Number(payment.remainingAmount ?? payment.amount ?? 0);
  if (Math.abs(unreceivedAmount - candidateAmount) > AUTO_MATCH_AMOUNT_TOLERANCE) {
    return { matched: false, reason: 'amount_mismatch' };
  }

  return {
    matched: true,
    contract,
    rule: AUTO_MATCH_RULE,
    confidence: AUTO_MATCH_CONFIDENCE,
  };
};

const findAutoMatchCandidate = async (payment) => {
  const contractRefs = extractSalesContractRefs(payment.note);

  if (contractRefs.length === 0) {
    return { matched: false, reason: 'no_contract_reference' };
  }

  if (contractRefs.length > 1) {
    return { matched: false, reason: 'multiple_contract_references' };
  }

  const contract = await prisma.salesContract.findUnique({
    where: { contractNo: contractRefs[0] },
    select: {
      id: true,
      contractNo: true,
      totalAmount: true,
      receivedAmount: true,
      status: true,
    },
  });

  return evaluateMatch(payment, contract);
};

/**
 * 批量自动匹配（消除 N+1）
 */
const findAutoMatchCandidatesBatch = async (payments) => {
  // 1. 提取所有唯一合同编号
  const refMap = new Map();
  payments.forEach((payment) => {
    const refs = extractSalesContractRefs(payment.note);
    if (refs.length === 1) {
      refMap.set(refs[0], payment);
    }
  });

  if (refMap.size === 0) return new Map();

  // 2. 一次性查询所有候选合同
  const contracts = await prisma.salesContract.findMany({
    where: {
      contractNo: { in: Array.from(refMap.keys()) },
      status: { not: 'CANCELLED' },
    },
    select: {
      id: true,
      contractNo: true,
      totalAmount: true,
      receivedAmount: true,
      status: true,
    },
  });

  const contractByNo = new Map(contracts.map((c) => [c.contractNo, c]));

  // 3. 内存中完成匹配评估
  const results = new Map();
  for (const [contractNo, payment] of refMap) {
    const contract = contractByNo.get(contractNo);
    results.set(payment.id, evaluateMatch(payment, contract));
  }

  return results;
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
      where: {
        salesContractId,
        type: { in: RECEIVABLE_SETTLEMENT_TYPES },
      },
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
    where: buildPaymentListWhere(PAYMENT_TYPES.RECEIVABLE_RECEIPT),
    orderBy: { paymentDate: 'desc' },
  });
  const allocationTotals = await getReceiptAllocationTotals(payments.map((payment) => payment.id));

  return payments
    .map((payment) => attachReceiptBalance(normalizePaymentForRead(payment), allocationTotals))
    .filter((payment) => Number(payment.remainingAmount || 0) > AUTO_MATCH_AMOUNT_TOLERANCE);
};

/**
 * 职责：对收款池执行高置信度自动匹配
 * 思路：
 *   1. 仅处理未关联合同的待分配收款
 *   2. 备注里必须命中唯一 EXP 合同号
 *   3. 到账金额必须与合同待收金额完全一致（允许极小浮点误差）
 *   4. 命中后复用现有分配逻辑；其余收款继续留在池中
 */
const autoMatchUnallocatedPayments = async () => {
  const payments = await prisma.payment.findMany({
    where: buildPaymentListWhere(PAYMENT_TYPES.RECEIVABLE_RECEIPT),
    orderBy: { paymentDate: 'desc' },
    select: {
      id: true,
      type: true,
      amount: true,
      currency: true,
      note: true,
      paymentDate: true,
    },
  });
  const allocationTotals = await getReceiptAllocationTotals(payments.map((payment) => payment.id));

  const matched = [];
  const skipped = [];

  // 批量匹配（消除 N+1：一次查询替代多次 findUnique）
  const candidates = await findAutoMatchCandidatesBatch(
    payments.map((p) => attachReceiptBalance(p, allocationTotals))
  );

  for (const payment of payments) {
    const candidate = candidates.get(payment.id) || { matched: false, reason: 'no_contract_reference' };

    if (!candidate.matched) {
      skipped.push({ paymentId: payment.id, reason: candidate.reason });
      continue;
    }

    await allocatePaymentToContracts(payment.id, [{
      salesContractId: candidate.contract.id,
      amount: Number(payment.amount),
      note: `自动匹配 ${candidate.contract.contractNo} [${candidate.rule}]`,
    }]);

    matched.push({
      paymentId: payment.id,
      salesContractId: candidate.contract.id,
      contractNo: candidate.contract.contractNo,
      amount: Number(payment.amount),
      rule: candidate.rule,
      confidence: candidate.confidence,
    });
  }

  return {
    inspectedCount: payments.length,
    matchedCount: matched.length,
    skippedCount: skipped.length,
    matched,
    skipped,
  };
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
  if (!RECEIPT_POOL_TYPES.has(receipt.type)) throw new Error('该记录不是待分配收款');

  const allocatedBefore = await getPaymentAllocatedAmount(paymentId);
  const remainingBefore = Math.max(Number(receipt.amount || 0) - allocatedBefore, 0);
  const requestedAmount = allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  if (requestedAmount <= 0) {
    throw new Error('分配金额必须大于 0');
  }
  if (requestedAmount - remainingBefore > AUTO_MATCH_AMOUNT_TOLERANCE) {
    throw new Error('分配金额超出该笔收款剩余可分配金额');
  }

  const result = await prisma.$transaction(async (tx) => {
    const created = [];
    const affectedSalesContractIds = new Set();

    for (const alloc of allocations) {
      const payment = await tx.payment.create({
        data: {
          type: 'RECEIVABLE_COLLECTION',
          salesContractId: alloc.salesContractId,
          sourcePaymentId: paymentId,
          customerName: withDefaultCustomerName(receipt.customerName),
          amount: alloc.amount,
          currency: receipt.currency,
          paymentMethod: receipt.paymentMethod,
          paymentDate: receipt.paymentDate,
          note: alloc.note || `来自收款 #${paymentId.slice(-6)}`,
        },
      });
      created.push(payment);
      affectedSalesContractIds.add(alloc.salesContractId);
    }

    // 批量更新：一次性聚合所有受影响合同的收款总额
    for (const salesContractId of affectedSalesContractIds) {
      const total = await tx.payment.aggregate({
        where: {
          salesContractId,
          type: { in: RECEIVABLE_SETTLEMENT_TYPES },
        },
        _sum: { amount: true },
      });
      await tx.salesContract.update({
        where: { id: salesContractId },
        data: { receivedAmount: total._sum.amount || 0 },
      });
    }

    const allocatedAfter = await getPaymentAllocatedAmount(paymentId, tx);
    const remainingAfter = Math.max(Number(receipt.amount || 0) - allocatedAfter, 0);

    if (remainingAfter <= AUTO_MATCH_AMOUNT_TOLERANCE) {
      // 标记原始到账记录已完成分配，避免继续出现在待分配池中。
      await tx.payment.update({
        where: { id: paymentId },
        data: { type: PAYMENT_TYPES.RECEIVABLE_RECEIPT_ALLOCATED },
      });
    }

    return created;
  });

  return result;
};

const listPayments = async ({ page, pageSize, skip, type }) => {
  const where = buildPaymentListWhere(type);

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
  const allocationTotals = await getReceiptAllocationTotals(payments.map((payment) => payment.id));

  return {
    payments: payments.map((payment) => attachReceiptBalance(normalizePaymentForRead(payment), allocationTotals)),
    total,
  };
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
          sourcePaymentId: data.sourcePaymentId,
          customerName: data.customerName
            ? withDefaultCustomerName(data.customerName)
            : (RECEIPT_POOL_TYPES.has(data.type) ? DEFAULT_RECEIVABLE_CUSTOMER_NAME : null),
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
    const ownedTotalAmount = getEffectiveSalesContractTotal(contract);
    const stores = getOwnedStores(contract.packingItems, contract.port);
    const thirdPartySources = getThirdPartySources(contract.packingItems);

    return {
      ...contract,
      totalAmount: ownedTotalAmount,
      unreceiveAmount: Math.max(ownedTotalAmount - contract.receivedAmount, 0),
      stores,
      hasThirdPartyCargo: thirdPartySources.length > 0,
      sourceParties: thirdPartySources,
      packingItems: undefined,
      port: undefined,
    };
  }).filter((contract) => contract.totalAmount > 0);

  return { receivables, total: receivables.length, page, pageSize };
};

const getStats = async () => {
  const payableStats = await prisma.purchaseContract.aggregate({
    where: { NOT: { status: 'CANCELLED' } },
    _sum: { totalAmount: true, paidAmount: true },
  });

  // 1. 轻量查询销售合同，避免 include packingItems 全表扫描
  const contracts = await prisma.salesContract.findMany({
    where: {
      NOT: { status: 'CANCELLED' },
      totalAmount: { gt: 0 },
    },
    select: {
      id: true,
      totalAmount: true,
      receivedAmount: true,
    },
  });

  if (contracts.length === 0) {
    return {
      payable: {
        total: payableStats._sum.totalAmount || 0,
        paid: payableStats._sum.paidAmount || 0,
        unpaid: (payableStats._sum.totalAmount || 0) - (payableStats._sum.paidAmount || 0),
      },
      receivable: { total: 0, received: 0, unreceived: 0 },
    };
  }

  const contractIds = contracts.map((c) => c.id);

  // 2. 使用 groupBy 按合同聚合 packingItem 总额，替代内存 reduce
  const packingGroups = await prisma.packingItem.groupBy({
    by: ['salesContractId'],
    where: { salesContractId: { in: contractIds } },
    _sum: { totalPrice: true },
  });

  // 3. 使用 groupBy 聚合每个合同的非捷淞拥有 packingItem 总额
  const nonOwnedGroups = await prisma.packingItem.groupBy({
    by: ['salesContractId'],
    where: {
      salesContractId: { in: contractIds },
      isOwnedByJiesong: false,
    },
    _sum: { totalPrice: true },
  });

  const packingTotalMap = new Map(packingGroups.map((g) => [g.salesContractId, Number(g._sum.totalPrice || 0)]));
  const nonOwnedMap = new Map(nonOwnedGroups.map((g) => [g.salesContractId, Number(g._sum.totalPrice || 0)]));

  const receivableTotals = contracts.reduce((acc, contract) => {
    const packingTotal = packingTotalMap.get(contract.id) || 0;
    const nonOwnedTotal = nonOwnedMap.get(contract.id) || 0;

    // 如果合同有 packingItems，effectiveTotal = totalAmount - nonOwnedTotal
    // 因为 recalculateContractStats 保证 totalAmount = sum(all packingItems.totalPrice)
    // 如果没有 packingItems，packingTotal 为 0，此时 effectiveTotal = totalAmount
    const ownedTotalAmount = packingTotal > 0
      ? Math.max(Number(contract.totalAmount || 0) - nonOwnedTotal, 0)
      : Number(contract.totalAmount || 0);

    acc.total += ownedTotalAmount;
    acc.received += Math.min(Number(contract.receivedAmount || 0), ownedTotalAmount);
    return acc;
  }, { total: 0, received: 0 });

  return {
    payable: {
      total: payableStats._sum.totalAmount || 0,
      paid: payableStats._sum.paidAmount || 0,
      unpaid: (payableStats._sum.totalAmount || 0) - (payableStats._sum.paidAmount || 0),
    },
    receivable: {
      total: Number(receivableTotals.total.toFixed(2)),
      received: Number(receivableTotals.received.toFixed(2)),
      unreceived: Number((receivableTotals.total - receivableTotals.received).toFixed(2)),
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
    if (RECEIVABLE_FLOW_TYPES.has(p.type)) {
      entry.receivables += Number(p.amount);
    } else if (PAYABLE_FLOW_TYPES.has(p.type)) {
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
  autoMatchUnallocatedPayments,
  allocatePaymentToContracts,
  getPayables,
  getReceivables,
  getStats,
  getPaymentTrends,
  getOverdueReceivables,
};
