/**
 * Input: PrismaClient（销售/采购合同、退税单、通知、用户）
 * Output: 出口退税月度提醒（每月5号）与已出货缺发票提醒的生成能力
 * Pos: 出口流程提醒服务，供 exportReminderJob 定时任务与手动触发复用
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { NOTIFICATION_TYPE, ROLES } = require('../config/constants');

// 每月退税申报提醒日（国家税务总局增值税申报期通常为每月1-15日，5号提醒留足准备时间）
const TAX_REFUND_REMINDER_DAY = 5;

// 退税提醒接收角色：管理员 + 财务
const TAX_REFUND_NOTIFY_ROLES = [ROLES.ADMIN, ROLES.FINANCE];
// 缺发票提醒接收角色：管理员 + 财务 + 采购
const INVOICE_NOTIFY_ROLES = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PURCHASE];

/**
 * 职责：查询指定角色的活跃用户 id 列表
 * @param {object} tx Prisma 客户端或事务
 * @param {string[]} roles 角色列表
 * @returns {Promise<string[]>}
 */
const findRecipientIds = async (tx, roles) => {
  const users = await tx.user.findMany({
    where: { isActive: true, role: { in: roles } },
    select: { id: true },
  });
  return users.map((u) => u.id);
};

/**
 * 职责：每月5号生成出口退税申报提醒（幂等：同一用户每自然月一条）
 * 思路：
 *   1. 非提醒日（且未 force）直接跳过
 *   2. 找出上个自然月已发运的出口合同（shippedAt 在上月区间）
 *   3. 统计其中尚未创建退税单的合同，拼入提醒内容
 *   4. 对财务/管理员角色逐用户创建通知（本月已有该类型通知则跳过）
 * @param {object} tx Prisma 客户端（默认全局实例）
 * @param {object} options { now?: Date, force?: boolean }
 * @returns {Promise<{ skipped: boolean, reason?: string, created: number, contracts: number }>}
 */
const runMonthlyTaxRefundReminder = async (tx = prisma, options = {}) => {
  const now = options.now instanceof Date ? new Date(options.now) : new Date();

  // 1. 仅每月提醒日触发（force 用于手动触发/测试）
  if (!options.force && now.getDate() !== TAX_REFUND_REMINDER_DAY) {
    return { skipped: true, reason: 'not-reminder-day', created: 0, contracts: 0 };
  }

  // 2. 上个自然月区间 [prevMonthStart, thisMonthStart)
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const shippedContracts = await tx.salesContract.findMany({
    where: {
      shippedAt: { gte: prevMonthStart, lt: thisMonthStart },
      status: { in: ['SHIPPED', 'ARRIVED', 'COMPLETED'] },
    },
    select: { id: true, contractNo: true, hasTaxRefund: true },
    orderBy: { shippedAt: 'asc' },
  });

  if (shippedContracts.length === 0) {
    return { skipped: true, reason: 'no-shipped-contracts', created: 0, contracts: 0 };
  }

  // 3. 找出尚未创建退税单的合同
  const refunds = await tx.taxRefund.findMany({
    where: { salesContractId: { in: shippedContracts.map((c) => c.id) } },
    select: { salesContractId: true },
  });
  const refundedIds = new Set(refunds.map((r) => r.salesContractId));
  const pendingContracts = shippedContracts.filter((c) => !refundedIds.has(c.id));

  const monthLabel = `${prevMonthStart.getFullYear()}年${prevMonthStart.getMonth() + 1}月`;
  const pendingNos = pendingContracts.map((c) => c.contractNo).slice(0, 5).join('、');
  const title = `出口退税申报提醒：${monthLabel}发运 ${shippedContracts.length} 柜`;
  const content = pendingContracts.length > 0
    ? `${pendingNos}${pendingContracts.length > 5 ? ' 等' : ''} 共 ${pendingContracts.length} 柜尚未创建退税单。请按国家税务总局申报期要求（每月1-15日）整理报关单、发票与收汇资料，完成增值税免抵退税申报。`
    : `上月发运的 ${shippedContracts.length} 柜均已创建退税单，请核对申报材料并在申报期内（每月1-15日）完成提交。`;

  // 4. 对目标角色逐用户创建（本月幂等）
  const recipientIds = await findRecipientIds(tx, TAX_REFUND_NOTIFY_ROLES);
  if (recipientIds.length === 0) {
    return { skipped: true, reason: 'no-recipients', created: 0, contracts: shippedContracts.length };
  }

  const existing = await tx.notification.findMany({
    where: {
      type: NOTIFICATION_TYPE.TAX_REFUND_MONTHLY,
      userId: { in: recipientIds },
      createdAt: { gte: thisMonthStart },
    },
    select: { userId: true },
  });
  const notified = new Set(existing.map((n) => n.userId));

  const rows = recipientIds
    .filter((userId) => !notified.has(userId))
    .map((userId) => ({
      userId,
      type: NOTIFICATION_TYPE.TAX_REFUND_MONTHLY,
      title,
      content,
      link: '/dashboard/tax-refunds',
      metadata: JSON.stringify({
        month: monthLabel,
        shippedCount: shippedContracts.length,
        pendingCount: pendingContracts.length,
      }),
    }));

  if (rows.length > 0) {
    await tx.notification.createMany({ data: rows });
  }

  return { skipped: false, created: rows.length, contracts: shippedContracts.length };
};

