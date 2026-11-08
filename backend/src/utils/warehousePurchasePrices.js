/**
 * Input: 角色、采购合同 id、提交的明细
 * Output: WAREHOUSE 提交的明细沿用库内单价（表单无价格，不得清零或改写）
 * Pos: OD-2；REST update 与 MCP update_purchase 共用
 */
const prisma = require('./prisma');

const keepStoredPrices = async (role, contractId, input) => {
  if (role !== 'WAREHOUSE' || !Array.isArray(input?.items)) return input;
  const stored = await prisma.purchaseItem.findMany({ where: { purchaseContractId: contractId }, select: { id: true, productId: true, unitPrice: true } });
  const pool = [...stored];
  const take = (match) => { const i = pool.findIndex(match); return i < 0 ? null : pool.splice(i, 1)[0]; };
  return {
    ...input,
    items: input.items.map((item) => {
      const hit = (item?.id && take((s) => s.id === item.id)) || take((s) => s.productId === item?.productId);
      return hit ? { ...item, unitPrice: hit.unitPrice } : item;
    }),
  };
};

module.exports = { keepStoredPrices };
