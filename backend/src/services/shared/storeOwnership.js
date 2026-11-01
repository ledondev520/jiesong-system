/**
 * Input: 一组门店 ID 与订单/报价最终的客户 ID
 * Output: assertStoresOwnedBy —— 门店不存在抛 400，门店属于其他客户抛 400；返回门店行
 * Pos: 订单创建、报价新建/编辑/转换共用的持久化边界校验（评审 R1-3），防止把 A 客户的门店写进 B 客户的单据。
 *      旧数据策略：customerId 为 NULL 的门店（迁移 A 之前建的、默认客户回填尚未运行）对任何客户都放行，回填后自然受约束。
 */
const { createError } = require('../../middleware/errorHandler');

const assertStoresOwnedBy = async (db, storeIds, customerId) => {
  const ids = [...new Set((storeIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const stores = await db.store.findMany({ where: { id: { in: ids } }, select: { id: true, customerId: true } });
  if (stores.length !== ids.length) throw createError('商品或门店已不存在，请刷新后重新选择', 400);
  if (customerId && stores.some((store) => store.customerId && store.customerId !== customerId)) {
    throw createError('门店不属于所选客户，请重新选择门店', 400);
  }
  return stores;
};

module.exports = { assertStoresOwnedBy };
