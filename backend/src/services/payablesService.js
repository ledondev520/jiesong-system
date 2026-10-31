/**
 * Input: 采购合同行（status/totalAmount/paidAmount/expectedDate）
 * Output: 唯一的应付口径：已生效合同的未付余额、总额、已付与逾期
 * Pos: 首页、财务概览、经营执行、付款列表、AI 上下文与导出共用；前端只展示结果
 *
 * 口径（负责人决定 12）：
 *   生效 = SIGNED/PRODUCING/READY/SHIPPED/RECEIVED/COMPLETED；DRAFT、CANCELLED 永不计入。
 *   单合同应付 = max(totalAmount − paidAmount, 0)，多付按 0（不抵减其他合同）。
 *   逾期 = 应付 > 0 且 expectedDate 早于当前时刻（沿用此前经营执行使用的字段）。
 *   金额为 CNY，逐合同按分取整后相加。
 */
const { PURCHASE_STATUS } = require('../config/constants');

const PAYABLE_STATUSES = [
  PURCHASE_STATUS.SIGNED,
  PURCHASE_STATUS.PRODUCING,
  PURCHASE_STATUS.READY,
  PURCHASE_STATUS.SHIPPED,
  PURCHASE_STATUS.RECEIVED,
  PURCHASE_STATUS.COMPLETED,
];

const PAYABLE_SELECT = { id: true, status: true, totalAmount: true, paidAmount: true, expectedDate: true };

const toCents = (value) => Math.round((Number(value) || 0) * 100);
const isInEffect = (contract) => PAYABLE_STATUSES.includes(contract?.status);

/** Prisma where 片段：只取已生效合同（Prisma 查询与 isInEffect 必须同源）。 */
const payableWhere = () => ({ status: { in: PAYABLE_STATUSES } });

/** 单合同应付余额（元）；未生效合同恒为 0。 */
const outstandingOf = (contract) => (
  isInEffect(contract)
    ? Math.max(toCents(contract.totalAmount) - toCents(contract.paidAmount), 0) / 100
    : 0
);

/**
 * 汇总应付。传入的行可以含任意状态，函数自己剔除未生效合同。
 * @returns {{total:number, paid:number, unpaid:number, overdue:number, contractCount:number}}
 */
const summarizePayables = (contracts = [], now = new Date()) => {
  let total = 0; let paid = 0; let unpaid = 0; let overdue = 0; let contractCount = 0;
  for (const contract of contracts) {
    if (!isInEffect(contract)) continue;
    const outstanding = toCents(outstandingOf(contract));
    contractCount += 1;
    total += toCents(contract.totalAmount);
    paid += toCents(contract.paidAmount);
    unpaid += outstanding;
    if (outstanding > 0 && contract.expectedDate && new Date(contract.expectedDate) < now) overdue += outstanding;
  }
  return { total: total / 100, paid: paid / 100, unpaid: unpaid / 100, overdue: overdue / 100, contractCount };
};

/** 读取已生效合同并汇总；db 可传事务客户端。 */
const getPayablesSummary = async (db = require('../utils/prisma'), now = new Date()) => (
  summarizePayables(
    await db.purchaseContract.findMany({ where: payableWhere(), select: PAYABLE_SELECT }),
    now,
  )
);

module.exports = { PAYABLE_STATUSES, PAYABLE_SELECT, payableWhere, outstandingOf, summarizePayables, getPayablesSummary };
