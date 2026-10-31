/**
 * Input: POST /pricing/preview 的 lines（costCny + productId 或 categoryId）与可选订单现汇 spotRate
 * Output: 每行的建议单价（与单据生成、订单创建共用 priceFor：整美元后取整到 5 的倍数）
 * Pos: 订单编辑器的实时报价预览；只读计算，不写库、不暴露 pricing.json 内容，仅 ADMIN/SALES/PURCHASE
 */
const prisma = require('../utils/prisma');
const { loadPricingConfig } = require('../services/pricingConfigService');
const { priceFor } = require('../services/exportPricing');
const { chainFor } = require('../services/productCategoryChain');
const { createError } = require('../middleware/errorHandler');
const { success } = require('../utils/response');

const MAX_LINES = 200;

const previewLines = async (req, res, next) => {
  try {
    const { lines, spotRate } = req.body || {};
    if (!Array.isArray(lines) || lines.length === 0 || lines.length > MAX_LINES) throw createError(`请提供 1 至 ${MAX_LINES} 行`, 400);
    if (spotRate !== undefined && (typeof spotRate !== 'number' || !Number.isFinite(spotRate) || spotRate <= 0)) throw createError('现汇必须为正数', 400);
    const productIds = [...new Set(lines.map((line) => line?.productId).filter((id) => typeof id === 'string' && id))];
    const [products, categories] = await Promise.all([
      productIds.length ? prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, categoryId: true } }) : [],
      prisma.productCategory.findMany({ select: { id: true, parentId: true } }),
    ]);
    const categoryOf = new Map(products.map((product) => [product.id, product.categoryId]));
    const parentById = new Map(categories.map((row) => [row.id, row.parentId]));
    const config = loadPricingConfig();
    const results = lines.map((line, index) => {
      if (!line || typeof line !== 'object' || Array.isArray(line)) throw createError(`第 ${index + 1} 行格式无效`, 400);
      const categoryId = typeof line.categoryId === 'string' && line.categoryId ? line.categoryId : categoryOf.get(line.productId);
      const priced = priceFor({
        costCny: line.costCny,
        categoryIds: categoryId ? chainFor(categoryId, parentById) : [],
        spotRate,
      }, config);
      return { index, status: priced.status, unitPriceUsd: priced.unitPriceUsd, markup: priced.markup ?? null, effectiveRate: priced.effectiveRate ?? null };
    });
    res.set('Cache-Control', 'no-store');
    return success(res, { results });
  } catch (error) {
    return next(error);
  }
};

module.exports = { previewLines };
