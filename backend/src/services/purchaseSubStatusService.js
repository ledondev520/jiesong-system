/**
 * Input: 采购合同行（status/totalAmount/paidAmount）及其采购明细、到货登记合计
 * Output: 每份合同的付款/到货/生产资料子状态 subStatus，只读派生，不写库
 * Pos: 采购列表、应付列表、采购详情共用；让「已完成」不再冒充已付清或已到货（页面只展示本模块的结果）
 *
 * 口径：
 *   payment  NONE（合同额为 0）/ UNPAID / PARTIAL / PAID，逐分比较 paidAmount 与 totalAmount。
 *   arrival  按采购明细逐行比较已登记到货量与订购量（行间不相抵）：NONE / PARTIAL / FULL。
 *            registered=false 表示该合同没有任何到货登记；已收货/已完成却 registered=false 的是历史数据，
 *            状态由人工置位而非逐批到货，页面须如实写「到货未登记」，不得补造到货。
 *   docsComplete 复用 evaluatePurchaseProductionReadiness 的唯一生产资料口径。
 */
const prisma = require('../utils/prisma');
const { toCents } = require('../utils/money');
const { evaluatePurchaseProductionReadiness } = require('./purchaseProductionService');

const EPSILON = 1e-9;

const ITEM_SELECT = {
  id: true, purchaseContractId: true, quantity: true, specification: true,
  boxes: true, grossWeight: true, netWeight: true, volume: true, length: true, width: true, height: true,
};

/** 付款子状态（纯函数）。 */
const paymentState = ({ totalAmount, paidAmount }) => {
  const total = toCents(totalAmount);
  const paid = toCents(paidAmount);
  if (total <= 0) return 'NONE';
  if (paid >= total) return 'PAID';
  return paid > 0 ? 'PARTIAL' : 'UNPAID';
};

/** 到货子状态（纯函数）：arrivedByItem 为 Map(purchaseItemId -> 已登记到货量)。 */
const arrivalState = (items, arrivedByItem) => {
  let ordered = 0; let arrived = 0; let anyArrived = false; let allFull = items.length > 0;
  for (const item of items) {
    const got = arrivedByItem.get(item.id) || 0;
    ordered += item.quantity || 0;
    arrived += got;
    if (got > EPSILON) anyArrived = true;
    if (!((item.quantity || 0) > 0 && got + EPSILON >= item.quantity)) allFull = false;
  }
  const state = allFull ? 'FULL' : anyArrived ? 'PARTIAL' : 'NONE';
  return { state, ordered, arrived, registered: anyArrived };
};

/** 给一页合同附加 subStatus；草稿/已取消是否展示由页面按状态决定。 */
const attachPurchaseSubStatus = async (contracts, db = prisma) => {
  const rows = contracts.filter((contract) => contract && contract.id);
  const ids = rows.map((contract) => contract.id);
  if (ids.length === 0) return contracts;
  const [items, groups] = await Promise.all([
    db.purchaseItem.findMany({ where: { purchaseContractId: { in: ids } }, select: ITEM_SELECT }),
    db.purchaseReceiptItem.groupBy({
      by: ['purchaseItemId'],
      where: { receipt: { purchaseContractId: { in: ids } } },
      _sum: { arrivedQuantity: true },
    }),
  ]);
  const arrivedByItem = new Map(groups.map((group) => [group.purchaseItemId, group._sum.arrivedQuantity || 0]));
  const itemsByContract = new Map();
  for (const item of items) {
    if (!itemsByContract.has(item.purchaseContractId)) itemsByContract.set(item.purchaseContractId, []);
    itemsByContract.get(item.purchaseContractId).push(item);
  }
  return contracts.map((contract) => {
    if (!contract || !contract.id) return contract;
    const own = itemsByContract.get(contract.id) || [];
    return {
      ...contract,
      subStatus: {
        payment: paymentState(contract),
        arrival: arrivalState(own, arrivedByItem),
        docsComplete: evaluatePurchaseProductionReadiness(own).ready,
      },
    };
  });
};

module.exports = { paymentState, arrivalState, attachPurchaseSubStatus };
