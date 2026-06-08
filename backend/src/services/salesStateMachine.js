/**
 * Input: 出口合同状态机配置
 * Output: 出口合同状态流转规则与校验结果
 * Pos: 约束销售合同状态只能按单向链路变更
 *
 * 销售流转：DRAFT -> PENDING_SHIPMENT -> OUT_STOCK -> COMPLETED
 */

const SALES_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_SHIPMENT: 'PENDING_SHIPMENT',
  OUT_STOCK: 'OUT_STOCK',
  COMPLETED: 'COMPLETED',
};

const VALID_TRANSITIONS = {
  [SALES_STATUS.DRAFT]: [SALES_STATUS.PENDING_SHIPMENT],
  [SALES_STATUS.PENDING_SHIPMENT]: [SALES_STATUS.OUT_STOCK],
  [SALES_STATUS.OUT_STOCK]: [SALES_STATUS.COMPLETED],
  [SALES_STATUS.COMPLETED]: [],
};

/**
 * 验证销售合同状态流转是否合法。
 * @param {string} currentStatus 当前状态
 * @param {string} nextStatus 目标状态
 * @returns {{ valid: boolean, message?: string }}
 */
const validateSalesTransition = (currentStatus, nextStatus) => {
  if (!Object.values(SALES_STATUS).includes(nextStatus)) {
    return {
      valid: false,
      message: `不支持的销售合同状态: ${nextStatus}`,
    };
  }

  if (currentStatus === nextStatus) {
    return { valid: true };
  }

  if (!Object.values(SALES_STATUS).includes(currentStatus)) {
    return {
      valid: false,
      message: `不支持的当前销售合同状态: ${currentStatus}`,
    };
  }

  const allowedNextStatuses = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowedNextStatuses.includes(nextStatus)) {
    return {
      valid: false,
      message: `非法状态流转: ${currentStatus} -> ${nextStatus}`,
    };
  }

  return { valid: true };
};

module.exports = {
  SALES_STATUS,
  validateSalesTransition,
};
