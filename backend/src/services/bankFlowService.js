/**
 * Input: Prisma client、BankTransaction / FinanceDataBatch 模型
 * Output: 同币种银行流水查询、导入、统计接口（空币种仍使用默认人民币）
 * Pos: 财务模块-银行流水业务逻辑层
 * 对账口径：单对手方合计走数据库聚合（精确户名）；全量对账先按规范化户名合并，包含匹配需名称≥4字且候选唯一，多别名合并后再比发票。
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const { roundMoney } = require('../utils/money');

const COMPANY = '上海捷淞国际物流有限公司';

/**
 * 职责：分页查询银行流水
 * @param {object} filters - 筛选条件
 * @param {number} page
 * @param {number} pageSize
 * @returns {{ items, total }}
 */
async function listTransactions({ search, counterpartNames, direction, dateFrom, dateTo, batchId, currency = 'CNY', accountNoMasked, amountMin, amountMax, page = 1, pageSize = 20 }) {
  const where = buildTxnWhere({ search, counterpartNames, direction, dateFrom, dateTo, batchId, currency, accountNoMasked, amountMin, amountMax });

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
function buildTxnWhere({ search, counterpartNames, direction, dateFrom, dateTo, batchId, currency, accountNoMasked, amountMin, amountMax } = {}) {
  const where = {};
  if (amountMin !== undefined && amountMin !== '' || amountMax !== undefined && amountMax !== '') {
    const min = amountMin === undefined || amountMin === '' ? 0 : Number(amountMin);
    const max = amountMax === undefined || amountMax === '' ? null : Number(amountMax);
    if (!Number.isFinite(min) || min < 0 || max !== null && (!Number.isFinite(max) || max < min)) {
      throw createError('金额区间无效：金额须非负，最大金额不得小于最小金额', 400);
    }
    where.AND = [{ OR: [
      { amount: { gte: min, ...(max !== null ? { lte: max } : {}) } },
      { amount: { lte: -min, ...(max !== null ? { gte: -max } : {}) } },
    ] }];
  }
  if (direction) where.direction = direction;
  if (batchId) where.batchId = batchId;
  // Blank query values must use the same CNY default as statistics, never all currencies.
  where.currency = String(currency || 'CNY').toUpperCase();
  if (accountNoMasked) where.accountNoMasked = accountNoMasked;
  if (dateFrom || dateTo) {
    where.txnDate = {};
    if (dateFrom) where.txnDate.gte = dateFrom;
    if (dateTo) where.txnDate.lte = dateTo;
  }
  // 精确对方户名（含全角/半角括号变体），不匹配摘要/流水号
  if (Array.isArray(counterpartNames) && counterpartNames.length) where.counterpart = { in: counterpartNames };
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
 * 职责：单个对方户名的收付合计（数据库聚合，不受分页上限影响）
 * 思路：按户名精确（含全角/半角括号变体）过滤，不再用 summary/txnId 子串搜索
 */
function counterpartNameVariants(name) {
  const trimmed = String(name || '').trim();
  const half = trimmed.replace(/（/g, '(').replace(/）/g, ')');
  const full = trimmed.replace(/\(/g, '（').replace(/\)/g, '）');
  return [...new Set([trimmed, half, full])].filter(Boolean);
}

async function getCounterpartTotals({ counterpart, currency = 'CNY' }) {
  const where = buildTxnWhere({ counterpartNames: counterpartNameVariants(counterpart), currency });
  const groups = await prisma.bankTransaction.groupBy({
    by: ['direction'],
    where,
    _sum: { amount: true },
    _count: { _all: true },
  });
  let totalPaid = 0;
  let totalReceived = 0;
  let txnCount = 0;
  for (const g of groups) {
    txnCount += g._count._all;
    if (g.direction === 'OUT') totalPaid += Math.abs(g._sum.amount || 0);
    else totalReceived += g._sum.amount || 0;
  }
  return { totalPaid, totalReceived, txnCount, nameVariants: where.counterpart.in };
}

/**
 * 职责：规范化公司名称用于匹配
 * 思路：统一全角/半角括号、空格、大小写等干扰字符
 */
const MIN_FUZZY_NAME_LENGTH = 4;
// 去掉通用后缀后再比较长度，避免「某某贸易」「有限公司」这类泛词互相包含
const stripGenericSuffix = (name) => name.replace(/股份有限公司|有限责任公司|有限公司|贸易|商行/g, '');

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

  // 按规范化户名先合并（全角/半角括号变体归入同一桶），再做匹配
  const payMap = {};
  for (const t of allTxns) {
    const rawName = (t.counterpart || '').trim();
    if (!rawName || rawName === COMPANY) continue;
    const name = normalizeName(rawName);
    if (!payMap[name]) payMap[name] = { displayName: rawName, totalOut: 0, totalIn: 0, outCount: 0, inCount: 0 };
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
    const rawName = (inv.seller || '').trim();
    if (!rawName || rawName === COMPANY) continue;
    const name = normalizeName(rawName);
    if (!invMap[name]) invMap[name] = { displayName: rawName, totalInvoice: 0, totalTax: 0, invCount: 0 };
    invMap[name].totalInvoice += inv.total;
    invMap[name].totalTax += inv.tax;
    invMap[name].invCount++;
  }

  // 2. 匹配：先规范化精确，再对未命中的付款做包含匹配（要求名称足够长且候选唯一）。
  //    多个付款别名命中同一发票销方时合并为一组再与发票比较，避免同一发票总额被重复计入。
  const claims = new Map(); // invKey -> payKey[]
  const claim = (invKey, payKey) => {
    if (!claims.has(invKey)) claims.set(invKey, []);
    claims.get(invKey).push(payKey);
  };
  const fallbackPays = [];
  for (const [payKey, pay] of Object.entries(payMap)) {
    if (pay.totalOut - pay.totalIn <= 1) continue;
    if (invMap[payKey]) claim(payKey, payKey);
    else fallbackPays.push(payKey);
  }
  for (const payKey of fallbackPays) {
    const candidates = Object.keys(invMap).filter((invKey) => {
      const shorter = payKey.length <= invKey.length ? payKey : invKey;
      const longer = shorter === payKey ? invKey : payKey;
      return stripGenericSuffix(shorter).length >= MIN_FUZZY_NAME_LENGTH && longer.includes(shorter);
    });
    if (candidates.length === 1) claim(candidates[0], payKey);
  }

  const matchedSet = new Set(); // 已匹配的 payMap / invMap 键
  const matched = [];
  for (const [invKey, payKeys] of claims) {
    const inv = invMap[invKey];
    const pays = payKeys.map((k) => payMap[k]);
    const netPaid = pays.reduce((sum, p) => sum + p.totalOut - p.totalIn, 0);
    const gap = netPaid - inv.totalInvoice;
    const gapPct = netPaid > 0 ? (gap / netPaid) * 100 : 0;

    let category = 'normal';
    if (gap > 100) category = 'under_invoiced';
    else if (gap < -100) category = 'over_invoiced';

    const payName = pays.map((p) => p.displayName).join('、');
    matched.push({
      payName,
      invName: inv.displayName !== payName ? inv.displayName : undefined,
      netPaid: roundMoney(netPaid),
      totalInvoice: roundMoney(inv.totalInvoice),
      totalTax: roundMoney(inv.totalTax),
      gap: roundMoney(gap),
      gapPct: Math.round(gapPct * 10) / 10,
      category,
      txnCount: pays.reduce((sum, p) => sum + p.outCount + p.inCount, 0),
      invCount: inv.invCount,
    });
    matchedSet.add(`pay:${invKey}`);
    payKeys.forEach((k) => matchedSet.add(`pay:${k}`));
    matchedSet.add(`inv:${invKey}`);
  }

  // 3. 未匹配的付款（仅有流水无票）
  const unmatchedPayments = [];
  for (const [key, pay] of Object.entries(payMap)) {
    if (matchedSet.has(`pay:${key}`)) continue;
    const netPaid = pay.totalOut - pay.totalIn;
    if (netPaid <= 1) continue;
    unmatchedPayments.push({
      counterpart: pay.displayName,
      netPaid: roundMoney(netPaid),
      txnCount: pay.outCount + pay.inCount,
    });
  }

  // 4. 未匹配的发票（仅有发票无流水）
  const unmatchedInvoices = [];
  for (const [key, inv] of Object.entries(invMap)) {
    if (matchedSet.has(`inv:${key}`)) continue;
    unmatchedInvoices.push({
      seller: inv.displayName,
      totalInvoice: roundMoney(inv.totalInvoice),
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
      underInvoicedGap: roundMoney(underInvoiced.reduce((s, m) => s + m.gap, 0)),
      overInvoicedCount: overInvoiced.length,
      overInvoicedGap: roundMoney(overInvoiced.reduce((s, m) => s + Math.abs(m.gap), 0)),
      unmatchedPaymentCount: unmatchedPayments.length,
      unmatchedPaymentTotal: roundMoney(unmatchedPayments.reduce((s, p) => s + p.netPaid, 0)),
      unmatchedInvoiceCount: unmatchedInvoices.length,
      unmatchedInvoiceTotal: roundMoney(unmatchedInvoices.reduce((s, i) => s + i.totalInvoice, 0)),
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
      totalIn: roundMoney(v.totalIn),
      txnCount: v.txnCount,
    }))
    .sort((a, b) => b.totalIn - a.totalIn);

  return { items, total: roundMoney(total) };
}

module.exports = { listTransactions, getCounterpartTotals, counterpartNameVariants, getStats, listBatches, groupByCounterpart, runReconciliation, getIncomingSummary };
