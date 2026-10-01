/**
 * Input: 库存当前状态、目标状态、库存记录上下文
 * Output: 状态流转校验结果（允许/拒绝与原因）
 * Pos: 库存状态机工具，统一约束库存状态流转规则，业务来源库存由验货/发运驱动
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { INVENTORY_STATUS } = require('../config/constants');

// 状态机白名单：仅允许顺序流转
const VALID_TRANSITIONS = {
  [INVENTORY_STATUS.PRODUCING]: [INVENTORY_STATUS.PACKING],
  [INVENTORY_STATUS.PACKING]: [INVENTORY_STATUS.SHIPPING],
  [INVENTORY_STATUS.SHIPPING]: [INVENTORY_STATUS.INBOUND],
  [INVENTORY_STATUS.INBOUND]: [INVENTORY_STATUS.OUTBOUND],
  [INVENTORY_STATUS.OUTBOUND]: [],
};

/**
 * 职责：判断库存状态流转是否合法。
 * 思路：
 * 1. 校验目标状态是否在系统支持的状态集合中；
 * 2. 校验是否命中白名单允许的下一状态；
 * 3. 对 INBOUND -> OUTBOUND 增加销售合同绑定校验。
 * @param {string} currentStatus 当前库存状态
 * @param {string} nextStatus 目标库存状态
 * @param {{ salesContractId?: string | null }} inventory 库存上下文（用于业务附加约束）
 * @returns {{ valid: boolean, message?: string }} 校验结果
 */
const validateInventoryTransition = (currentStatus, nextStatus, inventory = {}) => {
  // 0. 初始化：快速放行同状态更新，避免无意义报错
  if (currentStatus === nextStatus) {
    return { valid: true };
  }

  if (inventory.purchaseItemId || inventory.receiptInspectionId) {
    return { valid: false, message: '采购来源库存由到货验货与出口发运自动更新，请在对应合同登记业务事实' };
  }

  // 1. 校验目标状态是否受支持
  const supportedStatuses = Object.values(INVENTORY_STATUS);
  if (!supportedStatuses.includes(nextStatus)) {
    return {
      valid: false,
      message: `不支持的库存状态: ${nextStatus}`,
    };
  }

  // 2. 校验是否命中白名单流转
  const allowedNextStatuses = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowedNextStatuses.includes(nextStatus)) {
    return {
      valid: false,
      message: `非法状态流转: ${currentStatus} -> ${nextStatus}`,
    };
  }

  // 3. 业务附加约束：出库前必须绑定出口合同
  if (currentStatus === INVENTORY_STATUS.INBOUND && nextStatus === INVENTORY_STATUS.OUTBOUND) {
    if (!inventory.salesContractId) {
      return {
        valid: false,
        message: '入库记录未绑定出口合同，禁止出库',
      };
    }
  }

  return { valid: true };
};

module.exports = {
  validateInventoryTransition,
};
