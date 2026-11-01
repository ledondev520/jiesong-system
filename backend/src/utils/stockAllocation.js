/**
 * Input: 带 inventories[{quantity}] 的销售明细（Inventory.salesItemId 分配）
 * Output: 已分配数量；是否被库存全额覆盖（无需采购）
 * Pos: 首页「订单待采购」与「生成采购单」共用口径（DASH-STOCK）；部分分配不算覆盖
 */
const allocatedQuantity = (item) => (item.inventories || []).reduce((sum, inv) => sum + inv.quantity, 0);
const isStockCovered = (item) => allocatedQuantity(item) + 1e-9 >= item.quantity;

module.exports = { allocatedQuantity, isStockCovered };
