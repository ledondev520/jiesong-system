/**
 * Input: 采购合同状态机配置
 * Output: 采购合同状态流转规则与校验结果
 * Pos: 约束采购合同状态只能按单向链路变更
 *
 * 采购流转：DRAFT -> PENDING_INSPECTION -> IN_STOCK -> COMPLETED
 */

const PURCHASE_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_INSPECTION: 'PENDING_INSPECTION',
  IN_STOCK: 'IN_STOCK',
  COMPLETED: 'COMPLETED',
};

const VALID_TRANSITIONS = {
  [PURCHASE_STATUS.DRAFT]: [PURCHASE_STATUS.PENDING_INSPECTION],
  [PURCHASE_STATUS.PENDING_INSPECTION]: [PURCHASE_STATUS.IN_STOCK],
  [PURCHASE_STATUS.IN_STOCK]: [PURCHASE_STATUS.COMPLETED],
  [PURCHASE_STATUS.COMPLETED]: [],
};

/**
 * 验证采购合同状态流转是否合法。
 * @param {string} currentStatus 当前状态
 * @param {string} nextStatus 目标状态
 * @returns {{ valid: boolean, message?: string }}
 */
const validatePurchaseTransition = (currentStatus, nextStatus) => {
  if (!Object.values(PURCHASE_STATUS).includes(nextStatus)) {
    return {
      valid: false,
      message: `不支持的采购合同状态: ${nextStatus}`,
    };
  }

  if (currentStatus === nextStatus) {
    return { valid: true };
  }

  if (!Object.values(PURCHASE_STATUS).includes(currentStatus)) {
    return {
      valid: false,
      message: `不支持的当前采购合同状态: ${currentStatus}`,
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
  PURCHASE_STATUS,
  validatePurchaseTransition,
};
