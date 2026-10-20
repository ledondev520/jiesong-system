/**
 * Input: 出口合同表头金额、金额来源、装箱所有权与收款金额
 * Output: 可用于应收分析的正式销售额、有效收款与安全的派生金额更新
 * Pos: 统一销售金额语义的深 Module；正式合同金额与装箱货值在此分离
 */

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

  return Number(Math.max(contractTotal - excludedAmount, 0).toFixed(2));
};

const getEffectiveSalesReceived = (
  contract,
  ownedTotalAmount = getEffectiveSalesContractTotal(contract),
  receivedAmount = contract?.receivedAmount,
) => {
  const contractTotal = Number(contract?.totalAmount || 0);
  const received = Number(receivedAmount || 0);
  if (contractTotal <= 0 || ownedTotalAmount <= 0 || received <= 0) return 0;

  if (isFormalSalesAmount(contract)) {
    return Number(Math.min(received, ownedTotalAmount).toFixed(2));
  }

  const ownershipRatio = Math.min(Math.max(ownedTotalAmount / contractTotal, 0), 1);
  return Number(Math.min(received * ownershipRatio, ownedTotalAmount).toFixed(2));
};

const buildDerivedSalesAmountUpdate = (contract, derivedTotalAmount) => (
  isFormalSalesAmount(contract)
    ? {}
    : { totalAmount: Number(derivedTotalAmount || 0) }
);

module.exports = {
  SALES_AMOUNT_SOURCE,
  buildDerivedSalesAmountUpdate,
  getEffectiveSalesContractTotal,
  getEffectiveSalesReceived,
  isFormalSalesAmount,
  isJiesongOwnedPackingItem,
};
