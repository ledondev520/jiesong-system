/**
 * Input: 出口合同当前状态与目标状态（支持历史别名）
 * Output: 规范状态与单向流转校验结果
 * Pos: 出口合同状态的权威契约
 *
 * 出口流转：DRAFT -> CONFIRMED -> PACKING -> SHIPPED -> ARRIVED -> COMPLETED
 */

const { SALES_STATUS } = require('../config/constants');

const LEGACY_STATUS_ALIASES = Object.freeze({
  PENDING_SHIPMENT: SALES_STATUS.PACKING,
  OUT_STOCK: SALES_STATUS.SHIPPED,
  PAID: SALES_STATUS.COMPLETED,
  DELIVERED: SALES_STATUS.ARRIVED,
});

const VALID_TRANSITIONS = Object.freeze({
  [SALES_STATUS.DRAFT]: [SALES_STATUS.CONFIRMED, SALES_STATUS.CANCELLED],
  [SALES_STATUS.CONFIRMED]: [SALES_STATUS.PACKING, SALES_STATUS.CANCELLED],
  [SALES_STATUS.PACKING]: [SALES_STATUS.SHIPPED, SALES_STATUS.CANCELLED],
  [SALES_STATUS.SHIPPED]: [SALES_STATUS.ARRIVED],
  [SALES_STATUS.ARRIVED]: [SALES_STATUS.COMPLETED],
  [SALES_STATUS.COMPLETED]: [],
  [SALES_STATUS.CANCELLED]: [],
});

const normalizeSalesStatus = (status) => {
  if (typeof status !== 'string') return null;
  const normalized = status.trim().toUpperCase();
  return LEGACY_STATUS_ALIASES[normalized] || normalized;
};

const validateSalesTransition = (currentStatus, nextStatus) => {
  const normalizedCurrent = normalizeSalesStatus(currentStatus);
  const normalizedNext = normalizeSalesStatus(nextStatus);

  if (!Object.values(SALES_STATUS).includes(normalizedNext)) {
    return { valid: false, message: `不支持的销售合同状态: ${nextStatus}` };
  }
  if (!Object.values(SALES_STATUS).includes(normalizedCurrent)) {
    return { valid: false, message: `不支持的当前销售合同状态: ${currentStatus}` };
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
  SALES_STATUS,
  normalizeSalesStatus,
  validateSalesTransition,
};
