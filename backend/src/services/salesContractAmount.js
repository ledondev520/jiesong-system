/**
 * Input: 出口合同表头金额、金额来源、装箱所有权与收款金额
 * Output: 可用于应收分析的正式销售额、有效收款与安全的派生金额更新
 * Pos: 统一销售金额语义的深 Module；正式合同金额与装箱货值在此分离
 */

const { roundMoney } = require('../utils/money');

const SALES_AMOUNT_SOURCE = Object.freeze({
  DERIVED: 'DERIVED',
  FORMAL_DOCUMENT: 'FORMAL_DOCUMENT',
});

const OWNERSHIP_EXCLUSION_KEYWORDS = Object.freeze([
  '非捷淞报关',
  '拼船',
  '他方自行报关',
  '共用发票',
]);

const isFormalSalesAmount = (contract) => (
  contract?.amountSource === SALES_AMOUNT_SOURCE.FORMAL_DOCUMENT
);

const isJiesongOwnedPackingItem = (item) => {
  if (typeof item?.isOwnedByJiesong === 'boolean') {
    return item.isOwnedByJiesong;
  }

  const note = String(item?.note || '');
  return !OWNERSHIP_EXCLUSION_KEYWORDS.some((keyword) => note.includes(keyword));
};

const getEffectiveSalesContractTotal = (contract) => {
  const contractTotal = Number(contract?.totalAmount || 0);
  if (isFormalSalesAmount(contract)) return contractTotal;
  if (!Array.isArray(contract?.packingItems) || contract.packingItems.length === 0) {
    return contractTotal;
  }

  const excludedAmount = contract.packingItems.reduce((sum, item) => (
    isJiesongOwnedPackingItem(item) ? sum : sum + Number(item.totalPrice || 0)
  ), 0);

  return roundMoney(Math.max(contractTotal - excludedAmount, 0));
};

const getEffectiveSalesReceived = (
  contract,
  ownedTotalAmount = getEffectiveSalesContractTotal(contract),
  receivedAmount = contract?.receivedAmount,
) => {
  // SalesContract.receivedAmount is Jiesong's own USD receipts, never the whole container:
  // clamp to the owned total, do not scale by the ownership ratio (R2 P0-1).
  const received = Math.max(Number(receivedAmount) || 0, 0);
  const owned = Math.max(Number(ownedTotalAmount) || 0, 0);
  return roundMoney(Math.min(received, owned));
};

// 查询选择：让 getEffectiveSalesContractTotal 能判断来源并扣除第三方装箱货值。
// totalAmount 对 DERIVED 合同是整柜货值；捷淞自有额由本模块按装箱归属推导，库中无单独列。
const SALES_OWNED_AMOUNT_SELECT = Object.freeze({
  amountSource: true,
  packingItems: { select: { totalPrice: true, isOwnedByJiesong: true, note: true } },
});

const buildDerivedSalesAmountUpdate = (contract, derivedTotalAmount) => (
  isFormalSalesAmount(contract)
    ? {}
    : { totalAmount: Number(derivedTotalAmount || 0) }
);

// 收款结算容差：差额不超过 0.01 USD 视为已结清（分配、逾期、状态流转共用）
const SETTLEMENT_TOLERANCE = 0.01;

const getOwnedReceivableUsd = (contract) => getEffectiveSalesContractTotal(contract);

// receivedAmount 默认取合同表头原始收款；调用方已折算捷淞自有收款时可显式传入。
const getOutstandingReceivableUsd = (contract, receivedAmount = contract?.receivedAmount) => {
  const owned = getOwnedReceivableUsd(contract);
  const open = roundMoney(owned - getEffectiveSalesReceived(contract, owned, receivedAmount));
  return open > SETTLEMENT_TOLERANCE ? open : 0;
};

const isSalesContractSettled = (contract, receivedAmount) => (
  getOutstandingReceivableUsd(contract, receivedAmount) === 0
);

// 装箱合计：totalAmount 为全部货值，ownedTotalAmount 为捷淞自有货值
const computePackingTotals = (packingItems = []) => {
  const items = Array.isArray(packingItems) ? packingItems : [];
  const sum = (list) => roundMoney(list.reduce((acc, item) => acc + Number(item.totalPrice || 0), 0));
  return {
    totalAmount: sum(items),
    ownedTotalAmount: sum(items.filter(isJiesongOwnedPackingItem)),
  };
};

module.exports = {
  SALES_AMOUNT_SOURCE,
  SETTLEMENT_TOLERANCE,
  computePackingTotals,
  getOutstandingReceivableUsd,
  getOwnedReceivableUsd,
  isSalesContractSettled,
  SALES_OWNED_AMOUNT_SELECT,
  buildDerivedSalesAmountUpdate,
  getEffectiveSalesContractTotal,
  getEffectiveSalesReceived,
  isFormalSalesAmount,
  isJiesongOwnedPackingItem,
};
