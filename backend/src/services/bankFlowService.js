/**
 * Input: Prisma client、BankTransaction / FinanceDataBatch 模型
 * Output: 银行流水查询、导入、统计接口
 * Pos: 财务模块-银行流水业务逻辑层
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');

const COMPANY = '上海捷淞国际物流有限公司';

/**
 * 职责：分页查询银行流水
 * @param {object} filters - 筛选条件
 * @param {number} page
 * @param {number} pageSize
 * @returns {{ items, total }}
 */
async function listTransactions({ search, direction, dateFrom, dateTo, batchId, currency = 'CNY', accountNoMasked, page = 1, pageSize = 20 }) {
  const where = buildTxnWhere({ search, direction, dateFrom, dateTo, batchId, currency, accountNoMasked });

  const [items, total] = await Promise.all([
    prisma.bankTransaction.findMany({
      where,
      orderBy: { txnTime: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { batch: { select: { fileName: true, importedAt: true } } },
    }),
    prisma.bankTransaction.count({ where }),
  ]);

  return { items, total };
}

/**
 * 职责：构建银行流水通用筛选条件
 * @param {object} filters - search, direction, dateFrom, dateTo, batchId
 * @returns {object} Prisma where clause
 */
function buildTxnWhere({ search, direction, dateFrom, dateTo, batchId, currency, accountNoMasked } = {}) {
  const where = {};
  if (direction) where.direction = direction;
  if (batchId) where.batchId = batchId;
  if (currency) where.currency = String(currency).toUpperCase();
  if (accountNoMasked) where.accountNoMasked = accountNoMasked;
  if (dateFrom || dateTo) {
    where.txnDate = {};
    if (dateFrom) where.txnDate.gte = dateFrom;
    if (dateTo) where.txnDate.lte = dateTo;
  }
  if (search) {
    where.OR = [
      { counterpart: { contains: search } },
      { summary: { contains: search } },
      { txnId: { contains: search } },
    ];
  }
  return where;
}

/**
 * 职责：获取银行流水统计摘要（支持全部筛选条件）
 * @param {object} filters - search, direction, dateFrom, dateTo, batchId
 * @returns {{ totalIn, totalOut, netFlow, txnCount }}
 */
async function getStats(filters = {}) {
  const currency = String(filters.currency || 'CNY').toUpperCase();
  const baseWhere = buildTxnWhere({ ...filters, currency });

  // 若筛选了单方向，仅统计该方向
  const inResult = await prisma.bankTransaction.aggregate({
    where: { ...baseWhere, ...(!filters.direction || filters.direction === 'IN' ? { direction: 'IN' } : { id: '__impossible__' }) },
    _sum: { amount: true },
    _count: true,
  });
  const outResult = await prisma.bankTransaction.aggregate({
    where: { ...baseWhere, ...(!filters.direction || filters.direction === 'OUT' ? { direction: 'OUT' } : { id: '__impossible__' }) },
    _sum: { amount: true },
    _count: true,
  });

  const totalIn = inResult._sum.amount || 0;
  const totalOut = Math.abs(outResult._sum.amount || 0);

  return {
    totalIn,
    totalOut,
    netFlow: totalIn - totalOut,
    txnCount: (inResult._count || 0) + (outResult._count || 0),
    currency,
  };
}

/**
 * 职责：获取所有导入批次信息
 * @returns {Array} batches
 */
async function listBatches(type) {
  const where = type ? { type } : {};
  return prisma.financeDataBatch.findMany({
    where,
    orderBy: { importedAt: 'desc' },
    include: {
      _count: { select: { bankTransactions: true, invoiceRecords: true } },
    },
  });
}

/**
 * 职责：按对方名称汇总银行流水
 * @param {object} opts - limit
 * @returns {Array} 按交易总额降序排列的对方汇总
 */
async function groupByCounterpart({ dateFrom, dateTo, limit = 50, currency = 'CNY' } = {}) {
  const where = { currency: String(currency).toUpperCase() };
  if (dateFrom || dateTo) {
    where.txnDate = {};
    if (dateFrom) where.txnDate.gte = dateFrom;
    if (dateTo) where.txnDate.lte = dateTo;
  }
  where.counterpart = { not: '' };

  const groups = await prisma.bankTransaction.groupBy({
    by: ['counterpart', 'direction'],
    where,
    _sum: { amount: true },
    _count: true,
  });

  // 0. 将 IN/OUT 合并到同一对方名下
  const map = {};
  for (const g of groups) {
    const name = g.counterpart || '(未知)';
    if (!map[name]) map[name] = { counterpart: name, totalIn: 0, totalOut: 0, inCount: 0, outCount: 0 };
    if (g.direction === 'IN') {
      map[name].totalIn += g._sum.amount || 0;
      map[name].inCount += g._count;
    } else {
      map[name].totalOut += Math.abs(g._sum.amount || 0);
      map[name].outCount += g._count;
    }
  }

  return Object.values(map)
    .map(r => ({ ...r, netFlow: r.totalIn - r.totalOut, txnCount: r.inCount + r.outCount }))
    .sort((a, b) => b.totalOut - a.totalOut)
    .slice(0, limit);
}

/**
 * 职责：规范化公司名称用于匹配
 * 思路：统一全角/半角括号、空格、大小写等干扰字符
 */
function normalizeName(name) {
  return (name || '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * 职责：执行全量对账分析（银行流水 vs 发票按对方/销方名称汇总匹配）
 * 思路：
 *   0. 获取所有银行流水，按 counterpart 汇总收入/支出
 *   1. 获取所有有效发票，按 seller 汇总价税合计
 *   2. 双向匹配：流水对方 <-> 发票销方（规范化名称后匹配）
 *   3. 分类：已匹配(缺票/多开票/正常)、仅有流水无票、仅有发票无流水
 * @returns {{ matched, unmatchedPayments, unmatchedInvoices, summary }}
 */
async function runReconciliation() {
  // 0. 获取全量银行流水（按 counterpart 汇总）
  const allTxns = await prisma.bankTransaction.findMany({
    where: { currency: 'CNY' },
    select: { counterpart: true, direction: true, amount: true },
  });

  const payMap = {};
  for (const t of allTxns) {
    const name = (t.counterpart || '').trim();
    if (!name || name === COMPANY) continue;
    if (!payMap[name]) payMap[name] = { totalOut: 0, totalIn: 0, outCount: 0, inCount: 0 };
    if (t.direction === 'OUT') {
      payMap[name].totalOut += Math.abs(t.amount);
      payMap[name].outCount++;
    } else {
      payMap[name].totalIn += t.amount;
      payMap[name].inCount++;
    }
  }

  // 1. 获取全量有效发票（按 seller 汇总）
  const allInvs = await prisma.invoiceRecord.findMany({
    where: { status: '正常', isPositive: '是' },
    select: { seller: true, total: true, tax: true },
  });

  const invMap = {};
  for (const inv of allInvs) {
    const name = (inv.seller || '').trim();
    if (!name || name === COMPANY) continue;
    if (!invMap[name]) invMap[name] = { totalInvoice: 0, totalTax: 0, invCount: 0 };
    invMap[name].totalInvoice += inv.total;
    invMap[name].totalTax += inv.tax;
    invMap[name].invCount++;
  }

  // 2. 构建规范化名称索引以解决全角/半角差异
  const normInvMap = {};
  for (const iName of Object.keys(invMap)) {
    normInvMap[normalizeName(iName)] = iName;
  }

  // 3. 匹配（规范化精确 -> 规范化包含）
  const matchedSet = new Set();
  const matched = [];

  for (const [payName, pay] of Object.entries(payMap)) {
    const netPaid = pay.totalOut - pay.totalIn;
    if (netPaid <= 1) continue;

    const normPay = normalizeName(payName);
    let invName = null;

    // 3.1. 规范化精确匹配
    if (normInvMap[normPay]) {
      invName = normInvMap[normPay];
    } else if (invMap[payName]) {
      invName = payName;
    } else {
      // 3.2. 规范化包含匹配
      for (const [normInv, origInv] of Object.entries(normInvMap)) {
        if (normPay.includes(normInv) || normInv.includes(normPay)) {
          invName = origInv;
          break;
        }
      }
    }

    if (invName) {
      const inv = invMap[invName];
      const gap = netPaid - inv.totalInvoice;
      const gapPct = netPaid > 0 ? (gap / netPaid) * 100 : 0;

      let category = 'normal';
      if (gap > 100) category = 'under_invoiced';
      else if (gap < -100) category = 'over_invoiced';

      matched.push({
        payName,
        invName: invName !== payName ? invName : undefined,
        netPaid: Math.round(netPaid * 100) / 100,
        totalInvoice: Math.round(inv.totalInvoice * 100) / 100,
        totalTax: Math.round(inv.totalTax * 100) / 100,
        gap: Math.round(gap * 100) / 100,
        gapPct: Math.round(gapPct * 10) / 10,
        category,
        txnCount: pay.outCount + pay.inCount,
        invCount: inv.invCount,
      });

      matchedSet.add(payName);
      matchedSet.add(invName);
    }
  }

  // 3. 未匹配的付款（仅有流水无票）
  const unmatchedPayments = [];
  for (const [name, pay] of Object.entries(payMap)) {
    if (matchedSet.has(name)) continue;
    const netPaid = pay.totalOut - pay.totalIn;
    if (netPaid <= 1) continue;
    unmatchedPayments.push({
      counterpart: name,
      netPaid: Math.round(netPaid * 100) / 100,
      txnCount: pay.outCount + pay.inCount,
    });
  }

  // 4. 未匹配的发票（仅有发票无流水）
  const unmatchedInvoices = [];
  for (const [name, inv] of Object.entries(invMap)) {
    if (matchedSet.has(name)) continue;
    unmatchedInvoices.push({
      seller: name,
      totalInvoice: Math.round(inv.totalInvoice * 100) / 100,
      invCount: inv.invCount,
    });
  }

  // 5. 排序
  matched.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  unmatchedPayments.sort((a, b) => b.netPaid - a.netPaid);
  unmatchedInvoices.sort((a, b) => b.totalInvoice - a.totalInvoice);

  // 6. 汇总
  const underInvoiced = matched.filter(m => m.category === 'under_invoiced');
  const overInvoiced = matched.filter(m => m.category === 'over_invoiced');
  const normalMatched = matched.filter(m => m.category === 'normal');

  return {
    matched,
    unmatchedPayments,
    unmatchedInvoices,
    summary: {
      matchedCount: matched.length,
      normalCount: normalMatched.length,
      underInvoicedCount: underInvoiced.length,
      underInvoicedGap: Math.round(underInvoiced.reduce((s, m) => s + m.gap, 0) * 100) / 100,
      overInvoicedCount: overInvoiced.length,
      overInvoicedGap: Math.round(overInvoiced.reduce((s, m) => s + Math.abs(m.gap), 0) * 100) / 100,
      unmatchedPaymentCount: unmatchedPayments.length,
      unmatchedPaymentTotal: Math.round(unmatchedPayments.reduce((s, p) => s + p.netPaid, 0) * 100) / 100,
      unmatchedInvoiceCount: unmatchedInvoices.length,
      unmatchedInvoiceTotal: Math.round(unmatchedInvoices.reduce((s, i) => s + i.totalInvoice, 0) * 100) / 100,
    },
  };
}

/**
 * 职责：聚合银行流水收入按对手方汇总（用于应收 fallback）
 * @returns {{ items: Array<{ name, totalIn, txnCount }>, total: number }}
 */
async function getIncomingSummary() {
  const txns = await prisma.bankTransaction.findMany({
    where: { direction: 'IN', currency: 'USD' },
    select: { counterpart: true, amount: true },
  });

  const map = {};
  let total = 0;
  for (const t of txns) {
    const name = (t.counterpart || '').trim();
    if (!name || name === COMPANY) continue;
    if (!map[name]) map[name] = { totalIn: 0, txnCount: 0 };
    map[name].totalIn += t.amount;
    map[name].txnCount++;
    total += t.amount;
  }

  const items = Object.entries(map)
    .map(([name, v]) => ({
      name,
      totalIn: Math.round(v.totalIn * 100) / 100,
      txnCount: v.txnCount,
    }))
    .sort((a, b) => b.totalIn - a.totalIn);

  return { items, total: Math.round(total * 100) / 100 };
}

module.exports = { listTransactions, getStats, listBatches, groupByCounterpart, runReconciliation, getIncomingSummary };
