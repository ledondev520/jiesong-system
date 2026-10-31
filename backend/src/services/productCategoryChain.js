/**
 * Input: 带 product.categoryId 的明细、prisma 客户端
 * Output: 给每个 product 附上 categoryIds（分类 → 最近祖先 → … 的 ID 链）
 * Pos: 报价规则的分类加价（priceFor / markupFor）取最近已配置祖先时使用
 */

/** 沿 parentId 向上收集 ID，visited 防止脏数据成环 */
const chainFor = (categoryId, parentById) => {
  const chain = [];
  const visited = new Set();
  for (let id = categoryId; id && !visited.has(id); id = parentById.get(id)) {
    visited.add(id);
    chain.push(id);
  }
  return chain;
};

/** 没有任何商品带分类时不查库；否则一次读取分类表（体量很小） */
const withCategoryChains = async (items, prismaClient) => {
  if (!items.some((item) => item?.product?.categoryId)) return items;
  const rows = await prismaClient.productCategory.findMany({ select: { id: true, parentId: true } });
  const parentById = new Map(rows.map((row) => [row.id, row.parentId]));
  return items.map((item) => (item?.product?.categoryId
    ? { ...item, product: { ...item.product, categoryIds: chainFor(item.product.categoryId, parentById) } }
    : item));
};

/** 商品 ID → 分类链；未知商品或无分类的商品不在结果中（调用方按无分类处理） */
const categoryIdsByProduct = async (productIds, prismaClient) => {
  const ids = [...new Set(productIds.filter((id) => typeof id === 'string' && id))];
  if (!ids.length) return new Map();
  const products = await prismaClient.product.findMany({ where: { id: { in: ids } }, select: { id: true, categoryId: true } });
  const chained = await withCategoryChains(products.map((product) => ({ product })), prismaClient);
  return new Map(chained.map(({ product }) => [product.id, product.categoryIds || []]));
};

module.exports = { categoryIdsByProduct, chainFor, withCategoryChains };
