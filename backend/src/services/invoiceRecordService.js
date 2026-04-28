/**
 * Input: Prisma client、InvoiceRecord / FinanceDataBatch 模型
 * Output: 发票查询、统计接口
 * Pos: 财务模块-发票记录业务逻辑层
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');

/**
 * 职责：分页查询发票记录
 * @param {object} filters - 筛选条件
 * @param {number} page
 * @param {number} pageSize
 * @returns {{ items, total }}
 */
async function listInvoices({ search, status, isPositive, dateFrom, dateTo, batchId, page = 1, pageSize = 20 }) {
  const where = buildInvWhere({ search, status, isPositive, dateFrom, dateTo, batchId });

  const [items, total] = await Promise.all([
    prisma.invoiceRecord.findMany({
      where,
      orderBy: { invDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { batch: { select: { fileName: true, importedAt: true } } },
    }),
    prisma.invoiceRecord.count({ where }),
  ]);

  return { items, total };
}

/**
 * 职责：构建发票记录通用筛选条件
 * @param {object} filters - search, status, isPositive, dateFrom, dateTo, batchId
 * @returns {object} Prisma where clause
 */
function buildInvWhere({ search, status, isPositive, dateFrom, dateTo, batchId } = {}) {
  const where = {};
  if (status) where.status = status;
  if (isPositive) where.isPositive = isPositive;
  if (batchId) where.batchId = batchId;
  if (dateFrom || dateTo) {
    where.invDate = {};
    if (dateFrom) where.invDate.gte = dateFrom;
    if (dateTo) where.invDate.lte = dateTo;
  }
  if (search) {
    where.OR = [
      { seller: { contains: search } },
      { buyer: { contains: search } },
      { itemName: { contains: search } },
      { invNo: { contains: search } },
    ];
  }
  return where;
}

/**
 * 职责：获取发票统计摘要（支持全部筛选条件）
 * @param {object} filters - search, status, isPositive, dateFrom, dateTo, batchId
 * @returns {{ validTotal, validTax, validAmount, validCount, reversedCount, totalCount }}
 */
async function getStats(filters = {}) {
  const baseWhere = buildInvWhere(filters);

  // 0. 有效发票 = 状态正常 且 正数（在已筛选的基础上）
  const validWhere = { ...baseWhere };
  if (!filters.status) validWhere.status = '正常';
  if (!filters.isPositive) validWhere.isPositive = '是';
  const validResult = await prisma.invoiceRecord.aggregate({
    where: validWhere,
    _sum: { total: true, tax: true, amount: true },
    _count: true,
  });

  // 1. 已红冲
  const reversedWhere = { ...baseWhere };
  if (!filters.status) reversedWhere.status = { contains: '红冲' };
  const reversedCount = await prisma.invoiceRecord.count({ where: reversedWhere });

  // 2. 全部记录数
  const totalCount = await prisma.invoiceRecord.count({ where: baseWhere });

  return {
    validTotal: validResult._sum.total || 0,
    validTax: validResult._sum.tax || 0,
    validAmount: validResult._sum.amount || 0,
    validCount: validResult._count || 0,
    reversedCount,
    totalCount,
  };
}

/**
 * 职责：按销方汇总有效发票
 * @returns {Array} sellers
 */
async function groupBySeller({ dateFrom, dateTo, limit = 50 } = {}) {
  const where = { status: '正常', isPositive: '是' };
  if (dateFrom || dateTo) {
    where.invDate = {};
    if (dateFrom) where.invDate.gte = dateFrom;
    if (dateTo) where.invDate.lte = dateTo;
  }

  const result = await prisma.invoiceRecord.groupBy({
    by: ['seller'],
    where,
    _sum: { total: true, tax: true },
    _count: true,
    orderBy: { _sum: { total: 'desc' } },
    take: limit,
  });

  return result.map(r => ({
    seller: r.seller,
    total: r._sum.total,
    tax: r._sum.tax,
    count: r._count,
  }));
}

module.exports = { listInvoices, getStats, groupBySeller };