/**
 * 职责：生成「货已出但未登记发票号」的催票提醒（幂等：同一用户每天一条）
 * 思路：
 *   1. 找出已发货/已收货/已完成但 invoiceNo 为空的采购合同
 *   2. 拼接合同号+供应商摘要，对管理员/财务/采购角色创建当日通知
 * @param {object} tx Prisma 客户端（默认全局实例）
 * @param {object} options { now?: Date }
 * @returns {Promise<{ skipped: boolean, reason?: string, created: number, contracts: number }>}
 */
const runInvoiceMissingReminder = async (tx = prisma, options = {}) => {
  const now = options.now instanceof Date ? new Date(options.now) : new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  // 1. 货已出但未登记发票号的采购合同
  const missingContracts = await tx.purchaseContract.findMany({
    where: {
      status: { in: ['SHIPPED', 'RECEIVED', 'COMPLETED'] },
      OR: [{ invoiceNo: null }, { invoiceNo: '' }],
    },
    select: {
      id: true,
      contractNo: true,
      supplier: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (missingContracts.length === 0) {
    return { skipped: true, reason: 'no-missing-invoice', created: 0, contracts: 0 };
  }

  const summary = missingContracts
    .slice(0, 5)
    .map((c) => `${c.contractNo}（${c.supplier?.name || '未知供应商'}）`)
    .join('、');
  const title = `${missingContracts.length} 份采购合同待催开发票`;
  const content = `${summary}${missingContracts.length > 5 ? ' 等' : ''} 货已出但未登记发票号。请在合同详情页使用「催开发票」复制开票信息发给供应商，收票后登记发票号。`;

  // 2. 对目标角色逐用户创建（当日幂等）
  const recipientIds = await findRecipientIds(tx, INVOICE_NOTIFY_ROLES);
  if (recipientIds.length === 0) {
    return { skipped: true, reason: 'no-recipients', created: 0, contracts: missingContracts.length };
  }

  const existing = await tx.notification.findMany({
    where: {
      type: NOTIFICATION_TYPE.INVOICE_MISSING,
      userId: { in: recipientIds },
      createdAt: { gte: todayStart },
    },
    select: { userId: true },
  });
  const notified = new Set(existing.map((n) => n.userId));

  const rows = recipientIds
    .filter((userId) => !notified.has(userId))
    .map((userId) => ({
      userId,
      type: NOTIFICATION_TYPE.INVOICE_MISSING,
      title,
      content,
      link: '/dashboard/contracts',
      metadata: JSON.stringify({
        missingCount: missingContracts.length,
        contractIds: missingContracts.slice(0, 20).map((c) => c.id),
      }),
    }));

  if (rows.length > 0) {
    await tx.notification.createMany({ data: rows });
  }

  return { skipped: false, created: rows.length, contracts: missingContracts.length };
};

module.exports = {
  TAX_REFUND_REMINDER_DAY,
  runMonthlyTaxRefundReminder,
  runInvoiceMissingReminder,
};
