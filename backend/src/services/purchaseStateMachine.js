/**
 * Input: 采购合同当前状态与目标状态（支持历史别名）
 * Output: 规范状态与单向流转校验结果
 * Pos: 采购合同状态的权威契约
 *
 * 采购流转：DRAFT -> SIGNED -> PRODUCING -> READY -> SHIPPED -> RECEIVED -> COMPLETED
 */

const { PURCHASE_STATUS } = require('../config/constants');

const LEGACY_STATUS_ALIASES = Object.freeze({
  PENDING_INSPECTION: PURCHASE_STATUS.PRODUCING,
  IN_STOCK: PURCHASE_STATUS.RECEIVED,
});

const VALID_TRANSITIONS = Object.freeze({
  [PURCHASE_STATUS.DRAFT]: [PURCHASE_STATUS.SIGNED, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.SIGNED]: [PURCHASE_STATUS.PRODUCING, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.PRODUCING]: [PURCHASE_STATUS.READY, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.READY]: [PURCHASE_STATUS.SHIPPED, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.SHIPPED]: [PURCHASE_STATUS.RECEIVED, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.RECEIVED]: [PURCHASE_STATUS.COMPLETED, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.COMPLETED]: [],
  [PURCHASE_STATUS.CANCELLED]: [],
});

const normalizePurchaseStatus = (status) => {
  if (typeof status !== 'string') return null;
  const normalized = status.trim().toUpperCase();
  return LEGACY_STATUS_ALIASES[normalized] || normalized;
};

const validatePurchaseTransition = (currentStatus, nextStatus) => {
  const normalizedCurrent = normalizePurchaseStatus(currentStatus);
  const normalizedNext = normalizePurchaseStatus(nextStatus);

  if (!Object.values(PURCHASE_STATUS).includes(normalizedNext)) {
    return { valid: false, message: `不支持的采购合同状态: ${nextStatus}` };
  }
  if (!Object.values(PURCHASE_STATUS).includes(normalizedCurrent)) {
    return { valid: false, message: `不支持的当前采购合同状态: ${currentStatus}` };
  }
  if (normalizedCurrent === normalizedNext) return { valid: true };

  if (!(VALID_TRANSITIONS[normalizedCurrent] || []).includes(normalizedNext)) {
    return {
      valid: false,
      message: `非法状态流转: ${normalizedCurrent} -> ${normalizedNext}`,
    };
  }

  return { valid: true };
};

module.exports = {
  PURCHASE_STATUS,
  normalizePurchaseStatus,
  validatePurchaseTransition,
};
